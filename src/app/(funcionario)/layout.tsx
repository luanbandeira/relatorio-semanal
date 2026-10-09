import { redirect } from "next/navigation";
import { requireViewer, subjectOf } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { SupportBanner } from "@/components/support-banner";

export default async function EmployeeLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");

  return (
    <>
      {viewer.support && (
        <SupportBanner
          employeeId={viewer.support.employee.id}
          employeeName={viewer.support.employee.full_name}
          username={viewer.support.employee.username}
          expiresAt={viewer.support.expiresAt}
        />
      )}
      <AppHeader
        profile={viewer.profile}
        nav={[
          { href: "/inicio", label: "Semana atual" },
          { href: "/semanas", label: "Semanas anteriores" },
        ]}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-16">{children}</main>
    </>
  );
}
