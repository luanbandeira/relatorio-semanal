import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  name: string;
  avatar: "masculino" | "feminino" | "neutro";
  hasPhoto?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = { sm: "size-9", md: "size-12", lg: "size-16" };

/** Foto (se houver) ou avatar sem rosto. A escolha não define permissões. */
export function UserAvatar({ userId, name, avatar, hasPhoto, size = "md", className }: Props) {
  const box = cn("shrink-0 overflow-hidden rounded-full bg-secondary", SIZES[size], className);
  if (hasPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária
      <img src={`/api/fotos/${userId}`} alt={`Foto de ${name}`} className={cn(box, "object-cover")} />
    );
  }
  return (
    <span className={box} role="img" aria-label={`Avatar de ${name}`}>
      <FacelessAvatar kind={avatar} />
    </span>
  );
}

export function FacelessAvatar({ kind }: { kind: "masculino" | "feminino" | "neutro" }) {
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden="true">
      <rect width="64" height="64" fill="#dbeafe" />
      {kind === "feminino" && (
        <path d="M14 34c0-14 7-24 18-24s18 10 18 24v12H14z" fill="#1e40af" opacity="0.85" />
      )}
      <circle cx="32" cy="26" r="11" fill="#1d4ed8" />
      {kind === "masculino" && <path d="M21 22c2-8 20-9 22 0-4-3-18-3-22 0z" fill="#1e3a8a" />}
      <path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill={kind === "neutro" ? "#374151" : "#1d4ed8"} />
    </svg>
  );
}
