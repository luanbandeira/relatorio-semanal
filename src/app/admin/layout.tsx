import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireViewer();
  // Em modo de suporte o Administrador vê a tela do funcionário (com a faixa de saída).
  if (viewer.support || viewer.profile.role === "funcionario") redirect("/inicio");
  return (
    <>
      <AppHeader profile={viewer.profile} nav={navFor(viewer)} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
