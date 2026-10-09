import { redirect } from "next/navigation";
import { requireViewer, subjectOf } from "@/lib/auth";
import { todayLocal, weekStartOf } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { oldestWeekStart } from "@/lib/queries";
import { EmployeeWeek } from "@/components/employee-week";
import { Greeting } from "@/components/greeting";

export default async function InicioPage() {
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");
  const settings = await getSettings(viewer.supabase);
  return (
    <div className="space-y-4">
      <Greeting fullName={viewer.profile.full_name} />
      <EmployeeWeek
        viewer={viewer}
        subject={subject}
        weekStart={weekStartOf(todayLocal())}
        minWeekStart={await oldestWeekStart(viewer.supabase, subject.id, settings.data_inicio_operacao)}
        toleranceDays={settings.acerto_automatico_tolerancia_dias}
        highlight
      />
    </div>
  );
}
