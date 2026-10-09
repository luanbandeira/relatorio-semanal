import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/lib/files";

const bodySchema = z.object({ mimeType: z.string(), size: z.number().int().positive() });

// Foto do próprio perfil (opcional).
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.support) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const ext = PHOTO_TYPES[parsed.data.mimeType];
  if (!ext) return NextResponse.json({ error: "Use foto JPEG, PNG ou WebP." }, { status: 400 });
  if (parsed.data.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Foto acima de 5 MB." }, { status: 400 });

  const path = `${viewer.userId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from("fotos").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "Não foi possível preparar o envio." }, { status: 500 });
  return NextResponse.json({ path: data.path, token: data.token });
}
