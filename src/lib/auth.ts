import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "funcionario" | "visualizador" | "gestor" | "admin";
export type Avatar = "masculino" | "feminino" | "neutro";

export type Profile = {
  id: string;
  full_name: string;
  username: string;
  role: Role;
  active: boolean;
  avatar: Avatar;
  photo_path: string | null;
  unit: string | null;
  must_change_password: boolean;
};

export type SupportContext = {
  sessionId: string;
  expiresAt: string;
  employee: Profile;
};

export type Viewer = {
  userId: string;
  profile: Profile;
  support: SupportContext | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export const SUPPORT_COOKIE = "rd_suporte";
export const PROFILE_COLUMNS =
  "id, full_name, username, role, active, avatar, photo_path, must_change_password, unit";

export const ROLE_LABEL: Record<Role, string> = {
  funcionario: "Funcionário",
  visualizador: "Visualizador",
  gestor: "Gestor",
  admin: "Administrador",
};

/**
 * Usuário da requisição. O perfil é consultado a cada requisição (sob RLS,
 * que só devolve contas ativas), então desativação vale imediatamente.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle<Profile>();
  if (!profile || !profile.active) return null;

  let support: SupportContext | null = null;
  const supportId = (await cookies()).get(SUPPORT_COOKIE)?.value;
  if (supportId && profile.role === "admin" && /^[0-9a-f-]{36}$/i.test(supportId)) {
    const { data: session } = await supabase
      .rpc("current_support_session", { p_id: supportId })
      .maybeSingle<{ id: string; employee_id: string; expires_at: string }>();
    if (session) {
      const { data: employee } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", session.employee_id)
        .maybeSingle<Profile>();
      if (employee) support = { sessionId: session.id, expiresAt: session.expires_at, employee };
    }
  }

  return { userId, profile, support, supabase };
});

/** Para páginas: exige sessão ativa e troca de senha concluída. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sair?motivo=sessao");
  if (viewer.profile.must_change_password) redirect("/trocar-senha");
  return viewer;
}

export async function requireRole(roles: Role[]): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!roles.includes(viewer.profile.role)) redirect("/");
  return viewer;
}

/**
 * Funcionário cujos lançamentos estão sendo vistos/alterados: o próprio
 * funcionário, ou o alvo da sessão de suporte do Administrador.
 */
export function subjectOf(viewer: Viewer): Profile | null {
  if (viewer.support) return viewer.support.employee;
  if (viewer.profile.role === "funcionario") return viewer.profile;
  return null;
}

export const isAdminRole = (role: Role) => role !== "funcionario";
export const canSettle = (role: Role) => role === "gestor" || role === "admin";
export const canSeeInactive = (role: Role) => role === "gestor" || role === "admin";
