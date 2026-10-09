import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Cliente privilegiado (chave secreta). Uso exclusivo em rotas de servidor
 * para criação de contas, redefinição de senha, URLs assinadas e limites de
 * tentativa. Nunca importar em componentes de cliente.
 */
export function createAdminClient() {
  return createClient(SUPABASE_URL, serverEnv.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
