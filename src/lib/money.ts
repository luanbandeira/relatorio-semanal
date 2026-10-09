// Valores monetários sempre em centavos inteiros. Nada de ponto flutuante
// para cálculo: a conversão de texto é feita por dígitos.

export const MAX_AMOUNT_CENTS = 10_000_000; // R$ 100.000,00 por lançamento

/**
 * Converte o texto digitado ("150", "150,5", "1.234,56", "R$ 12,30") em
 * centavos. Retorna null se o texto não for um valor válido.
 */
export function parseBRLToCents(input: string): number | null {
  const raw = input.replace(/R\$|\s/g, "").trim();
  if (!raw) return null;
  // Aceita separador de milhar "." e decimal ",". Também aceita "12.30"
  // (ponto decimal) quando não houver vírgula e houver 1-2 casas depois do ponto.
  let normalized: string;
  if (raw.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(raw)) return null;
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    normalized = raw;
  } else {
    if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(raw)) return null;
    normalized = raw.replace(/\./g, "");
  }
  const [intPart, fracPart = ""] = normalized.split(".");
  if (intPart.length > 9) return null;
  const cents = Number(intPart) * 100 + Number((fracPart + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos como "R$ 1.234,56". */
export function formatCents(cents: number | bigint | string | null | undefined): string {
  const n = typeof cents === "bigint" ? Number(cents) : Number(cents ?? 0);
  // Divisão apenas para exibição; somas continuam em inteiros.
  return brl.format(n / 100).replace(/ /g, " ");
}

/** Centavos -> texto para campo de edição ("1234,56"). */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Soma inteira de centavos (valores vindos do banco podem chegar como string). */
export function sumCents(values: Array<number | string | bigint | null | undefined>): number {
  let total = 0;
  for (const v of values) total += Number(v ?? 0);
  if (!Number.isSafeInteger(total)) throw new Error("Soma monetária fora do intervalo seguro");
  return total;
}
