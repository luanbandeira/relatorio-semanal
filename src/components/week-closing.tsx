import { formatCents } from "@/lib/money";
import type { AdminWeek } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { autoSettleMessage } from "@/lib/auto-settle";

/**
 * Fechamento da semana na visão do funcionário:
 * crédito da semana anterior + recebido − gasto = resultado.
 * Positivo: crédito que fica com o funcionário para a próxima semana.
 * Negativo: valor que a empresa ainda precisa enviar.
 */
export function WeekClosing({ week, toleranceDays }: { week: AdminWeek; toleranceDays: number }) {
  const b = week.balance_cents;
  const settled = week.status === "acertada";
  const resultLabel = b < 0 ? "A receber da empresa" : settled ? "Crédito final" : "Crédito disponível";
  const resultValue = formatCents(Math.abs(b));
  const auto = autoSettleMessage(week, toleranceDays, "funcionario");

  return (
    <div className="mt-4 space-y-2">
      <dl className="grid grid-cols-2 gap-3">
        <Metric label="Crédito da semana anterior" value={formatCents(week.credit_before_cents)} />
        <Metric label="Total recebido" value={formatCents(week.received_cents)} />
        <Metric label="Total gasto" value={formatCents(week.spent_cents)} />
        <Metric label={resultLabel} value={resultValue} tone={b < 0 ? "warning" : "success"} />
      </dl>
      <p className="text-sm text-muted-foreground">
        {formatCents(week.credit_before_cents)} + {formatCents(week.received_cents)} − {formatCents(week.spent_cents)} ={" "}
        <strong className={b < 0 ? "text-warning" : "text-success"}>
          {b < 0 ? `faltam ${resultValue}` : `${resultValue} de crédito`}
        </strong>
        {settled ? (week.settled_automatically ? " (acertada automaticamente)." : " (semana acertada).") : "."}
      </p>
      {!settled && (
        <p className="text-sm text-muted-foreground">
          Valor provisório: muda conforme você lança gastos e recebimentos. É confirmado no acerto da semana.
        </p>
      )}
      {auto && (
        <p className={cn("text-sm font-medium", auto.tone === "warning" ? "text-warning" : "text-accent-foreground")}>
          {auto.text}
        </p>
      )}
      {!settled && week.pending_previous && (
        <p className="text-sm text-warning">A semana anterior ainda não foi acertada; o crédito anterior pode mudar.</p>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-background p-3",
        tone === "warning" && "ring-1 ring-amber-200",
        tone === "success" && "ring-1 ring-green-200",
      )}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-heading",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
