import type { NavItem } from "@/components/app-header";
import type { Viewer } from "@/lib/auth";

export function navFor(viewer: Viewer): NavItem[] {
  if (viewer.support || viewer.profile.role === "funcionario") {
    return [
      { href: "/inicio", label: "Semana atual" },
      { href: "/semanas", label: "Semanas anteriores" },
    ];
  }
  const items: NavItem[] = [
    { href: "/admin", label: "Funcionários" },
    { href: "/admin/relatorios", label: "Relatórios" },
  ];
  if (viewer.profile.role === "admin") {
    items.push(
      { href: "/admin/contas", label: "Contas" },
      { href: "/admin/categorias", label: "Categorias" },
      { href: "/admin/configuracoes", label: "Configurações" },
      { href: "/admin/auditoria", label: "Auditoria" },
    );
  }
  return items;
}
