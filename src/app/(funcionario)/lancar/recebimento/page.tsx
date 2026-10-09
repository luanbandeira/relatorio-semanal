import { notFound, redirect } from "next/navigation";
import { requireViewer, subjectOf } from "@/lib/auth";
import { addDays, isMonday, maxEntryDate, suggestedDateForWeek, todayLocal, weekStartOf } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { listWeeks } from "@/lib/queries";
import { ReceiptForm } from "./receipt-form";

export default async function ReceiptPage(props: PageProps<"/lancar/recebimento">) {
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");
  const sp = await props.searchParams;
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const semana = typeof sp.semana === "string" && isMonday(sp.semana) ? sp.semana : weekStartOf(todayLocal());
  const [settings, weeks] = await Promise.all([getSettings(viewer.supabase), listWeeks(viewer.supabase, subject.id)]);

  let existing = null;
  if (id) {
    const { data } = await viewer.supabase
      .from("receipts")
      .select("id, employee_id, received_on, amount_cents, description, week:employee_weeks!inner(week_start, status)")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.employee_id !== subject.id) notFound();
    const week = data.week as unknown as { week_start: string; status: string };
    if (week.status !== "aberta") redirect(`/semanas/${week.week_start}`);
    existing = {
      id: data.id,
      receivedOn: data.received_on,
      weekStart: week.week_start,
      amount: centsToInput(Number(data.amount_cents)),
      description: data.description ?? "",
    };
  }

  // Semanas de referência possíveis: abertas, do início da operação até a atual.
  const closed = new Set(weeks.filter((w) => w.status === "acertada").map((w) => w.week_start));
  const options: string[] = [];
  for (let s = weekStartOf(todayLocal()); s >= settings.data_inicio_operacao; s = addDays(s, -7)) {
    if (!closed.has(s)) options.push(s);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{existing ? "Editar valor recebido" : "Valor recebido da empresa"}</h1>
      <p className="text-sm text-muted-foreground">
        Registre somente o que caiu de fato (transferência ou cartão benefício). Cada valor é registrado uma única vez.
      </p>
      <ReceiptForm
        existing={existing}
        defaultDate={suggestedDateForWeek(semana)}
        minDate={settings.data_inicio_operacao}
        maxDate={maxEntryDate()}
        openWeeks={options}
      />
    </div>
  );
}
