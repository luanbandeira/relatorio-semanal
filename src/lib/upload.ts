"use client";

import { createClient } from "@/lib/supabase/browser";
import { registerAttachmentAction } from "@/app/actions/files";
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/files";

const HEIC = /\.(heic|heif)$/i;

export function isHeic(file: File) {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC.test(file.name);
}

/** Converte HEIC (iPhone) para JPEG no próprio aparelho, quando possível. */
export async function prepareFile(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(HEIC, ".jpg"), { type: "image/jpeg" });
}

export function fileProblem(file: File): string | null {
  if (!isHeic(file) && !ATTACHMENT_TYPES[file.type]) return `"${file.name}": formato não aceito. Use foto ou PDF.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `"${file.name}" tem mais de 10 MB.`;
  return null;
}

/** Envia um anexo: URL assinada (servidor) → Storage privado → registro validado no banco. */
export async function uploadAttachment(expenseId: string, original: File): Promise<void> {
  const file = await prepareFile(original);
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);

  const res = await fetch("/api/anexos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expenseId, mimeType: file.type, size: file.size }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Não foi possível preparar o envio.");

  const { error } = await createClient()
    .storage.from("comprovantes")
    .uploadToSignedUrl(body.path, body.token, file, { contentType: file.type });
  if (error) throw new Error("Falha ao enviar o arquivo. Verifique sua internet e tente de novo.");

  const reg = await registerAttachmentAction({
    id: body.attachmentId,
    expenseId,
    path: body.path,
    originalName: original.name.slice(0, 200),
  });
  if (!reg.ok) throw new Error(reg.error);
}
