import { notFound } from "next/navigation";
import { requireRole, ROLE_LABEL, type Role } from "@/lib/auth";
import { formatCpf } from "@/lib/identity";
import { formatDateTimeBR } from "@/lib/dates";
import { AccountForm } from "../account-form";
import { AccountActions } from "./account-actions";
import { listCompanies } from "@/lib/queries";

type AdminProfile = {
  id: string;
  full_name: string;
  cpf: string | null;
  username: string;
  role: Role;
  active: boolean;
  avatar: "masculino" | "feminino" | "neutro";
  unit: string | null;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  deactivated_at: string | null;
  created_at: string;
};

export default async function AccountPage(props: PageProps<"/admin/contas/[id]">) {
  const { id } = await props.params;
  const viewer = await requireRole(["admin"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // CPF completo só no cadastro, via função restrita ao Administrador.
  const { data, error } = await viewer.supabase.rpc("admin_get_profile", { p_id: id });
  if (error || !data) notFound();
  const p = data as AdminProfile;
  const units = await listCompanies(viewer.supabase);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{p.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          {ROLE_LABEL[p.role]} · criada em {formatDateTimeBR(p.created_at)}
          {!p.active && p.deactivated_at ? ` · desativada em ${formatDateTimeBR(p.deactivated_at)}` : ""}
        </p>
        {p.must_change_password && (
          <p className="mt-1 text-sm text-warning">
            Aguardando troca da senha temporária
            {p.temp_password_expires_at ? ` (vence em ${formatDateTimeBR(p.temp_password_expires_at)})` : ""}.
          </p>
        )}
      </div>
      <AccountForm
        id={p.id}
        initial={{
          fullName: p.full_name,
          cpf: p.cpf ? formatCpf(p.cpf) : "",
          username: p.username,
          role: p.role,
          avatar: p.avatar,
          unit: p.unit ?? "",
        }}
        units={units}
      />
      <AccountActions id={p.id} active={p.active} isSelf={p.id === viewer.userId} />
    </div>
  );
}
