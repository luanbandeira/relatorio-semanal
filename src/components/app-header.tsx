import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import type { Profile } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/auth";
import { UserAvatar } from "@/components/user-avatar";

export type NavItem = { href: string; label: string };

export function AppHeader({ profile, nav }: { profile: Profile; nav: NavItem[] }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <Link href="/" className="mr-auto rounded-md font-semibold text-heading">
          Relatório Semanal
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/perfil" className="flex items-center gap-2 rounded-full p-1 hover:bg-muted" aria-label="Meu perfil">
          <UserAvatar
            userId={profile.id}
            name={profile.full_name}
            avatar={profile.avatar}
            hasPhoto={!!profile.photo_path}
            size="sm"
          />
          <span className="hidden text-left text-sm leading-tight lg:block">
            <span className="block font-medium text-heading">{profile.full_name}</span>
            <span className="block text-muted-foreground">{ROLE_LABEL[profile.role]}</span>
          </span>
        </Link>
        <a
          href="/sair"
          className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted md:size-10"
          aria-label="Sair"
          title="Sair"
        >
          <LogOutIcon className="size-5" aria-hidden="true" />
        </a>
      </div>
      {nav.length > 0 && (
        <nav aria-label="Principal (celular)" className="flex gap-1 overflow-x-auto border-t px-2 py-1 md:hidden">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-3 py-2 text-sm hover:bg-muted">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
