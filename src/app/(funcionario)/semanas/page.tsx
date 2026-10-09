import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { requireViewer, subjectOf } from "@/lib/auth";
import { addDays, formatWeekRange, todayLocal, weekStartOf } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { balanceFor, weekBalances } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { WeekStatus } from "@/components/status";

export default async function WeeksPage() {
  const viewer = await requireViewer();
  const subject = subjectOf(viewer);
  if (!subject) redirect("/admin");
  const [weeks, settings] = await Promise.all([weekBalances(viewer.supabase, subject.id), getSettings(viewer.supabase)]);

  // Todas as semanas desde o início da operação, inclusive as vazias
  // (podem ser preenchidas retroativamente enquanto abertas).
  const current = weekStartOf(todayLocal());
  const starts: string[] = [];
  const oldest = weeks.at(-1)?.week_start;
  const floor = oldest && oldest < settings.data_inicio_operacao ? oldest : settings.data_inicio_operacao;
  for (let s = current; s >= floor; s = addDays(s, -7)) starts.push(s);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Semanas</h1>
      <ul className="space-y-2">
        {starts.map((s) => {
          const w = balanceFor(weeks, s);
          const b = w.balance_cents;
          return (
            <li key={s}>
              <Link
                href={s === current ? "/inicio" : `/semanas/${s}`}
                className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-heading">
                    {formatWeekRange(s)} {s === current && <span className="text-sm text-primary">(atual)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Crédito anterior {formatCents(w.credit_before_cents)} · Recebido {formatCents(w.received_cents)} · Gasto{" "}
                    {formatCents(w.spent_cents)}
                  </p>
                  <p className={b < 0 ? "text-sm font-medium text-warning" : "text-sm font-medium text-success"}>
                    {b < 0
                      ? `A receber da empresa: ${formatCents(-b)}`
                      : `${w.status === "acertada" ? "Crédito final" : "Crédito disponível"}: ${formatCents(b)}`}
                  </p>
                </div>
                <WeekStatus status={w.status} audience="funcionario" />
                <ChevronRightIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
