import { requireRole } from "@/lib/auth";
import { formatDateTimeBR } from "@/lib/dates";

const ENTITY: Record<string, string> = {
  expenses: "Despesa",
  receipts: "Recebimento",
  routes: "Percurso",
  attachments: "Anexo",
  employee_weeks: "Semana",
  settlements: "Acerto",
  profiles: "Conta",
  categories: "Categoria",
  app_settings: "Configuração",
  support_sessions: "Suporte",
};

type Event = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  employee_id: string | null;
  support_session_id: string | null;
  entity: string;
  action: string;
  reason: string | null;
};

export default async function AuditPage(props: PageProps<"/admin/auditoria">) {
  const viewer = await requireRole(["admin"]);
  const sp = await props.searchParams;
  const employee = typeof sp.funcionario === "string" && /^[0-9a-f-]{36}$/i.test(sp.funcionario) ? sp.funcionario : null;

  let q = viewer.supabase
    .from("audit_events")
    .select("id, occurred_at, actor_id, employee_id, support_session_id, entity, action, reason")
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (employee) q = q.eq("employee_id", employee);
  const { data } = await q;
  const events = (data ?? []) as Event[];

  const ids = [...new Set(events.flatMap((e) => [e.actor_id, e.employee_id]).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await viewer.supabase.from("profiles").select("id, full_name, username").in("id", ids)
    : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, `${p.full_name} (${p.username})`]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Auditoria</h1>
      <p className="text-sm text-muted-foreground">Últimos 300 eventos. Ator é sempre quem executou (inclusive no modo de suporte).</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2">Quando</th>
              <th className="p-2">Ator</th>
              <th className="p-2">Funcionário afetado</th>
              <th className="p-2">Ação</th>
              <th className="p-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{formatDateTimeBR(e.occurred_at)}</td>
                <td className="p-2">
                  {e.actor_id ? name.get(e.actor_id) ?? e.actor_id : "sistema"}
                  {e.support_session_id && <span className="block text-xs text-warning">via suporte</span>}
                </td>
                <td className="p-2">{e.employee_id ? name.get(e.employee_id) ?? "-" : "-"}</td>
                <td className="p-2">
                  {ENTITY[e.entity] ?? e.entity}: {e.action.replace(/_/g, " ")}
                </td>
                <td className="p-2">{e.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
