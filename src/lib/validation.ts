// Esquemas de validação compartilhados entre formulário (cliente) e servidor.
// O servidor sempre revalida; o banco revalida de novo (restrições e RPCs).
import { z } from "zod";
import { isIsoDate, isMonday } from "./dates";
import { MAX_AMOUNT_CENTS, parseBRLToCents } from "./money";
import { isValidCpf, normalizeUsername, onlyDigits, passwordProblem, USERNAME_RE } from "./identity";

const isoDate = z.string().refine(isIsoDate, "Informe uma data válida.");

const amount = z
  .string()
  .trim()
  .min(1, "Informe o valor.")
  .refine((v) => parseBRLToCents(v) !== null, "Valor inválido. Exemplo: 150,00")
  .refine((v) => (parseBRLToCents(v) ?? 0) > 0, "O valor precisa ser maior que zero.")
  .refine((v) => (parseBRLToCents(v) ?? 0) <= MAX_AMOUNT_CENTS, "Valor acima do limite de R$ 100.000,00.");

const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo de ${max} caracteres.`).optional().or(z.literal(""));

const km = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^\d{1,6}([.,]\d)?$/.test(v), "Quilômetros inválidos. Exemplo: 120 ou 120,5");

export const expenseFormSchema = z.object({
  id: z.uuid(),
  occurredOn: isoDate,
  amount,
  categoryId: z.uuid("Escolha a categoria."),
  description: z.string().trim().min(1, "Descreva o gasto.").max(500, "Máximo de 500 caracteres."),
  grupo: z.enum(["percurso", "outras"]).optional(),
  km,
  origem: optionalText(120),
  destino: optionalText(120),
  clientes: optionalText(500),
  hasReceipt: z.boolean(),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const receiptFormSchema = z.object({
  id: z.uuid(),
  receivedOn: isoDate,
  weekStart: isoDate.refine(isMonday, "Semana inválida."),
  amount,
  description: optionalText(500),
});
export type ReceiptFormValues = z.infer<typeof receiptFormSchema>;

export const routeFormSchema = z.object({
  id: z.uuid(),
  occurredOn: isoDate,
  origem: z.string().trim().min(1, "Informe a origem.").max(120),
  destino: z.string().trim().min(1, "Informe o destino.").max(120),
  km,
  clientes: optionalText(500),
});
export type RouteFormValues = z.infer<typeof routeFormSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Informe o usuário.").max(64),
  password: z.string().min(1, "Informe a senha.").max(128),
});

export const changePasswordSchema = z
  .object({
    password: z.string().superRefine((v, ctx) => {
      const p = passwordProblem(v);
      if (p) ctx.addIssue({ code: "custom", message: p });
    }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

export const accountFormSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo.").max(120),
  // Opcional. Se preenchido, precisa ser válido.
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine((v) => v === "" || isValidCpf(v), "CPF inválido."),
  username: z
    .string()
    .transform(normalizeUsername)
    .refine((v) => USERNAME_RE.test(v), "Use de 3 a 32 letras minúsculas, números, ponto, hífen ou sublinhado."),
  role: z.enum(["funcionario", "visualizador", "gestor", "admin"]),
  avatar: z.enum(["masculino", "feminino", "neutro"]),
  // Unidade da pessoa (ex.: NRT, SUL); opcional.
  unit: z.string().trim().max(40, "Máximo de 40 caracteres.").optional().default(""),
  // Só na criação: senha temporária (padrão) ou definida pelo Administrador.
  passwordMode: z.enum(["temporaria", "definida"]).optional().default("temporaria"),
  password: z.string().optional().default(""),
  confirm: z.string().optional().default(""),
}).superRefine((v, ctx) => {
  if (v.passwordMode !== "definida") return;
  const problem = passwordProblem(v.password);
  if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
  else if (v.password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "As senhas não conferem." });
});
export type AccountFormValues = z.input<typeof accountFormSchema>;

export const categoryFormSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome.").max(60),
  grupo: z.enum(["percurso", "outras"]),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

export const reopenSchema = z.object({
  employeeId: z.uuid(),
  weekStart: isoDate.refine(isMonday),
  reason: z.string().trim().min(5, "Informe o motivo (mínimo de 5 caracteres).").max(500),
});

export const reportFilterSchema = z.object({
  employeeIds: z.array(z.uuid()).default([]),
  from: isoDate.optional(),
  to: isoDate.optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  categoryIds: z.array(z.uuid()).default([]),
  status: z.enum(["aberta", "acertada"]).optional(),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export function kmToNumber(v: string | undefined): number | null {
  if (!v) return null;
  return Number(v.replace(",", "."));
}

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
