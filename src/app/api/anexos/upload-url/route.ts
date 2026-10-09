import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer, subjectOf } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/files";

const bodySchema = z.object({
  expenseId: z.uuid(),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

// Emite URL assinada de envio para um anexo de despesa do próprio funcionário
// (ou do alvo da sessão de suporte). O Storage aplica tipo e tamanho; o
// registro final é validado de novo em register_attachment.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.profile.must_change_password) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  const subject = subjectOf(viewer);
  if (!subject) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const { expenseId, mimeType, size } = parsed.data;

  const ext = ATTACHMENT_TYPES[mimeType];
  if (!ext) return NextResponse.json({ error: "Formato não aceito. Use foto ou PDF." }, { status: 400 });
  if (size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "Arquivo acima de 10 MB." }, { status: 400 });

  const { data: expense } = await viewer.supabase
    .from("expenses")
    .select("id, employee_id, week:employee_weeks!inner(status)")
    .eq("id", expenseId)
    .maybeSingle<{ id: string; employee_id: string; week: { status: string } }>();
  if (!expense || expense.employee_id !== subject.id) {
    return NextResponse.json({ error: "Despesa não encontrada." }, { status: 404 });
  }
  if (expense.week.status !== "aberta") {
    return NextResponse.json({ error: "Esta semana já foi encerrada." }, { status: 409 });
  }

  const attachmentId = crypto.randomUUID();
  const path = `${subject.id}/${expenseId}/${attachmentId}.${ext}`;
  const { data, error } = await createAdminClient().storage.from("comprovantes").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "Não foi possível preparar o envio." }, { status: 500 });

  return NextResponse.json({ attachmentId, path: data.path, token: data.token });
}
