// Impede que texto digitado por usuários vire fórmula ao abrir a planilha
// (CSV/Formula injection): prefixa com apóstrofo valores que começam com
// caracteres interpretados como fórmula.
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

export function safeCellText(value: string | null | undefined): string {
  const v = (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return FORMULA_START.test(v) ? `'${v}` : v;
}

/** Texto seguro para PDF com fonte padrão (WinAnsi): troca caracteres fora do conjunto. */
export function pdfText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\u0009\u000A -~ -ÿ]/g, "?");
}
