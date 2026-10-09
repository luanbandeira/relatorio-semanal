"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FacelessAvatar, UserAvatar } from "@/components/user-avatar";
import { setPhotoAction, updateAvatarAction } from "@/app/actions/files";
import { createClient } from "@/lib/supabase/browser";
import { prepareFile } from "@/lib/upload";
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/lib/files";
import { GENERIC_ERROR } from "@/lib/errors";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "neutro", label: "Neutro" },
] as const;

export function ProfileForm({
  userId,
  name,
  avatar,
  hasPhoto,
}: {
  userId: string;
  name: string;
  avatar: "masculino" | "feminino" | "neutro";
  hasPhoto: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photoKey, setPhotoKey] = useState(0);

  const setAvatar = useMutation({
    mutationFn: updateAvatarAction,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Avatar atualizado.");
        router.refresh();
      } else toast.error(r.error);
    },
    onError: () => toast.error(GENERIC_ERROR),
  });

  const photo = useMutation({
    mutationFn: async (original: File | null) => {
      if (!original) return setPhotoAction(null);
      const file = await prepareFile(original);
      if (!PHOTO_TYPES[file.type]) throw new Error("Use foto JPEG, PNG ou WebP.");
      if (file.size > MAX_PHOTO_BYTES) throw new Error("Foto acima de 5 MB.");
      const res = await fetch("/api/fotos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, size: file.size }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? GENERIC_ERROR);
      const { error } = await createClient().storage.from("fotos").uploadToSignedUrl(body.path, body.token, file, {
        contentType: file.type,
      });
      if (error) throw new Error(GENERIC_ERROR);
      return setPhotoAction(body.path);
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Foto atualizada.");
        setPhotoKey((k) => k + 1);
        router.refresh();
      } else toast.error(r.error);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : GENERIC_ERROR),
  });

  return (
    <section className="space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">Foto e avatar</h2>
      <div className="flex items-center gap-4">
        <UserAvatar key={photoKey} userId={userId} name={name} avatar={avatar} hasPhoto={hasPhoto} size="lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic"
            className="sr-only"
            id="photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) photo.mutate(f);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={photo.isPending}>
            {photo.isPending ? "Enviando..." : hasPhoto ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {hasPhoto && (
            <Button type="button" variant="ghost" onClick={() => photo.mutate(null)} disabled={photo.isPending}>
              Remover foto
            </Button>
          )}
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Avatar (usado quando não há foto)</legend>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={avatar === o.value}
              onClick={() => setAvatar.mutate(o.value)}
              disabled={setAvatar.isPending}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-2 text-sm",
                avatar === o.value ? "border-primary bg-secondary font-medium" : "border-input",
              )}
            >
              <span className="size-12 overflow-hidden rounded-full">
                <FacelessAvatar kind={o.value} />
              </span>
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
