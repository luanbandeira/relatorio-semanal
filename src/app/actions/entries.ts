"use server";

import { revalidatePath } from "next/cache";
import { getViewer, subjectOf } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";
import {
  expenseFormSchema,
  fieldErrorsFrom,
  kmToNumber,
  receiptFormSchema,
  routeFormSchema,
  type ExpenseFormValues,
  type ReceiptFormValues,
  type RouteFormValues,
} from "@/lib/validation";
import { type ActionResult, fail, friendlyError } from "@/lib/errors";
import { z } from "zod";

/**
 * Contexto de escrita: funcionário ativo gravando os próprios lançamentos, ou
 * Administrador em sessão de suporte. O banco revalida tudo (papel, semana, datas).
 */
async function writeContext() {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sua sessão expirou. Entre novamente." } as const;
  if (viewer.profile.must_change_password) return { error: "Troque sua senha antes de continuar." } as const;
  const subject = subjectOf(viewer);
  if (!subject) return { error: "Você não tem permissão para esta ação." } as const;
  return { viewer, subject, supportSession: viewer.support?.sessionId ?? null } as const;
}

function refresh() {
  revalidatePath("/inicio");
  revalidatePath("/semanas", "layout");
}

export async function saveExpenseAction(
  input: ExpenseFormValues,
): Promise<ActionResult<{ weekStart: string; created: boolean }>> {
  const ctx = await writeContext();
  if ("error" in ctx) return fail(ctx.error!);
  const parsed = expenseFormSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;

  const { data, error } = await ctx.viewer.supabase.rpc("save_expense", {
    p_id: v.id,
    p_employee_id: ctx.subject.id,
    p_occurred_on: v.occurredOn,
    p_amount_cents: parseBRLToCents(v.amount)!,
    p_category_id: v.categoryId,
    p_description: v.description,
    p_grupo: v.grupo ?? null,
    p_km: kmToNumber(v.km),
    p_origem: v.origem || null,
    p_destino: v.destino || null,
    p_clientes: v.clientes || null,
    p_has_receipt: v.hasReceipt,
    p_support_session: ctx.supportSession,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return { ok: true, data: { weekStart: data.week_start, created: data.created } };
}

export async function saveReceiptAction(
  input: ReceiptFormValues,
): Promise<ActionResult<{ weekStart: string; created: boolean }>> {
  const ctx = await writeContext();
  if ("error" in ctx) return fail(ctx.error!);
  const parsed = receiptFormSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;

  const { data, error } = await ctx.viewer.supabase.rpc("save_receipt", {
    p_id: v.id,
    p_employee_id: ctx.subject.id,
    p_received_on: v.receivedOn,
    p_amount_cents: parseBRLToCents(v.amount)!,
    p_description: v.description || null,
    p_week_start: v.weekStart,
    p_support_session: ctx.supportSession,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return { ok: true, data: { weekStart: data.week_start, created: data.created } };
}

export async function saveRouteAction(
  input: RouteFormValues,
): Promise<ActionResult<{ weekStart: string; created: boolean }>> {
  const ctx = await writeContext();
  if ("error" in ctx) return fail(ctx.error!);
  const parsed = routeFormSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;

  const { data, error } = await ctx.viewer.supabase.rpc("save_route", {
    p_id: v.id,
    p_employee_id: ctx.subject.id,
    p_occurred_on: v.occurredOn,
    p_origem: v.origem,
    p_destino: v.destino,
    p_km: kmToNumber(v.km),
    p_clientes: v.clientes || null,
    p_support_session: ctx.supportSession,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return { ok: true, data: { weekStart: data.week_start, created: data.created } };
}

const deleteSchema = z.object({ kind: z.enum(["expense", "receipt", "route", "attachment"]), id: z.uuid() });
const DELETE_RPC = {
  expense: "delete_expense",
  receipt: "delete_receipt",
  route: "delete_route",
  attachment: "delete_attachment",
} as const;

export async function deleteEntryAction(input: {
  kind: "expense" | "receipt" | "route" | "attachment";
  id: string;
}): Promise<ActionResult> {
  const ctx = await writeContext();
  if ("error" in ctx) return fail(ctx.error!);
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail("Registro inválido.");
  const { error } = await ctx.viewer.supabase.rpc(DELETE_RPC[parsed.data.kind], {
    p_id: parsed.data.id,
    p_support_session: ctx.supportSession,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return { ok: true, data: undefined };
}
