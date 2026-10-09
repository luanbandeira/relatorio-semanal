"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { canSettle, getViewer, SUPPORT_COOKIE, type Viewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { authEmailFor, generateTempPassword } from "@/lib/identity";
import {
  accountFormSchema,
  categoryFormSchema,
  fieldErrorsFrom,
  reopenSchema,
  type AccountFormValues,
} from "@/lib/validation";
import { isMonday } from "@/lib/dates";
import { type ActionResult, fail, friendlyError, GENERIC_ERROR } from "@/lib/errors";

async function adminViewer(check: (v: Viewer) => boolean): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.profile.must_change_password || viewer.support) return null;
  return check(viewer) ? viewer : null;
}

const isAdmin = (v: Viewer) => v.profile.role === "admin";
const DENIED = "Você não tem permissão para esta ação.";

// ---------------------------------------------------------------------------
// Acerto e reabertura (Gestor e Administrador)
// ---------------------------------------------------------------------------

const settleSchema = z.object({
  employeeId: z.uuid(),
  weekStart: z.string().refine(isMonday),
  expectedVersion: z.number().int().nullable(),
});

export async function settleWeekAction(input: z.input<typeof settleSchema>): Promise<ActionResult<{ balanceCents: number }>> {
  const viewer = await adminViewer((v) => canSettle(v.profile.role));
  if (!viewer) return fail(DENIED);
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return fail("Semana inválida.");
  const { data, error } = await viewer.supabase.rpc("settle_week", {
    p_employee_id: parsed.data.employeeId,
    p_week_start: parsed.data.weekStart,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath(`/admin/funcionarios/${parsed.data.employeeId}`);
  return { ok: true, data: { balanceCents: Number(data.balance_cents) } };
}

export async function reopenWeekAction(input: z.input<typeof reopenSchema>): Promise<ActionResult<{ reopened: string[] }>> {
  const viewer = await adminViewer((v) => canSettle(v.profile.role));
  if (!viewer) return fail(DENIED);
  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) return fail("Confira o motivo.", fieldErrorsFrom(parsed.error));
  const { data, error } = await viewer.supabase.rpc("reopen_week", {
    p_employee_id: parsed.data.employeeId,
    p_week_start: parsed.data.weekStart,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath(`/admin/funcionarios/${parsed.data.employeeId}`);
  return { ok: true, data: { reopened: data.reopened ?? [] } };
}

// ---------------------------------------------------------------------------
// Contas (Administrador)
// ---------------------------------------------------------------------------

export async function createAccountAction(
  input: AccountFormValues,
): Promise<ActionResult<{ id: string; tempPassword: string | null }>> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  const parsed = accountFormSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;

  const admin = createAdminClient();
  // Senha definida pelo Administrador: a pessoa entra direto, sem troca obrigatória.
  const defined = v.passwordMode === "definida";
  const tempPassword = defined ? null : generateTempPassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: authEmailFor(v.username, serverEnv.authUsernameDomain),
    password: defined ? v.password : tempPassword!,
    email_confirm: true,
  });
  if (authError || !created.user) {
    if (/already|registered|exists/i.test(authError?.message ?? "")) {
      return fail("Este usuário de acesso já está em uso.", { username: "Este usuário de acesso já está em uso." });
    }
    return fail(GENERIC_ERROR);
  }

  // Perfil criado com o JWT do Administrador: a auditoria registra o autor real.
  const { error } = await viewer.supabase.rpc("admin_create_profile", {
    p_id: created.user.id,
    p_full_name: v.fullName,
    p_cpf: v.cpf || null,
    p_username: v.username,
    p_role: v.role,
    p_avatar: v.avatar,
    p_unit: v.unit || null,
    p_must_change_password: !defined,
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    const msg = friendlyError(error);
    const field = /CPF/.test(msg) ? "cpf" : /usuário/i.test(msg) ? "username" : undefined;
    return fail(msg, field ? { [field]: msg } : undefined);
  }
  revalidatePath("/admin/contas");
  return { ok: true, data: { id: created.user.id, tempPassword } };
}

export async function updateAccountAction(
  id: string,
  input: AccountFormValues,
): Promise<ActionResult> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  if (!z.uuid().safeParse(id).success) return fail("Conta inválida.");
  const parsed = accountFormSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;

  const { data, error } = await viewer.supabase.rpc("admin_update_profile", {
    p_id: id,
    p_full_name: v.fullName,
    p_cpf: v.cpf || null,
    p_username: v.username,
    p_role: v.role,
    p_avatar: v.avatar,
    p_unit: v.unit || null,
  });
  if (error) return fail(friendlyError(error));

  if (data.username_changed) {
    const { error: authError } = await createAdminClient().auth.admin.updateUserById(id, {
      email: authEmailFor(v.username, serverEnv.authUsernameDomain),
      email_confirm: true,
    });
    if (authError) return fail("Dados salvos, mas o novo usuário de acesso não foi ativado. Tente salvar de novo.");
  }
  revalidatePath("/admin/contas");
  revalidatePath(`/admin/contas/${id}`);
  return { ok: true, data: undefined };
}

const activeSchema = z.object({ id: z.uuid(), active: z.boolean(), reason: z.string().max(500).optional() });

export async function setAccountActiveAction(input: z.input<typeof activeSchema>): Promise<ActionResult> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const { id, active, reason } = parsed.data;

  const { error } = await viewer.supabase.rpc("admin_set_active", {
    p_id: id,
    p_active: active,
    p_reason: reason ?? null,
  });
  if (error) return fail(friendlyError(error));

  // Além do bloqueio por requisição (RLS), impede renovação de sessão no Auth.
  await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  revalidatePath("/admin", "layout");
  return { ok: true, data: undefined };
}

export async function resetPasswordAction(id: string): Promise<ActionResult<{ tempPassword: string }>> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  if (!z.uuid().safeParse(id).success) return fail("Conta inválida.");
  if (id === viewer.userId) return fail("Para trocar a sua senha, use o seu perfil.");

  // Marca primeiro (auditado com o Administrador como autor) e só depois troca a senha.
  const { error } = await viewer.supabase.rpc("admin_mark_password_reset", { p_id: id });
  if (error) return fail(friendlyError(error));
  const tempPassword = generateTempPassword();
  const { error: authError } = await createAdminClient().auth.admin.updateUserById(id, { password: tempPassword });
  if (authError) return fail(GENERIC_ERROR);
  revalidatePath(`/admin/contas/${id}`);
  return { ok: true, data: { tempPassword } };
}

// ---------------------------------------------------------------------------
// Categorias e configurações (Administrador)
// ---------------------------------------------------------------------------

export async function saveCategoryAction(input: z.input<typeof categoryFormSchema>): Promise<ActionResult> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  const parsed = categoryFormSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos.", fieldErrorsFrom(parsed.error));
  const { error } = await viewer.supabase.rpc("admin_save_category", {
    p_id: parsed.data.id ?? null,
    p_name: parsed.data.name,
    p_grupo: parsed.data.grupo,
    p_active: parsed.data.active,
    p_sort_order: parsed.data.sortOrder,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/categorias");
  return { ok: true, data: undefined };
}

const settingSchema = z.object({
  key: z.enum([
    "data_inicio_operacao",
    "anexos_max_por_despesa",
    "suporte_duracao_minutos",
    "senha_temporaria_validade_horas",
    "acerto_automatico_tolerancia_dias",
  ]),
  value: z.union([z.string(), z.number()]),
});

export async function saveSettingAction(input: z.input<typeof settingSchema>): Promise<ActionResult> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  const parsed = settingSchema.safeParse(input);
  if (!parsed.success) return fail("Valor inválido.");
  const { error } = await viewer.supabase.rpc("admin_set_setting", {
    p_key: parsed.data.key,
    p_value: parsed.data.value,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/configuracoes");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Suporte "Acessar como funcionário" (Administrador)
// ---------------------------------------------------------------------------

export async function startSupportAction(employeeId: string): Promise<ActionResult> {
  const viewer = await adminViewer(isAdmin);
  if (!viewer) return fail(DENIED);
  if (!z.uuid().safeParse(employeeId).success) return fail("Funcionário inválido.");
  const { data, error } = await viewer.supabase.rpc("start_support_session", { p_employee_id: employeeId });
  if (error) return fail(friendlyError(error));
  (await cookies()).set(SUPPORT_COOKIE, data.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(data.expires_at),
  });
  return { ok: true, data: undefined };
}

export async function endSupportAction(): Promise<ActionResult> {
  const viewer = await getViewer();
  const store = await cookies();
  const id = store.get(SUPPORT_COOKIE)?.value;
  if (viewer && id && /^[0-9a-f-]{36}$/i.test(id)) {
    await viewer.supabase.rpc("end_support_session", { p_id: id });
  }
  store.delete(SUPPORT_COOKIE);
  return { ok: true, data: undefined };
}
