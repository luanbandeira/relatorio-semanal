import { notFound, redirect } from "next/navigation";
import { requireViewer, subjectOf } from "@/lib/auth";
import { isMonday, maxEntryDate, suggestedDateForWeek, todayLocal, weekStartOf } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { getCategories } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { ExpenseForm } from "./expense-form";

export default async function ExpensePage(props: PageProps<"/lancar/despesa">) {
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");
  const sp = await props.searchParams;
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const semana = typeof sp.semana === "string" && isMonday(sp.semana) ? sp.semana : weekStartOf(todayLocal());

  const [categories, settings] = await Promise.all([getCategories(viewer.supabase, true), getSettings(viewer.supabase)]);

  let existing = null;
  if (id) {
    const { data } = await viewer.supabase
      .from("expenses")
      .select(
        "id, employee_id, occurred_on, amount_cents, category_id, grupo, description, km, origem, destino, clientes, has_receipt, week:employee_weeks!inner(status), attachments(id, original_name, mime_type)",
      )
      .eq("id", id)
      .maybeSingle();
    if (!data || data.employee_id !== subject.id) notFound();
    const week = data.week as unknown as { status: string };
    if (week.status !== "aberta") redirect(`/semanas/${weekStartOf(data.occurred_on)}`);
    existing = data;
  }

  // Categorias inativas só aparecem se já estiverem no registro editado.
  const visibleCategories = categories.filter((c) => c.active || c.id === existing?.category_id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{existing ? "Editar despesa" : "Adicionar despesa"}</h1>
      <ExpenseForm
        categories={visibleCategories.map((c) => ({ id: c.id, name: c.name, grupo: c.grupo }))}
        minDate={settings.data_inicio_operacao}
        maxDate={maxEntryDate()}
        existing={
          existing
            ? {
                id: existing.id,
                occurredOn: existing.occurred_on,
                amount: centsToInput(Number(existing.amount_cents)),
                categoryId: existing.category_id,
                description: existing.description,
                grupo: existing.grupo,
                km: existing.km === null ? "" : String(existing.km).replace(".", ","),
                origem: existing.origem ?? "",
                destino: existing.destino ?? "",
                clientes: existing.clientes ?? "",
                hasReceipt: existing.has_receipt,
                attachments: (existing.attachments ?? []) as { id: string; original_name: string | null; mime_type: string }[],
              }
            : null
        }
        defaultDate={suggestedDateForWeek(semana)}
      />
    </div>
  );
}
