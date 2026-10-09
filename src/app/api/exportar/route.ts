import { NextResponse, type NextRequest } from "next/server";
import { getViewer, isAdminRole } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { buildExcel } from "@/lib/export/excel";
import { buildPdf } from "@/lib/export/pdf";
import { reportFilterSchema } from "@/lib/validation";
import { todayLocal } from "@/lib/dates";

export const runtime = "nodejs";

// Exporta PDF ou Excel com os mesmos filtros e permissões da tela.
// Funcionário não exporta; dados vêm sob RLS do próprio usuário.
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || viewer.profile.must_change_password) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  if (!isAdminRole(viewer.profile.role) || viewer.support) {
    return NextResponse.json({ error: "Sem permissão para exportar." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const format = sp.get("formato");
  if (format !== "pdf" && format !== "xlsx") {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }
  const parsed = reportFilterSchema.safeParse({
    employeeIds: sp.getAll("funcionario"),
    categoryIds: sp.getAll("categoria"),
    from: sp.get("de") || undefined,
    to: sp.get("ate") || undefined,
    month: sp.get("mes") || undefined,
    status: sp.get("status") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });

  const report = await buildReport(viewer, parsed.data);
  const stamp = todayLocal();
  const body = format === "pdf" ? buildPdf(report) : await buildExcel(report);
  const type =
    format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="relatorio-semanal-${stamp}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
