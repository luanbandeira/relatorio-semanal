import "server-only";
import type { Viewer } from "@/lib/auth";
import { formatDateBR, monthRange, todayLocal, type IsoDate } from "@/lib/dates";
import { sumCents } from "@/lib/money";
import { fetchAll } from "@/lib/queries";
import type { ReportFilter } from "@/lib/validation";

export type ReportExpense = {
  occurred_on: IsoDate;
  amount_cents: number;
  description: string;
  grupo: "percurso" | "outras";
  has_receipt: boolean;
  km: number | null;
  origem: string | null;
  destino: string | null;
  clientes: string | null;
  employee_id: string;
  category: string;
  week_start: IsoDate;
  week_status: "aberta" | "acertada";
  employee_name: string;
  employee_username: string;
};

export type ReportReceipt = {
  received_on: IsoDate;
  amount_cents: number;
  description: string | null;
  employee_id: string;
  week_start: IsoDate;
  week_status: "aberta" | "acertada";
  employee_name: string;
  employee_username: string;
};

export type ReportData = {
  period: { from: IsoDate; to: IsoDate; label: string };
  filtersDescription: string[];
  generatedAt: Date;
  generatedBy: string;
  expenses: ReportExpense[];
  receipts: ReportReceipt[];
  receiptsApplicable: boolean;
  totals: { spentCents: number; receivedCents: number };
  byEmployee: { id: string; name: string; username: string; spentCents: number; receivedCents: number }[];
  byCategory: { name: string; spentCents: number }[];
};

type EmbeddedWeek = { week_start: IsoDate; status: "aberta" | "acertada" };
type EmbeddedEmployee = { full_name: string; username: string };

/**
 * Monta o relatório com o cliente do próprio usuário: as mesmas políticas RLS
 * da tela valem para a exportação (Visualizador não recebe desativados).
 * O total mensal segue a data real de cada lançamento.
 */
export async function buildReport(viewer: Viewer, filter: ReportFilter): Promise<ReportData> {
  const supabase = viewer.supabase;
  const period = resolvePeriod(filter);

  const expenseRows = await fetchAll<Record<string, unknown>>((from, to) => {
    let q = supabase
      .from("expenses")
      .select(
        "occurred_on, amount_cents, description, grupo, has_receipt, km, origem, destino, clientes, employee_id, category:categories(name), week:employee_weeks!inner(week_start, status), employee:profiles!expenses_employee_id_fkey(full_name, username)",
      )
      .gte("occurred_on", period.from)
      .lte("occurred_on", period.to)
      .order("occurred_on")
      .order("created_at")
      .range(from, to);
    if (filter.employeeIds.length) q = q.in("employee_id", filter.employeeIds);
    if (filter.categoryIds.length) q = q.in("category_id", filter.categoryIds);
    if (filter.status) q = q.eq("week.status", filter.status);
    return q;
  });

  const receiptsApplicable = filter.categoryIds.length === 0;
  const receiptRows = receiptsApplicable
    ? await fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase
          .from("receipts")
          .select(
            "received_on, amount_cents, description, employee_id, week:employee_weeks!inner(week_start, status), employee:profiles!receipts_employee_id_fkey(full_name, username)",
          )
          .gte("received_on", period.from)
          .lte("received_on", period.to)
          .order("received_on")
          .order("created_at")
          .range(from, to);
        if (filter.employeeIds.length) q = q.in("employee_id", filter.employeeIds);
        if (filter.status) q = q.eq("week.status", filter.status);
        return q;
      })
    : [];

  const expenses: ReportExpense[] = expenseRows.map((r) => {
    const week = r.week as EmbeddedWeek;
    const emp = r.employee as EmbeddedEmployee;
    return {
      occurred_on: r.occurred_on as IsoDate,
      amount_cents: Number(r.amount_cents),
      description: r.description as string,
      grupo: r.grupo as "percurso" | "outras",
      has_receipt: Boolean(r.has_receipt),
      km: r.km === null ? null : Number(r.km),
      origem: (r.origem as string) ?? null,
      destino: (r.destino as string) ?? null,
      clientes: (r.clientes as string) ?? null,
      employee_id: r.employee_id as string,
      category: (r.category as { name: string } | null)?.name ?? "",
      week_start: week.week_start,
      week_status: week.status,
      employee_name: emp.full_name,
      employee_username: emp.username,
    };
  });

  const receipts: ReportReceipt[] = receiptRows.map((r) => {
    const week = r.week as EmbeddedWeek;
    const emp = r.employee as EmbeddedEmployee;
    return {
      received_on: r.received_on as IsoDate,
      amount_cents: Number(r.amount_cents),
      description: (r.description as string) ?? null,
      employee_id: r.employee_id as string,
      week_start: week.week_start,
      week_status: week.status,
      employee_name: emp.full_name,
      employee_username: emp.username,
    };
  });

  const employeeMap = new Map<string, ReportData["byEmployee"][number]>();
  const touch = (id: string, name: string, username: string) => {
    if (!employeeMap.has(id)) employeeMap.set(id, { id, name, username, spentCents: 0, receivedCents: 0 });
    return employeeMap.get(id)!;
  };
  for (const e of expenses) touch(e.employee_id, e.employee_name, e.employee_username).spentCents += e.amount_cents;
  for (const r of receipts) touch(r.employee_id, r.employee_name, r.employee_username).receivedCents += r.amount_cents;

  const categoryMap = new Map<string, number>();
  for (const e of expenses) categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + e.amount_cents);

  const filtersDescription = await describeFilters(viewer, filter);

  return {
    period,
    filtersDescription,
    generatedAt: new Date(),
    generatedBy: viewer.profile.full_name,
    expenses,
    receipts,
    receiptsApplicable,
    totals: {
      spentCents: sumCents(expenses.map((e) => e.amount_cents)),
      receivedCents: sumCents(receipts.map((r) => r.amount_cents)),
    },
    byEmployee: [...employeeMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    byCategory: [...categoryMap.entries()]
      .map(([name, spentCents]) => ({ name, spentCents }))
      .sort((a, b) => b.spentCents - a.spentCents),
  };
}

export function resolvePeriod(filter: ReportFilter): { from: IsoDate; to: IsoDate; label: string } {
  if (filter.month) {
    const { from, to } = monthRange(filter.month);
    const [y, m] = filter.month.split("-");
    return { from, to, label: `Mês ${m}/${y}` };
  }
  const today = todayLocal();
  const from = filter.from ?? monthRange(today.slice(0, 7)).from;
  const to = filter.to ?? today;
  return { from, to, label: `${formatDateBR(from)} a ${formatDateBR(to)}` };
}

async function describeFilters(viewer: Viewer, filter: ReportFilter): Promise<string[]> {
  const out: string[] = [];
  if (filter.employeeIds.length) {
    const { data } = await viewer.supabase.from("profiles").select("full_name, username").in("id", filter.employeeIds);
    out.push(`Funcionários: ${(data ?? []).map((p) => `${p.full_name} (${p.username})`).join(", ") || "nenhum acessível"}`);
  } else {
    out.push("Funcionários: todos os acessíveis");
  }
  if (filter.categoryIds.length) {
    const { data } = await viewer.supabase.from("categories").select("name").in("id", filter.categoryIds);
    out.push(`Categorias: ${(data ?? []).map((c) => c.name).join(", ")}`);
  }
  if (filter.status) out.push(`Status da semana: ${filter.status === "aberta" ? "Aberta" : "Acertada"}`);
  return out;
}
