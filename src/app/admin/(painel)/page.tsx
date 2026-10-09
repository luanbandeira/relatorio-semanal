import { canSeeInactive, requireViewer, isAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listEmployees, owedSummary } from "@/lib/queries";
import { EmployeeGrid } from "./employee-grid";
import { Greeting } from "@/components/greeting";

export default async function AdminHome(props: PageProps<"/admin">) {
  const viewer = await requireViewer();
  if (!isAdminRole(viewer.profile.role)) redirect("/inicio");
  const sp = await props.searchParams;
  const allowInactive = canSeeInactive(viewer.profile.role);
  const showInactive = allowInactive && sp.desativados === "1";
  const [employees, owed] = await Promise.all([listEmployees(viewer.supabase, showInactive), owedSummary(viewer.supabase)]);

  return (
    <div className="space-y-4">
      <Greeting fullName={viewer.profile.full_name} />
      <h1 className="text-xl font-semibold">Funcionários</h1>
      <EmployeeGrid
        employees={employees}
        owed={Object.fromEntries(owed)}
        allowInactive={allowInactive}
        showInactive={showInactive}
      />
    </div>
  );
}
