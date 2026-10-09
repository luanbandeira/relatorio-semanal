import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Foto de perfil: visível apenas a quem pode consultar o perfil (RLS).
export async function GET(_request: Request, ctx: RouteContext<"/api/fotos/[userId]">) {
  const { userId } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new NextResponse(null, { status: 400 });

  const { data: profile } = await viewer.supabase
    .from("profiles")
    .select("photo_path")
    .eq("id", userId)
    .maybeSingle<{ photo_path: string | null }>();
  if (!profile?.photo_path) return new NextResponse(null, { status: 404 });

  const { data } = await createAdminClient().storage.from("fotos").createSignedUrl(profile.photo_path, 300);
  if (!data) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, max-age=240");
  return res;
}
