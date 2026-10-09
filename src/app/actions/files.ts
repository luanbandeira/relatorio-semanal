"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer, subjectOf } from "@/lib/auth";
import { type ActionResult, fail, friendlyError } from "@/lib/errors";

const registerSchema = z.object({
  id: z.uuid(),
  expenseId: z.uuid(),
  path: z.string().min(10).max(300),
  originalName: z.string().max(200).optional(),
});

export async function registerAttachmentAction(input: z.input<typeof registerSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer || viewer.profile.must_change_password) return fail("Sua sessão expirou. Entre novamente.");
  if (!subjectOf(viewer)) return fail("Você não tem permissão para esta ação.");
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail("Anexo inválido.");
  const { error } = await viewer.supabase.rpc("register_attachment", {
    p_id: parsed.data.id,
    p_expense_id: parsed.data.expenseId,
    p_storage_path: parsed.data.path,
    p_original_name: parsed.data.originalName ?? null,
    p_support_session: viewer.support?.sessionId ?? null,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/semanas", "layout");
  revalidatePath("/inicio");
  return { ok: true, data: undefined };
}

const avatarSchema = z.enum(["masculino", "feminino", "neutro"]);

export async function updateAvatarAction(avatar: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer || viewer.support) return fail("Você não tem permissão para esta ação.");
  const parsed = avatarSchema.safeParse(avatar);
  if (!parsed.success) return fail("Avatar inválido.");
  const { error } = await viewer.supabase.rpc("update_own_avatar", { p_avatar: parsed.data });
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setPhotoAction(path: string | null): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer || viewer.support) return fail("Você não tem permissão para esta ação.");
  if (path !== null && (typeof path !== "string" || path.length > 300)) return fail("Foto inválida.");
  const { error } = await viewer.supabase.rpc("set_own_photo", { p_path: path });
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
