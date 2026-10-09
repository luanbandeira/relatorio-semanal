import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_COOKIE } from "@/lib/auth";

// Encerra a sessão (também usado quando a conta foi desativada ou expirou).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const motivo = request.nextUrl.searchParams.get("motivo");
  url.search = motivo ? `?motivo=${encodeURIComponent(motivo)}` : "";
  const res = NextResponse.redirect(url);
  res.cookies.delete(SUPPORT_COOKIE);
  return res;
}
