// Executa os testes de banco (supabase/tests/*.sql) e o teste de concorrência
// entre lançamento e acerto. Tudo roda em transações desfeitas ao final.
// Requer DATABASE_URL em .env.local (conexão direta ou session pooler).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente em .env.local — testes de banco NÃO executados.");
  process.exit(1);
}

// Supabase local (npx supabase start) não usa SSL; o remoto exige.
const ssl = /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : { rejectUnauthorized: false };
let failures = 0;

async function runSqlSuites() {
  const dir = path.join("supabase", "tests");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const client = new pg.Client({ connectionString: url, ssl });
    await client.connect();
    const sql = await readFile(path.join(dir, file), "utf8");
    try {
      await client.query(sql);
      console.error(`FALHOU ${file}: bloco terminou sem TESTS_OK`);
      failures++;
    } catch (err) {
      if (String(err.message).startsWith("TESTS_OK")) {
        console.log(`ok  ${file}: ${err.message}`);
      } else {
        console.error(`FALHOU ${file}: ${err.message}`);
        failures++;
      }
    } finally {
      await client.end();
    }
  }
}

// Acerto e lançamento simultâneos na mesma semana: o lançamento precisa
// esperar o acerto e ser recusado (SEMANA_ACERTADA) — nunca escapar da soma.
async function runConcurrency() {
  const setup = new pg.Client({ connectionString: url, ssl });
  const a = new pg.Client({ connectionString: url, ssl });
  const b = new pg.Client({ connectionString: url, ssl });
  await Promise.all([setup.connect(), a.connect(), b.connect()]);

  const ges = "00000000-0000-4000-8000-0000000000c2";
  const emp = "00000000-0000-4000-8000-0000000000c1";
  const week = "2026-09-28";
  const name = "concorrência acerto x lançamento";

  const login = async (c, uid) => {
    await c.query("reset role");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
  };

  try {
    // Fixtures confirmadas (removidas no finally).
    await setup.query("begin");
    await setup.query(
      `insert into auth.users (id, email) values ($1, 'conc-emp@teste.invalid'), ($2, 'conc-ges@teste.invalid')`,
      [emp, ges],
    );
    await setup.query(
      `insert into public.profiles (id, full_name, cpf, username, role, must_change_password) values
        ($1, 'Conc Func', '93786579741', 'teste.conc.func', 'funcionario', false),
        ($2, 'Conc Gestor', '54323194897', 'teste.conc.ges', 'gestor', false)`,
      [emp, ges],
    );
    await setup.query("commit");

    const cat = (await setup.query(`select id from public.categories where name = 'Alimentação'`)).rows[0].id;

    // Lançamento inicial confirmado.
    await a.query("begin");
    await login(a, emp);
    await a.query(
      `select public.save_receipt(gen_random_uuid(), $1, $2, 10000, 'r')`,
      [emp, week],
    );
    await a.query("commit");

    // A: gestor inicia o acerto e segura a trava da semana.
    await a.query("begin");
    await login(a, ges);
    await a.query(`select public.settle_week($1, $2)`, [emp, week]);

    // B: funcionário tenta lançar ao mesmo tempo (fica esperando a trava).
    await b.query("begin");
    await login(b, emp);
    const pending = b
      .query(`select public.save_expense(gen_random_uuid(), $1, $2, 500, $3, 'concorrente')`, [emp, week, cat])
      .then(() => "aceito", (e) => e.message);

    await new Promise((r) => setTimeout(r, 1500));
    await a.query("commit");
    const outcome = await pending;
    await b.query("rollback");

    const snap = (
      await setup.query(`select spent_cents, received_cents from public.settlements where employee_id = $1 and valid`, [emp])
    ).rows[0];
    const spentNow = (
      await setup.query(
        `select coalesce(sum(amount_cents),0)::int s from public.expenses where employee_id = $1 and deleted_at is null`,
        [emp],
      )
    ).rows[0].s;

    if (outcome.includes("SEMANA_ACERTADA") && Number(snap.spent_cents) === spentNow) {
      console.log(`ok  ${name}: lançamento concorrente recusado; soma do acerto confere`);
    } else {
      console.error(`FALHOU ${name}: resultado=${outcome} snapshot=${JSON.stringify(snap)} gasto=${spentNow}`);
      failures++;
    }
  } finally {
    await a.query("rollback").catch(() => {});
    await b.query("rollback").catch(() => {});
    await setup.query("rollback").catch(() => {});
    // Limpeza das fixtures (ordem respeita chaves estrangeiras).
    await setup.query("begin");
    await setup.query(`delete from public.settlements where employee_id = any($1)`, [[emp, ges]]);
    // Semana acertada bloqueia exclusão de lançamentos: reabre antes de limpar.
    await setup.query(`update public.employee_weeks set status = 'aberta' where employee_id = any($1)`, [[emp, ges]]);
    for (const t of ["attachments", "expenses", "receipts", "routes"]) {
      await setup.query(`delete from public.${t} where employee_id = any($1)`, [[emp, ges]]);
    }
    await setup.query(`delete from public.employee_weeks where employee_id = any($1)`, [[emp, ges]]);
    await setup.query(`delete from public.profiles where id = any($1)`, [[emp, ges]]);
    // Por último: a remoção dos perfis também gera eventos de auditoria.
    await setup.query(`delete from public.audit_events where employee_id = any($1) or actor_id = any($1)`, [[emp, ges]]);
    await setup.query(`delete from auth.users where id = any($1)`, [[emp, ges]]);
    await setup.query("commit");
    await Promise.all([setup.end(), a.end(), b.end()]);
  }
}

await runSqlSuites();
await runConcurrency();

if (failures > 0) {
  console.error(`\n${failures} suíte(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes de banco passaram.");
