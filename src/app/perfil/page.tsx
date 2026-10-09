import Link from "next/link";
import { requireViewer, ROLE_LABEL } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { buttonVariants } from "@/components/ui/button";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const p = viewer.profile;
  return (
    <>
      <AppHeader profile={p} nav={navFor(viewer)} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold">Meu perfil</h1>
          <p className="text-sm text-muted-foreground">
            {p.full_name} · usuário <strong>{p.username}</strong> · {ROLE_LABEL[p.role]}
          </p>
        </div>
        {viewer.support ? (
          <p className="text-sm">Saia do modo de suporte para alterar o seu perfil.</p>
        ) : (
          <>
            <ProfileForm userId={p.id} name={p.full_name} avatar={p.avatar} hasPhoto={!!p.photo_path} />
            <section className="space-y-2 rounded-2xl border p-4">
              <h2 className="font-semibold">Senha</h2>
              <p className="text-sm text-muted-foreground">
                Para trocar, escolha uma nova senha. Se esquecer, o responsável pode definir uma senha temporária.
              </p>
              <Link href="/trocar-senha" className={buttonVariants({ variant: "outline" })}>
                Trocar senha
              </Link>
            </section>
          </>
        )}
      </main>
    </>
  );
}
