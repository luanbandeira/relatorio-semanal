import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Abre um anexo: a consulta sob RLS decide se a pessoa pode vê-lo; o arquivo
// é entregue por URL assinada de curta duração (sem links públicos).
export async function GET(_request: Request, ctx: RouteContext<"/api/anexos/[id]">) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });

  const { data: att } = await viewer.supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle<{ storage_path: string }>();
  if (!att) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  const { data, error } = await createAdminClient().storage.from("comprovantes").createSignedUrl(att.storage_path, 60);
  if (error || !data) return NextResponse.json({ error: "Não foi possível abrir o anexo." }, { status: 500 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
