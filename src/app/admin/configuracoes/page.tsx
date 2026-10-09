import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const viewer = await requireRole(["admin"]);
  const s = await getSettings(viewer.supabase);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <SettingsForm settings={s} />
    </div>
  );
}
