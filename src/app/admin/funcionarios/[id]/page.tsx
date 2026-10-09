import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDownIcon, UserXIcon } from "lucide-react";
import { canSettle, requireViewer, type Profile, PROFILE_COLUMNS } from "@/lib/auth";
import { adminWeeks, balanceFor, getEntriesForWeeks, type AdminWeek } from "@/lib/queries";
import { formatDateTimeBR, formatWeekRange, todayLocal, weekStartOf } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { UserAvatar } from "@/components/user-avatar";
import { UnitBadge } from "@/components/unit-badge";
import { Notice, WeekStatus } from "@/components/status";
import { WeekEntries } from "@/components/week-entries";
import { buttonVariants } from "@/components/ui/button";
import { SettleButton, ReopenButton, SupportButton } from "./week-actions";
import { getSettings } from "@/lib/settings";
import { autoSettleMessage } from "@/lib/auto-settle";

const PAGE = 8;

export default async function EmployeeDetail(props: PageProps<"/admin/funcionarios/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const viewer = await requireViewer();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // RLS decide o acesso (Visualizador não vê desativados, inclusive por URL direta).
  const { data: employee } = await viewer.supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .eq("role", "funcionario")
    .maybeSingle<Profile>();
  if (!employee) notFound();

  const current = weekStartOf(todayLocal());
  const [weeks, settings] = await Promise.all([adminWeeks(viewer.supabase, id), getSettings(viewer.supabase)]);
  // Semana atual aparece mesmo sem lançamentos.
  if (!weeks.some((w) => w.week_start === current)) weeks.unshift(balanceFor(weeks, current));
  const limit = Math.min(Number(sp.semanas) || PAGE, 200);
  const shown = weeks.slice(0, limit);
  const entries = await getEntriesForWeeks(
    viewer.supabase,
    id,
    shown.map((w) => w.week_start),
  );
  const mayAct = canSettle(viewer.profile.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar userId={employee.id} name={employee.full_name} avatar={employee.avatar} hasPhoto={!!employee.photo_path} size="lg" />
        <div className="mr-auto min-w-0">
          <h1 className="text-xl font-semibold">{employee.full_name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            usuário {employee.username}
            <UnitBadge unit={employee.unit} />
          </p>
          {!employee.active && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-destructive">
              <UserXIcon className="size-4" aria-hidden="true" /> Conta desativada (histórico preservado)
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/relatorios?funcionario=${employee.id}`} className={buttonVariants({ variant: "outline" })}>
            <FileDownIcon aria-hidden="true" /> Relatório
          </Link>
          {viewer.profile.role === "admin" && employee.active && <SupportButton employeeId={employee.id} />}
        </div>
      </div>

      <ol className="space-y-4">
        {shown.map((w) => (
          <WeekCard
            key={w.week_start}
            week={w}
            employeeId={id}
            mayAct={mayAct}
            toleranceDays={settings.acerto_automatico_tolerancia_dias}
            laterSettledWeeks={weeks.filter((x) => x.week_start > w.week_start && x.status === "acertada").map((x) => x.week_start)}
            entries={entries.get(w.week_start)!}
          />
        ))}
      </ol>
      {weeks.length > shown.length && (
        <Link href={`?semanas=${limit + PAGE}`} className={buttonVariants({ variant: "outline" })} scroll={false}>
          Mostrar semanas mais antigas
        </Link>
      )}
    </div>
  );
}

function WeekCard({
  week: w,
  employeeId,
  mayAct,
  toleranceDays,
  laterSettledWeeks,
  entries,
}: {
  week: AdminWeek;
  employeeId: string;
  mayAct: boolean;
  toleranceDays: number;
  laterSettledWeeks: string[];
  entries: Awaited<ReturnType<typeof getEntriesForWeeks>> extends Map<string, infer V> ? V : never;
}) {
  const toSettle = w.balance_cents < 0 ? -w.balance_cents : 0;
  const auto = autoSettleMessage(w, toleranceDays, "admin");
  const blocker =
    w.balance_cents < 0
      ? "Ainda falta dinheiro: aguarde o funcionário registrar o recebimento."
      : w.pending_previous
        ? "Há semana anterior com lançamentos ainda aberta. Acerte em ordem."
        : w.later_settled
          ? "Há semana posterior já acertada. Reabra-a antes."
          : null;

  return (
    <li className="rounded-2xl border">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <h2 className="mr-auto text-lg font-semibold">{formatWeekRange(w.week_start)}</h2>
        <WeekStatus status={w.status} audience="admin" />
      </div>
      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Crédito anterior" value={formatCents(w.credit_before_cents)} />
          <Metric label="Recebido" value={formatCents(w.received_cents)} />
          <Metric label="Gasto" value={formatCents(w.spent_cents)} />
          {toSettle > 0 ? (
            <Metric label="A acertar" value={formatCents(toSettle)} tone="warning" />
          ) : (
            <Metric label={w.status === "acertada" ? "Crédito final" : "Crédito disponível"} value={formatCents(w.balance_cents)} tone="success" />
          )}
        </dl>
        {auto && <Notice tone={auto.tone}>{auto.text}</Notice>}
        {w.status === "aberta" && w.pending_previous && (
          <Notice tone="warning">Crédito anterior provisório: existe semana anterior com lançamentos ainda aberta.</Notice>
        )}
        {w.status === "aberta" && w.has_entries && (
          <p className="text-sm text-muted-foreground">Saldo provisório: o funcionário ainda pode completar lançamentos.</p>
        )}
        {w.status === "acertada" && w.settled_at && (
          <p className="text-sm text-muted-foreground">
            {w.settled_automatically ? "Acertada automaticamente em " : "Acertada em "}
            {formatDateTimeBR(w.settled_at)}
            {!w.settled_automatically && w.settled_by_name ? ` por ${w.settled_by_name}` : ""}.
          </p>
        )}
        {mayAct && (
          <div className="flex flex-wrap items-center gap-2">
            {w.status === "aberta" ? (
              <SettleButton
                employeeId={employeeId}
                weekStart={w.week_start}
                version={w.week_id ? w.version : null}
                blocker={blocker}
                summary={{
                  credit: w.credit_before_cents,
                  received: w.received_cents,
                  spent: w.spent_cents,
                  balance: w.balance_cents,
                }}
              />
            ) : (
              <ReopenButton employeeId={employeeId} weekStart={w.week_start} laterSettled={laterSettledWeeks} />
            )}
          </div>
        )}
        <details className="group">
          <summary className="flex h-11 cursor-pointer items-center rounded-lg px-2 font-medium text-primary hover:bg-muted">
            Ver lançamentos ({entries.expenses.length} despesas, {entries.receipts.length} recebimentos, {entries.routes.length} percursos)
          </summary>
          <div className="mt-3">
            <WeekEntries weekStart={w.week_start} expenses={entries.expenses} receipts={entries.receipts} routes={entries.routes} editable={false} />
          </div>
        </details>
      </div>
    </li>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-heading";
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
