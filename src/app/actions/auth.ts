"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { authEmailFor, normalizeUsername } from "@/lib/identity";
import { changePasswordSchema, fieldErrorsFrom, loginSchema } from "@/lib/validation";
import { clientIp } from "@/lib/request";
import { getViewer } from "@/lib/auth";
import { type ActionResult, fail, GENERIC_ERROR } from "@/lib/errors";

const WRONG = "Usuário ou senha incorretos.";

export async function loginAction(input: {
  username: string;
  password: string;
}): Promise<ActionResult<{ mustChange: boolean }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("Preencha usuário e senha.", fieldErrorsFrom(parsed.error));

  const username = normalizeUsername(parsed.data.username);
  const ip = await clientIp();
  const admin = createAdminClient();

  const { data: allowed, error: limitError } = await admin.rpc("service_login_allowed", {
    p_username: username,
    p_ip: ip,
  });
  if (limitError) return fail(GENERIC_ERROR);
  if (!allowed) {
    return fail("Muitas tentativas. Aguarde 15 minutos ou fale com o responsável.");
  }

  const { data: info } = await admin
    .rpc("service_login_profile", { p_username: username })
    .maybeSingle<{ id: string; active: boolean; must_change_password: boolean; temp_password_expires_at: string | null }>();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmailFor(username, serverEnv.authUsernameDomain),
    password: parsed.data.password,
  });

  if (error || !info) {
    await admin.rpc("service_record_login", { p_username: username, p_ip: ip, p_success: false });
    if (!error) await supabase.auth.signOut();
    return fail(WRONG);
  }

  if (!info.active) {
    await supabase.auth.signOut();
    await admin.rpc("service_record_login", { p_username: username, p_ip: ip, p_success: false });
    return fail("Acesso desativado. Procure o responsável.");
  }

  if (
    info.must_change_password &&
    info.temp_password_expires_at &&
    new Date(info.temp_password_expires_at).getTime() < Date.now()
  ) {
    await supabase.auth.signOut();
    return fail("Sua senha temporária expirou. Peça uma nova ao responsável.");
  }

  await admin.rpc("service_record_login", { p_username: username, p_ip: ip, p_success: true });
  return { ok: true, data: { mustChange: info.must_change_password } };
}

export async function changePasswordAction(input: {
  password: string;
  confirm: string;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sua sessão expirou. Entre novamente.");
  if (viewer.support) return fail("Saia do modo de suporte para trocar a sua senha.");

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Confira a nova senha.", fieldErrorsFrom(parsed.error));

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(viewer.userId, {
    password: parsed.data.password,
  });
  if (error) {
    if (/same|different/i.test(error.message)) return fail("A nova senha precisa ser diferente da temporária.");
    return fail(GENERIC_ERROR);
  }
  const { error: flagError } = await admin.rpc("service_complete_password_change", {
    p_user_id: viewer.userId,
  });
  if (flagError) return fail(GENERIC_ERROR);
  return { ok: true, data: undefined };
}

export async function logoutAction() {
  redirect("/sair");
}
