import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "./login-form";

const MOTIVOS: Record<string, string> = {
  sessao: "Sua sessão terminou. Entre novamente.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect("/");
  const { motivo } = await props.searchParams;
  const notice = typeof motivo === "string" ? MOTIVOS[motivo] : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Relatório Semanal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Despesas e acerto semanal da equipe de campo</p>
        <LoginForm notice={notice} />
      </div>
    </main>
  );
}
