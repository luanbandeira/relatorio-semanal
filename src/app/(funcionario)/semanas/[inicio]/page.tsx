import { notFound, redirect } from "next/navigation";
import { requireViewer, subjectOf } from "@/lib/auth";
import { isMonday, todayLocal, weekStartOf } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { oldestWeekStart } from "@/lib/queries";
import { EmployeeWeek } from "@/components/employee-week";

export default async function WeekPage(props: PageProps<"/semanas/[inicio]">) {
  const { inicio } = await props.params;
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");
  if (!isMonday(inicio) || inicio > weekStartOf(todayLocal())) notFound();
  if (inicio === weekStartOf(todayLocal())) redirect("/inicio");
  const settings = await getSettings(viewer.supabase);
  const floor = await oldestWeekStart(viewer.supabase, subject.id, settings.data_inicio_operacao);
  if (inicio < floor) notFound();
  return <EmployeeWeek viewer={viewer} subject={subject} weekStart={inicio} minWeekStart={floor} toleranceDays={settings.acerto_automatico_tolerancia_dias} />;
}
