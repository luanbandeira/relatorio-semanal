import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sair?motivo=sessao");
  const forced = viewer.profile.must_change_password;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{forced ? "Crie sua senha" : "Trocar senha"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {forced
            ? "Por segurança, troque a senha temporária antes de continuar."
            : "Escolha uma nova senha para entrar no sistema."}
        </p>
        <ChangePasswordForm forced={forced} />
      </div>
    </main>
  );
}
