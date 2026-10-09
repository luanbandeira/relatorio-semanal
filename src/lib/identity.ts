// Identidade: CPF, usuário de acesso e senha temporária.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const d = cpf.split("").map(Number);
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = (s * 10) % 11 % 10;
    if (r !== d[n]) return false;
  }
  return true;
}

export function formatCpf(value: string): string {
  const c = onlyDigits(value).padEnd(11, " ");
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`.trim();
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Identificador interno usado no Supabase Auth. Não é e-mail real e nunca
 * recebe mensagens; o funcionário só conhece o usuário de acesso.
 */
export function authEmailFor(username: string, domain: string): string {
  return `${normalizeUsername(username)}@${domain}`;
}

/**
 * Senha temporária de primeiro acesso: 6 números,
 * individual e aleatória. Proteções: troca obrigatória no primeiro acesso,
 * validade limitada e bloqueio após 5 tentativas erradas em 15 minutos.
 */
export function generateTempPassword(random: (max: number) => number = cryptoRandom): string {
  return String(random(1_000_000)).padStart(6, "0");
}

function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let x: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export const PASSWORD_MIN = 8;

/** Política de senha definitiva (proposta aprovada: mínimo 8, com letra e número). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (pw.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
  return null;
}
