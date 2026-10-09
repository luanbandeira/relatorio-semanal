import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

dotenv.config({ path: ".env.local", quiet: true });

export const PREFIX = "teste.e2e.";
const STATE = path.join("tests", "e2e", ".state.json");

export type Person = { id: string; username: string; password: string; name: string };
export type State = Record<"ana" | "bia" | "novo" | "caio" | "gestor" | "visual" | "admin", Person>;

const PEOPLE: { key: keyof State; name: string; cpf: string; role: string; mustChange: boolean }[] = [
  { key: "ana", name: "Ana Teste E2E", cpf: "52601815906", role: "funcionario", mustChange: false },
  { key: "bia", name: "Bia Teste E2E", cpf: "08301661305", role: "funcionario", mustChange: false },
  { key: "novo", name: "Novo Teste E2E", cpf: "18609139034", role: "funcionario", mustChange: true },
  { key: "caio", name: "Caio Teste E2E", cpf: "99603082430", role: "funcionario", mustChange: false },
  { key: "gestor", name: "Gestor Teste E2E", cpf: "62819482112", role: "gestor", mustChange: false },
  { key: "visual", name: "Visualizador Teste E2E", cpf: "99351819019", role: "visualizador", mustChange: false },
  { key: "admin", name: "Administrador Teste E2E", cpf: "93786579741", role: "admin", mustChange: false },
];

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function db() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

const domain = () => process.env.AUTH_USERNAME_DOMAIN || "usuarios.exemplo.local";

export async function createFixtures(): Promise<State> {
  await removeFixtures();
  const a = admin();
  const c = await db();
  const state = {} as State;
  try {
    for (const p of PEOPLE) {
      const username = `${PREFIX}${p.key}`;
      const password = `e2e-${randomBytes(6).toString("hex")}-9`;
      const { data, error } = await a.auth.admin.createUser({
        email: `${username}@${domain()}`,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      await c.query(
        `insert into public.profiles (id, full_name, cpf, username, role, must_change_password, temp_password_expires_at)
         values ($1, $2, $3, $4, $5, $6, now() + interval '1 day')`,
        [data.user.id, p.name, p.cpf, username, p.role, p.mustChange],
      );
      state[p.key] = { id: data.user.id, username, password, name: p.name };
    }
  } finally {
    await c.end();
  }
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  return state;
}

export function loadState(): State {
  return JSON.parse(readFileSync(STATE, "utf8"));
}

/** Remove todas as contas "teste.e2e.*" e tudo o que elas geraram. */
export async function removeFixtures() {
  const a = admin();
  const c = await db();
  try {
    const { rows } = await c.query(`select id from public.profiles where username like $1`, [`${PREFIX}%`]);
    const ids = rows.map((r) => r.id as string);
    if (ids.length) {
      const files = await c.query(`select storage_path from public.attachments where employee_id = any($1)`, [ids]);
      if (files.rows.length) await a.storage.from("comprovantes").remove(files.rows.map((r) => r.storage_path));
      const photos = await c.query(`select photo_path from public.profiles where id = any($1) and photo_path is not null`, [ids]);
      if (photos.rows.length) await a.storage.from("fotos").remove(photos.rows.map((r) => r.photo_path));

      await c.query("begin");
      await c.query(`delete from public.settlements where employee_id = any($1)`, [ids]);
      await c.query(`update public.employee_weeks set status = 'aberta' where employee_id = any($1)`, [ids]);
      for (const t of ["attachments", "expenses", "receipts", "routes"]) {
        await c.query(`delete from public.${t} where employee_id = any($1)`, [ids]);
      }
      await c.query(`delete from public.employee_weeks where employee_id = any($1)`, [ids]);
      await c.query(`delete from public.support_sessions where employee_id = any($1) or admin_id = any($1)`, [ids]);
      await c.query(`delete from public.profiles where id = any($1)`, [ids]);
      await c.query(`delete from public.audit_events where employee_id = any($1) or actor_id = any($1)`, [ids]);
      await c.query("commit");
      for (const id of ids) await a.auth.admin.deleteUser(id);
    }
    // Usuários de Auth órfãos (ex.: teste interrompido antes do perfil).
    const { data } = await a.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email?.startsWith(PREFIX)) await a.auth.admin.deleteUser(u.id);
    }
    await c.query(`delete from public.login_attempts where username like $1`, [`${PREFIX}%`]);
  } finally {
    await c.end();
  }
  if (existsSync(STATE)) rmSync(STATE);
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = await db();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}
