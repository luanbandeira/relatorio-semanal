import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RouteIcon, WalletIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { WeekStatus } from "@/components/status";
import { WeekEntries } from "@/components/week-entries";
import { addDays, formatWeekRange, todayLocal, weekStartOf } from "@/lib/dates";
import type { Viewer, Profile } from "@/lib/auth";
import { balanceFor, getWeek, weekBalances } from "@/lib/queries";
import { WeekClosing } from "@/components/week-closing";
import { cn } from "@/lib/utils";

/**
 * Semana do funcionário: fechamento (crédito anterior, recebido, gasto e
 * resultado), status e ações de lançamento. O
 * funcionário vê o próprio saldo.
 */
export async function EmployeeWeek({
  viewer,
  subject,
  weekStart,
  highlight,
  minWeekStart,
  toleranceDays,
}: {
  viewer: Viewer;
  subject: Profile;
  weekStart: string;
  highlight?: boolean;
  minWeekStart: string;
  toleranceDays: number;
}) {
  const [data, balances] = await Promise.all([
    getWeek(viewer.supabase, subject.id, weekStart),
    weekBalances(viewer.supabase, subject.id),
  ]);
  const closing = balanceFor(balances, weekStart);
  const open = data.totals.status === "aberta";
  const currentWeek = weekStartOf(todayLocal());
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const q = `?semana=${weekStart}`;

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="semana-titulo"
        className={cn("rounded-2xl border p-4", highlight && "border-blue-200 bg-info-bg")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{weekStart === currentWeek ? "Semana atual" : "Semana"}</p>
            <h1 id="semana-titulo" className="text-xl font-semibold">
              {formatWeekRange(weekStart)}
            </h1>
          </div>
          <WeekStatus status={data.totals.status} audience="funcionario" />
        </div>

        <WeekClosing week={closing} toleranceDays={toleranceDays} />

        {open ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link href={`/lancar/despesa${q}`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
              <PlusIcon aria-hidden="true" /> Adicionar despesa
            </Link>
            <Link href={`/lancar/recebimento${q}`} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}>
              <WalletIcon aria-hidden="true" /> Adicionar recebimento
            </Link>
            <Link href={`/lancar/percurso${q}`} className={cn(buttonVariants({ variant: "ghost" }), "w-full")}>
              <RouteIcon aria-hidden="true" /> Adicionar percurso
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Semana encerrada: disponível apenas para consulta.</p>
        )}
      </section>

      <nav aria-label="Navegar entre semanas" className="flex items-center justify-between gap-2">
        {prev >= minWeekStart ? (
          <Link href={`/semanas/${prev}`} className={buttonVariants({ variant: "outline" })}>
            <ChevronLeftIcon aria-hidden="true" /> Semana anterior
          </Link>
        ) : (
          <span />
        )}
        {next <= currentWeek && (
          <Link href={next === currentWeek ? "/inicio" : `/semanas/${next}`} className={buttonVariants({ variant: "outline" })}>
            Próxima semana <ChevronRightIcon aria-hidden="true" />
          </Link>
        )}
      </nav>

      <WeekEntries
        weekStart={weekStart}
        expenses={data.expenses}
        receipts={data.receipts}
        routes={data.routes}
        editable={open}
      />
    </div>
  );
}
