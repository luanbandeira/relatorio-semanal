// Mensagens do acerto automático. A regra em si roda no
// banco (app.auto_settle_employee, a cada 15 minutos); aqui só se explica ao usuário.
import { addDays, formatShortBR, todayLocal, weekdayName, type IsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export type AutoSettleWeek = {
  week_start: IsoDate;
  status: "aberta" | "acertada";
  balance_cents: number;
  pending_previous: boolean;
};

/** Dia em que a semana passa a poder fechar sozinha (domingo + tolerância + 1). */
export function autoCloseDate(weekStart: IsoDate, toleranceDays: number): IsoDate {
  return addDays(weekStart, 7 + toleranceDays);
}

export function weekEnded(weekStart: IsoDate, today: IsoDate = todayLocal()): boolean {
  return today > addDays(weekStart, 6);
}

/**
 * Explica o que vai acontecer com uma semana aberta. Devolve null para
 * semanas acertadas.
 */
export function autoSettleMessage(
  w: AutoSettleWeek,
  toleranceDays: number,
  audience: "funcionario" | "admin",
  today: IsoDate = todayLocal(),
): { tone: "info" | "warning"; text: string } | null {
  if (w.status !== "aberta") return null;
  if (w.balance_cents < 0) {
    if (!weekEnded(w.week_start, today)) return null; // semana em andamento: valor provisório
    const value = formatCents(-w.balance_cents);
    return {
      tone: "warning",
      text:
        audience === "funcionario"
          ? `Falta receber ${value} da empresa. Assim que você lançar o recebimento, a semana fecha sozinha.`
          : `Aguardando o funcionário lançar o recebimento de ${value}. Ao lançar, a semana fecha sozinha.`,
    };
  }
  if (w.pending_previous) {
    return { tone: "info", text: "Fecha sozinha depois que a semana anterior for acertada." };
  }
  const close = autoCloseDate(w.week_start, toleranceDays);
  if (today >= close) return { tone: "info", text: "Fecha automaticamente nos próximos minutos." };
  return { tone: "info", text: `Fecha automaticamente na ${weekdayName(close)}, ${formatShortBR(close)}.` };
}
