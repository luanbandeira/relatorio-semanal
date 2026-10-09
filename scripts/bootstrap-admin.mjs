// Cria o primeiro Administrador com senha temporária individual (troca obrigatória
// no primeiro acesso). Recusa se já existir algum Administrador.
//
// Uso: node scripts/bootstrap-admin.mjs --nome "Nome Completo" [--cpf 00000000000] --usuario nome.sobrenome
// Requer SUPABASE_SECRET_KEY e NEXT_PUBLIC_SUPABASE_URL em .env.local.
import { createClient } from "@supabase/supabase-js";
import { webcrypto } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const nome = arg("nome");
const cpf = (arg("cpf") ?? "").replace(/\D/g, "");
const usuario = (arg("usuario") ?? "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .trim()
  .toLowerCase();

if (!nome || (cpf && cpf.length !== 11) || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(usuario)) {
  console.error('Uso: node scripts/bootstrap-admin.mjs --nome "Nome Completo" [--cpf 00000000000] --usuario nome.sobrenome');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const domain = process.env.AUTH_USERNAME_DOMAIN || "usuarios.exemplo.local";
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
  process.exit(1);
}

const rnd = (max) => webcrypto.getRandomValues(new Uint32Array(1))[0] % max;
const temp = String(rnd(1_000_000)).padStart(6, "0"); // 6 números, troca obrigatória

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: count, error: countError } = await admin.rpc("service_count_admins");
if (countError) {
  console.error("Falha ao consultar o banco:", countError.message);
  process.exit(1);
}
if (count > 0) {
  console.error("Já existe Administrador. Use o sistema para criar outras contas.");
  process.exit(1);
}

const { data: created, error } = await admin.auth.admin.createUser({
  email: `${usuario}@${domain}`,
  password: temp,
  email_confirm: true,
});
if (error) {
  console.error("Falha ao criar usuário de autenticação:", error.message);
  process.exit(1);
}

const { error: profileError } = await admin.rpc("service_bootstrap_admin", {
  p_id: created.user.id,
  p_full_name: nome,
  p_cpf: cpf || null,
  p_username: usuario,
});
if (profileError) {
  await admin.auth.admin.deleteUser(created.user.id);
  console.error("Falha ao criar perfil (usuário removido):", profileError.message);
  process.exit(1);
}

console.log("Administrador criado.");
console.log(`Usuário: ${usuario}`);
console.log(`Senha temporária (mostrada só agora; troca obrigatória no primeiro acesso): ${temp}`);
