import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

// Segredos: somente servidor. Nunca prefixar com NEXT_PUBLIC_.
export const serverEnv = {
  get secretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get authUsernameDomain() {
    return process.env.AUTH_USERNAME_DOMAIN || "usuarios.exemplo.local";
  },
};
