import { FileSpreadsheetIcon, FileTextIcon } from "lucide-react";
import { canSeeInactive, requireViewer } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { getCategories, listEmployees } from "@/lib/queries";
import { reportFilterSchema } from "@/lib/validation";
import { formatDateBR, todayLocal } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/status";

const MAX_ROWS = 500;

export default async function ReportsPage(props: PageProps<"/admin/relatorios">) {
  const viewer = await requireViewer();
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);

  const mes = one("mes") ?? (one("de") || one("ate") ? undefined : todayLocal().slice(0, 7));
  const parsed = reportFilterSchema.safeParse({
    employeeIds: one("funcionario") ? [one("funcionario")] : [],
    categoryIds: one("categoria") ? [one("categoria")] : [],
    month: mes,
    from: mes ? undefined : one("de"),
    to: mes ? undefined : one("ate"),
    status: one("status"),
  });

  const [employees, categories] = await Promise.all([
    listEmployees(viewer.supabase, canSeeInactive(viewer.profile.role)),
    getCategories(viewer.supabase, true),
  ]);
  const report = parsed.success ? await buildReport(viewer, parsed.data) : null;

  const qs = new URLSearchParams();
  if (parsed.success) {
    const f = parsed.data;
    f.employeeIds.forEach((id) => qs.append("funcionario", id));
    f.categoryIds.forEach((id) => qs.append("categoria", id));
    if (f.month) qs.set("mes", f.month);
    if (f.from) qs.set("de", f.from);
    if (f.to) qs.set("ate", f.to);
    if (f.status) qs.set("status", f.status);
  }
  const totalLabel = parsed.success && parsed.data.month ? "Total registrado no mês" : "Total registrado no período";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Relatórios</h1>

      <form method="get" className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="funcionario">Funcionário</Label>
          <NativeSelect id="funcionario" name="funcionario" defaultValue={one("funcionario") ?? ""}>
            <option value="">Todos</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name} ({e.username}){e.active ? "" : " - desativado"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mes">Mês</Label>
          <Input id="mes" name="mes" type="month" defaultValue={mes ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="de">De</Label>
            <Input id="de" name="de" type="date" defaultValue={one("de") ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" name="ate" type="date" defaultValue={one("ate") ?? ""} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria">Categoria</Label>
          <NativeSelect id="categoria" name="categoria" defaultValue={one("categoria") ?? ""}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? "" : " (inativa)"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status da semana</Label>
          <NativeSelect id="status" name="status" defaultValue={one("status") ?? ""}>
            <option value="">Todos</option>
            <option value="aberta">Em aberto</option>
            <option value="acertada">Acertada</option>
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonVariants()}>
            Aplicar filtros
          </button>
          <a href="/admin/relatorios" className={buttonVariants({ variant: "ghost" })}>
            Limpar
          </a>
        </div>
        <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
          Para usar intervalo de datas, deixe o mês em branco. O total segue a data real de cada lançamento.
        </p>
      </form>

      {!report ? (
        <Notice tone="error">Filtros inválidos. Confira as datas.</Notice>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">
              {report.period.label} · {report.filtersDescription.join(" · ")}
            </p>
            <a href={`/api/exportar?formato=pdf&${qs}`} className={buttonVariants({ variant: "outline" })}>
              <FileTextIcon aria-hidden="true" /> Exportar PDF
            </a>
            <a href={`/api/exportar?formato=xlsx&${qs}`} className={buttonVariants({ variant: "outline" })}>
              <FileSpreadsheetIcon aria-hidden="true" /> Exportar Excel
            </a>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-muted-foreground">{totalLabel} (despesas)</dt>
              <dd className="text-2xl font-semibold tabular-nums text-heading">{formatCents(report.totals.spentCents)}</dd>
            </div>
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-muted-foreground">{totalLabel} (recebido)</dt>
              <dd className="text-2xl font-semibold tabular-nums text-heading">
                {report.receiptsApplicable ? formatCents(report.totals.receivedCents) : "não se aplica ao filtro por categoria"}
              </dd>
            </div>
          </dl>

          <section className="space-y-2">
            <h2 className="font-semibold">Por funcionário</h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Funcionário</th>
                    <th className="p-2 text-right">Gasto</th>
                    <th className="p-2 text-right">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byEmployee.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2">
                        {e.name} <span className="text-muted-foreground">({e.username})</span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatCents(e.spentCents)}</td>
                      <td className="p-2 text-right tabular-nums">{formatCents(e.receivedCents)}</td>
                    </tr>
                  ))}
                  {report.byEmployee.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-muted-foreground">
                        Nenhum lançamento no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Despesas ({report.expenses.length})</h2>
            {report.expenses.length > MAX_ROWS && (
              <Notice tone="info">Mostrando as primeiras {MAX_ROWS}. A exportação inclui todas.</Notice>
            )}
            <ul className="divide-y rounded-xl border md:hidden">
              {report.expenses.slice(0, MAX_ROWS).map((e, i) => (
                <li key={i} className="p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{formatDateBR(e.occurred_on)} · {e.category}</span>
                    <span className="font-semibold tabular-nums">{formatCents(e.amount_cents)}</span>
                  </div>
                  <p>{e.description}</p>
                  <p className="text-muted-foreground">{e.employee_name} ({e.employee_username})</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Data</th>
                    <th className="p-2">Funcionário</th>
                    <th className="p-2">Categoria</th>
                    <th className="p-2">Descrição</th>
                    <th className="p-2">Semana</th>
                    <th className="p-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenses.slice(0, MAX_ROWS).map((e, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2 whitespace-nowrap">{formatDateBR(e.occurred_on)}</td>
                      <td className="p-2">{e.employee_name}</td>
                      <td className="p-2">{e.category}</td>
                      <td className="p-2">{e.description}</td>
                      <td className="p-2 whitespace-nowrap">
                        {formatDateBR(e.week_start)} ({e.week_status === "aberta" ? "em aberto" : "acertada"})
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatCents(e.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {report.receiptsApplicable && (
            <section className="space-y-2">
              <h2 className="font-semibold">Valores recebidos da empresa ({report.receipts.length})</h2>
              <ul className="divide-y rounded-xl border">
                {report.receipts.slice(0, MAX_ROWS).map((r, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                    <span>
                      <span className="font-medium">{formatDateBR(r.received_on)}</span> · {r.employee_name}
                      {r.description ? ` · ${r.description}` : ""}
                      <span className="text-muted-foreground"> · semana {formatDateBR(r.week_start)}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatCents(r.amount_cents)}</span>
                  </li>
                ))}
                {report.receipts.length === 0 && <li className="p-4 text-center text-muted-foreground">Nenhum recebimento no período.</li>}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
