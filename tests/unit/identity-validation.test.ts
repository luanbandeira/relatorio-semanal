import { describe, expect, it } from "vitest";
import { authEmailFor, formatCpf, generateTempPassword, isValidCpf, normalizeUsername, passwordProblem } from "@/lib/identity";
import { accountFormSchema, changePasswordSchema, expenseFormSchema, receiptFormSchema } from "@/lib/validation";
import { codeFromError, friendlyError, GENERIC_ERROR } from "@/lib/errors";

describe("CPF", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata", () => expect(formatCpf("52998224725")).toBe("529.982.247-25"));
});

describe("usuário de acesso", () => {
  it("normaliza acentos e maiúsculas", () => expect(normalizeUsername("  João.Silva ")).toBe("joao.silva"));
  it("gera identificador interno (não é e-mail real)", () =>
    expect(authEmailFor("Joao.Silva", "usuarios.exemplo.local")).toBe("joao.silva@usuarios.exemplo.local"));
});

describe("senhas", () => {
  it("senha temporária: 6 números aleatórios", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).toMatch(/^\d{6}$/);
    expect(generateTempPassword(() => 42)).toBe("000042");
    // Não serve como senha definitiva: a troca no primeiro acesso exige letras e números.
    expect(passwordProblem(a)).not.toBeNull();
    // Probabilidade de colisão desprezível; garante que não é senha fixa.
    expect(new Set([a, b, generateTempPassword(), generateTempPassword()]).size).toBeGreaterThan(1);
  });
  it("política: mínimo 8, letras e números", () => {
    expect(passwordProblem("abc12")).not.toBeNull();
    expect(passwordProblem("abcdefgh")).not.toBeNull();
    expect(passwordProblem("abcd1234")).toBeNull();
  });
  it("confirmação precisa conferir", () => {
    expect(changePasswordSchema.safeParse({ password: "abcd1234", confirm: "abcd1235" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ password: "abcd1234", confirm: "abcd1234" }).success).toBe(true);
  });
});

describe("formulários", () => {
  const base = {
    id: "3f1e2d4c-5b6a-4789-8abc-def012345678",
    occurredOn: "2026-09-28",
    amount: "150,00",
    categoryId: "4a1e2d4c-5b6a-4789-8abc-def012345678",
    description: "Abastecimento",
    hasReceipt: true,
  };
  it("despesa: opcionais não bloqueiam salvamento; comprovante sim sem anexo é aceito (CA13)", () => {
    expect(expenseFormSchema.safeParse(base).success).toBe(true);
  });
  it("despesa: obrigatórios", () => {
    for (const k of ["occurredOn", "amount", "categoryId", "description"] as const) {
      const r = expenseFormSchema.safeParse({ ...base, [k]: "" });
      expect(r.success, k).toBe(false);
    }
    expect(expenseFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, amount: "-3" }).success).toBe(false);
  });
  it("recebimento: descrição opcional, semana precisa ser segunda", () => {
    const r = { id: base.id, receivedOn: "2026-09-30", weekStart: "2026-09-28", amount: "300", description: "" };
    expect(receiptFormSchema.safeParse(r).success).toBe(true);
    expect(receiptFormSchema.safeParse({ ...r, weekStart: "2026-09-29" }).success).toBe(false);
  });
  it("conta: CPF e usuário validados", () => {
    const ok = accountFormSchema.safeParse({
      fullName: "Maria Souza",
      cpf: "529.982.247-25",
      username: "Maria.Souza",
      role: "funcionario",
      avatar: "feminino",
    });
    expect(ok.success && ok.data.cpf).toBe("52998224725");
    expect(ok.success && ok.data.username).toBe("maria.souza");
    expect(
      accountFormSchema.safeParse({ fullName: "Maria", cpf: "000", username: "m", role: "funcionario", avatar: "neutro" }).success,
    ).toBe(false);
  });
  it("conta: senha definida pelo Administrador segue a política e precisa conferir", () => {
    const base = { fullName: "José Lima", cpf: "", username: "jose.lima", role: "funcionario", avatar: "neutro" } as const;
    expect(accountFormSchema.safeParse(base).success).toBe(true); // padrão: temporária
    expect(accountFormSchema.safeParse({ ...base, passwordMode: "definida", password: "123456", confirm: "123456" }).success).toBe(false);
    expect(accountFormSchema.safeParse({ ...base, passwordMode: "definida", password: "abcd1234", confirm: "abcd1235" }).success).toBe(false);
    expect(accountFormSchema.safeParse({ ...base, passwordMode: "definida", password: "abcd1234", confirm: "abcd1234" }).success).toBe(true);
  });
  it("conta: CPF é opcional, mas se preenchido precisa ser válido", () => {
    const base = { fullName: "José Lima", username: "jose.lima", role: "funcionario", avatar: "neutro" } as const;
    const empty = accountFormSchema.safeParse({ ...base, cpf: "" });
    expect(empty.success && empty.data.cpf).toBe("");
    expect(accountFormSchema.safeParse({ ...base, cpf: "123.456.789-00" }).success).toBe(false);
  });
});

describe("erros do banco", () => {
  it("traduz códigos conhecidos e não vaza mensagens técnicas", () => {
    expect(codeFromError({ message: "SEMANA_ACERTADA" })).toBe("SEMANA_ACERTADA");
    expect(friendlyError({ message: "SALDO_NEGATIVO" })).toMatch(/falta dinheiro/);
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "x"' })).toBe(GENERIC_ERROR);
  });
});
