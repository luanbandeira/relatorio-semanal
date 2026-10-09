import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";

// Checagem de acesso antes do esboço de carregamento (loading.tsx): assim um
// funcionário inacessível (ex.: desativado para o Visualizador) responde 404
// de verdade, sem começar a enviar a página.
export default async function EmployeeAccessLayout(props: LayoutProps<"/admin/funcionarios/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer();
  const { data } = await viewer.supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("role", "funcionario")
    .maybeSingle();
  if (!data) notFound();
  return props.children;
}
