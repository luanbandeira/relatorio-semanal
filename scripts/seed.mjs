// Popula um Supabase LOCAL com dados fictícios de demonstração.
//
//   npx supabase start
//   npm run seed
//
// Cria um Administrador, um Gestor e quatro funcionários de campo com seis
// semanas de uso simulado: despesas com e sem comprovante, valores recebidos,
// percursos, semanas acertadas e casos com valor a receber da empresa.
// Tudo passa pelas mesmas funções do banco usadas pelo app (regras, bloqueio
// de semana acertada e auditoria valem). Só roda contra o banco local.
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import pg from "pg";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const SENHA = "Demo12345";
const REASON = "Dados de demonstração";
const domain = process.env.AUTH_USERNAME_DOMAIN || "usuarios.exemplo.local";
const LOCAL = /^(https?:\/\/|postgres(ql)?:\/\/[^@]*@)(localhost|127\.0\.0\.1)[:/]/;

if (!LOCAL.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") || !LOCAL.test(process.env.DATABASE_URL ?? "")) {
  console.error("Seed recusado: só roda contra o Supabase local (npx supabase start).");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------------
// Datas (calendário de São Paulo) e sorteio determinístico
// ---------------------------------------------------------------------------
const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (iso) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -(dow === 0 ? 6 : dow - 1));
};

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261005);
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];

// ---------------------------------------------------------------------------
// Cadastros fictícios
// ---------------------------------------------------------------------------
const EQUIPE = [
  { username: "ana.souza", nome: "Ana Souza", unit: "NRT", avatar: "feminino", base: "São Paulo", perfil: "estavel" },
  { username: "bruno.lima", nome: "Bruno Lima", unit: "SUL", avatar: "masculino", base: "Campinas", perfil: "viagens" },
  { username: "carla.dias", nome: "Carla Dias", unit: "NRT", avatar: "feminino", base: "Sorocaba", perfil: "deve" },
  { username: "diego.rocha", nome: "Diego Rocha", unit: "CENTRO", avatar: "masculino", base: "Jundiaí", perfil: "estavel" },
];
const CIDADES = ["Campinas", "Sorocaba", "Jundiaí", "Piracicaba", "Santos", "São José dos Campos", "Ribeirão Preto", "Bauru"];
const CLIENTES = [
  "Distribuidora Horizonte", "Mercado Bom Preço", "Rede Farma Vida", "Atacadão Estrela",
  "Papelaria Central", "Clínica Bem Estar", "Auto Peças Avenida", "Padaria Aurora",
];
const KM = { "São Paulo": 0, Campinas: 95, Sorocaba: 100, "Jundiaí": 60, Piracicaba: 160, Santos: 75, "São José dos Campos": 95, "Ribeirão Preto": 315, Bauru: 330 };

function comprovantePdf(titulo, linhas, total) {
  const doc = new jsPDF({ unit: "mm", format: [80, 120] });
  doc.setFontSize(9);
  doc.text("COMPROVANTE DE EXEMPLO", 40, 10, { align: "center" });
  doc.text("(demonstração - sem valor fiscal)", 40, 15, { align: "center" });
  doc.setFontSize(11);
  doc.text(titulo, 40, 25, { align: "center" });
  doc.setFontSize(9);
  linhas.forEach((l, i) => doc.text(l, 6, 35 + i * 6));
  doc.setFontSize(12);
  doc.text(`TOTAL R$ ${total}`, 6, 35 + linhas.length * 6 + 8);
  return Buffer.from(doc.output("arraybuffer"));
}
const reais = (c) => (c / 100).toFixed(2).replace(".", ",");

// ---------------------------------------------------------------------------
async function criarConta(username, nome, role, avatar, unit = null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@${domain}`,
    password: SENHA,
    email_confirm: true,
  });
  if (error) throw new Error(`Conta ${username}: ${error.message}`);
  await db.query(
    `insert into public.profiles (id, full_name, username, role, avatar, unit, must_change_password)
     values ($1, $2, $3, $4, $5, $6, false)`,
    [data.user.id, nome, username, role, avatar, unit],
  );
  return data.user.id;
}

/** Executa as próximas consultas como o usuário (RLS e funções valem). */
async function como(uid) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
  await db.query("set local role authenticated");
}

async function main() {
  await db.connect();
  const { rows: existentes } = await db.query("select count(*)::int as n from public.profiles");
  if (existentes[0].n > 0) {
    console.error("O banco já tem usuários. Para recomeçar: npx supabase db reset");
    process.exit(1);
  }

  const W0 = weekStart(todayLocal());
  const semanas = [-5, -4, -3, -2, -1, 0].map((k) => addDays(W0, k * 7));

  await db.query("begin");
  await db.query("select set_config('app.reason', $1, true)", [REASON]);
  await db.query("update public.app_settings set value = to_jsonb($1::text) where key = 'data_inicio_operacao'", [semanas[0]]);
  const adminId = await criarConta("admin", "Administrador Demo", "admin", "neutro");
  await criarConta("gestor", "Gestora Demo", "gestor", "feminino");
  const equipe = [];
  for (const p of EQUIPE) equipe.push({ ...p, id: await criarConta(p.username, p.nome, "funcionario", p.avatar, p.unit) });
  await db.query("commit");

  const C = {};
  for (const r of (await db.query("select id, name from public.categories")).rows) C[r.name] = r.id;

  const hoje = todayLocal();
  let anexos = 0;
  for (const p of equipe) {
    const enviar = [];
    await db.query("begin");
    await db.query("select set_config('app.reason', $1, true)", [REASON]);
    await como(p.id);
    const despesa = (data, cents, cat, desc, opts = {}) =>
      db.query("select public.save_expense($1, $2, $3, $4, $5, $6, null, $7, $8, $9, $10, $11)", [
        opts.id ?? randomUUID(), p.id, data, cents, C[cat], desc,
        opts.km ?? null, opts.origem ?? null, opts.destino ?? null, opts.clientes ?? null, opts.comprovante ?? false,
      ]);
    const recebido = (data, cents, desc) =>
      db.query("select public.save_receipt($1, $2, $3, $4, $5)", [randomUUID(), p.id, data, cents, desc]);
    const percurso = (data, origem, destino, km, clientes) =>
      db.query("select public.save_route($1, $2, $3, $4, $5, $6, $7)", [randomUUID(), p.id, data, origem, destino, km, clientes]);

    let saldo = 0; // crédito que passa de uma semana para a outra
    for (const [i, W] of semanas.entries()) {
      // Na semana atual, só lança até hoje.
      const dias = [0, 1, 2, 3, 4].map((d) => addDays(W, d)).filter((d) => d <= hoje);
      if (!dias.length) continue;
      let gasto = 0;
      const lancar = despesa;
      const despesaSemana = (data, cents, ...resto) => {
        gasto += cents;
        return lancar(data, cents, ...resto);
      };

      for (const dia of dias) {
        const destino = escolher(CIDADES.filter((c) => c !== p.base));
        const km = (KM[p.base] ?? 0) + KM[destino] + entre(5, 40);
        const clientes = [escolher(CLIENTES), escolher(CLIENTES)].filter((c, k, a) => a.indexOf(c) === k).join("; ");
        if (rnd() < 0.7) {
          await percurso(dia, p.base, destino, km, clientes);
          const litros = Math.round(km / 11);
          const valor = litros * 619;
          const comprovante = rnd() < 0.5;
          const id = randomUUID();
          await despesaSemana(dia, valor, "Combustível", `Abastecimento para visita em ${destino}`, {
            id, km, origem: p.base, destino, clientes, comprovante,
          });
          if (comprovante && enviar.length < 3) {
            enviar.push({ id, pdf: comprovantePdf("POSTO EXEMPLO", [`Gasolina comum ${litros},0 L`, destino], reais(valor)) });
          }
          if (rnd() < 0.4) await despesaSemana(dia, entre(8, 30) * 100, "Estacionamento e pedágio", `Pedágio ${p.base} - ${destino}`, { comprovante: true });
        }
        await despesaSemana(dia, entre(28, 65) * 100, "Alimentação", rnd() < 0.5 ? `Almoço em ${destino}` : "Almoço com cliente", { comprovante: rnd() < 0.6 });
        if (p.perfil === "viagens" && rnd() < 0.3) {
          await despesaSemana(dia, entre(160, 260) * 100, "Hospedagem", `Hotel em ${destino} (1 diária)`, { comprovante: true });
        }
      }
      if (rnd() < 0.3) await despesaSemana(dias[0], entre(15, 45) * 100, "Impressão", "Impressão de material para clientes");

      // Recebimentos da semana: cobrem o gasto e deixam um pequeno crédito,
      // arredondados como uma transferência real. Na carla.dias, a última
      // semana encerrada fica com R$ 80,00 a receber da empresa.
      const deve = p.perfil === "deve" && i === semanas.length - 2;
      const alvo = deve ? gasto - saldo - 8000 : Math.ceil((gasto - saldo + entre(20, 80) * 100) / 5000) * 5000;
      const beneficio = alvo > 20000 && rnd() < 0.5 ? 10000 : 0;
      if (alvo - beneficio > 0) await recebido(W, alvo - beneficio, "Transferência da empresa");
      if (beneficio) await recebido(dias[Math.min(2, dias.length - 1)], beneficio, "Cartão benefício");
      saldo = deve ? saldo : saldo + Math.max(alvo, 0) - gasto;
    }

    // Comprovantes de exemplo no Storage privado, registrados pela função do banco.
    for (const f of enviar) {
      const attId = randomUUID();
      const path = `${p.id}/${f.id}/${attId}.pdf`;
      const { error } = await admin.storage.from("comprovantes").upload(path, f.pdf, { contentType: "application/pdf" });
      if (error) throw new Error(`Comprovante: ${error.message}`);
      await db.query("select public.register_attachment($1, $2, $3, $4)", [attId, f.id, path, "comprovante.pdf"]);
      anexos++;
    }

    // Acerto das semanas terminadas, em ordem; para na primeira com valor a receber.
    await como(adminId);
    for (const W of semanas.slice(0, -1)) {
      await db.query("savepoint acerto");
      try {
        await db.query("select public.settle_week($1, $2)", [p.id, W]);
        await db.query("release savepoint acerto");
      } catch {
        await db.query("rollback to savepoint acerto");
        break;
      }
    }
    await db.query("reset role");
    await db.query("commit");
    process.stdout.write(".");
  }

  const { rows: resumo } = await db.query(
    `select (select count(*) from public.expenses)::int as despesas,
            (select count(*) from public.receipts)::int as recebimentos,
            (select count(*) from public.routes)::int as percursos,
            (select count(*) from public.employee_weeks where status = 'acertada')::int as acertadas`,
  );
  const r = resumo[0];
  console.log(`\n${r.despesas} despesas, ${r.recebimentos} recebimentos, ${r.percursos} percursos, ${anexos} comprovantes, ${r.acertadas} semanas acertadas.\n`);
  console.log(`Acesse http://localhost:3000 (senha de todos: ${SENHA}):`);
  console.log("  admin        Administrador");
  console.log("  gestor       Gestor");
  for (const p of EQUIPE) console.log(`  ${p.username.padEnd(12)} Funcionário (${p.unit})`);
}

main()
  .catch(async (e) => {
    await db.query("rollback").catch(() => {});
    console.error("\nSeed interrompido:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.end());
