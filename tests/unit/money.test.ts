import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseBRLToCents, sumCents } from "@/lib/money";

describe("parseBRLToCents", () => {
  it.each([
    ["150", 15000],
    ["150,5", 15050],
    ["150,50", 15050],
    ["0,01", 1],
    ["1.234,56", 123456],
    ["R$ 12,30", 1230],
    ["12.30", 1230],
    ["1.000", 100000],
    ["35,50", 3550],
  ])("%s -> %i centavos", (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "1,234", "12,345", "1.23.4", "-5", "1e3", "10,,0"])("rejeita %s", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("não sofre erro de ponto flutuante (0,1 + 0,2)", () => {
    expect(sumCents([parseBRLToCents("0,10"), parseBRLToCents("0,20")])).toBe(30);
  });
});

describe("formatação", () => {
  it("formata centavos em reais", () => {
    expect(formatCents(123456)).toBe("R$ 1.234,56");
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents("5000")).toBe("R$ 50,00");
  });
  it("converte para texto de edição", () => {
    expect(centsToInput(15050)).toBe("150,50");
    expect(centsToInput(7)).toBe("0,07");
  });
});

describe("regras de saldo (espelham o banco)", () => {
  // S = C + R - D; positivo = crédito; negativo = valor a acertar
  const saldo = (c: number, r: number, d: number) => c + r - d;
  it("CA07: 50 + 200 - 230 = 20", () => {
    const s1 = saldo(0, 30000, 25000);
    expect(s1).toBe(5000);
    expect(saldo(s1, 20000, 23000)).toBe(2000);
  });
  it("CA08: 300 - 350 deixa 50 a acertar; complemento zera", () => {
    expect(-saldo(0, 30000, 35000)).toBe(5000);
    expect(saldo(0, 30000 + 5000, 35000)).toBe(0);
  });
});
