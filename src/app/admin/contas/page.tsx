import Link from "next/link";
import { PlusIcon, UserXIcon } from "lucide-react";
import { requireRole, ROLE_LABEL, type Role } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { UnitBadge } from "@/components/unit-badge";

export default async function AccountsPage() {
  const viewer = await requireRole(["admin"]);
  const { data } = await viewer.supabase
    .from("profiles")
    .select("id, full_name, username, role, active, avatar, photo_path, must_change_password, unit")
    .order("full_name");
  const accounts = (data ?? []) as {
    id: string;
    full_name: string;
    username: string;
    role: Role;
    active: boolean;
    avatar: "masculino" | "feminino" | "neutro";
    unit: string | null;
    photo_path: string | null;
    must_change_password: boolean;
  }[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Contas</h1>
        <Link href="/admin/contas/nova" className={buttonVariants()}>
          <PlusIcon aria-hidden="true" /> Nova conta
        </Link>
      </div>
      <ul className="divide-y rounded-2xl border">
        {accounts.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/contas/${a.id}`} className="flex items-center gap-3 p-3 hover:bg-muted">
              <UserAvatar userId={a.id} name={a.full_name} avatar={a.avatar} hasPhoto={!!a.photo_path} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-heading">{a.full_name}</span>
                  <UnitBadge unit={a.unit} />
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {a.username} · {ROLE_LABEL[a.role]}
                  {a.must_change_password ? " · aguardando troca de senha" : ""}
                </span>
              </span>
              {!a.active && (
                <span className="inline-flex items-center gap-1 text-sm text-destructive">
                  <UserXIcon className="size-4" aria-hidden="true" /> Desativada
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
