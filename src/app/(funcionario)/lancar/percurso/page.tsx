import { notFound, redirect } from "next/navigation";
import { requireViewer, subjectOf } from "@/lib/auth";
import { isMonday, maxEntryDate, suggestedDateForWeek, todayLocal, weekStartOf } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { RouteForm } from "./route-form";

export default async function RoutePage(props: PageProps<"/lancar/percurso">) {
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");
  const sp = await props.searchParams;
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const semana = typeof sp.semana === "string" && isMonday(sp.semana) ? sp.semana : weekStartOf(todayLocal());
  const settings = await getSettings(viewer.supabase);

  let existing = null;
  if (id) {
    const { data } = await viewer.supabase
      .from("routes")
      .select("id, employee_id, occurred_on, origem, destino, km, clientes, week:employee_weeks!inner(status)")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.employee_id !== subject.id) notFound();
    if ((data.week as unknown as { status: string }).status !== "aberta") redirect(`/semanas/${weekStartOf(data.occurred_on)}`);
    existing = {
      id: data.id,
      occurredOn: data.occurred_on,
      origem: data.origem,
      destino: data.destino,
      km: data.km === null ? "" : String(data.km).replace(".", ","),
      clientes: data.clientes ?? "",
    };
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{existing ? "Editar percurso" : "Adicionar percurso"}</h1>
      <p className="text-sm text-muted-foreground">
        Opcional. Registre trechos (ex.: São Paulo → Campinas, Campinas → Sorocaba). Não altera os valores gastos.
      </p>
      <RouteForm existing={existing} defaultDate={suggestedDateForWeek(semana)} minDate={settings.data_inicio_operacao} maxDate={maxEntryDate()} />
    </div>
  );
}
