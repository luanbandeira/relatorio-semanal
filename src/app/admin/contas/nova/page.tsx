import { requireRole } from "@/lib/auth";
import { AccountForm } from "../account-form";
import { listCompanies } from "@/lib/queries";

export default async function NewAccountPage() {
  const viewer = await requireRole(["admin"]);
  const units = await listCompanies(viewer.supabase);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Nova conta</h1>
      <p className="text-sm text-muted-foreground">
        Uma senha temporária individual será gerada. A pessoa troca a senha no primeiro acesso.
      </p>
      <AccountForm units={units} />
    </div>
  );
}
