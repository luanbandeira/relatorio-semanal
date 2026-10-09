import "server-only";
import type { Viewer } from "@/lib/auth";
import type { IsoDate } from "@/lib/dates";

type Client = Viewer["supabase"];

export type Category = { id: string; name: string; grupo: "percurso" | "outras"; active: boolean; sort_order: number };

export type ExpenseRow = {
  id: string;
  occurred_on: IsoDate;
  amount_cents: number;
  category_id: string;
  grupo: "percurso" | "outras";
  description: string;
  km: number | null;
  origem: string | null;
  destino: string | null;
  clientes: string | null;
  has_receipt: boolean;
  created_at: string;
  category: { name: string } | null;
  attachments: { id: string; mime_type: string; original_name: string | null; size_bytes: number }[];
};

export type ReceiptRow = {
  id: string;
  received_on: IsoDate;
  amount_cents: number;
  description: string | null;
  created_at: string;
};

export type RouteRow = {
  id: string;
  occurred_on: IsoDate;
  origem: string;
  destino: string;
  km: number | null;
  clientes: string | null;
};

export type WeekTotals = {
  week_id: string | null;
  status: "aberta" | "acertada";
  version: number;
  spent_cents: number;
  received_cents: number;
};

export async function getCategories(supabase: Client, includeInactive = false): Promise<Category[]> {
  let q = supabase.from("categories").select("id, name, grupo, active, sort_order").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getWeek(supabase: Client, employeeId: string, weekStart: IsoDate) {
  const [totals, expenses, receipts, routes] = await Promise.all([
    supabase.rpc("week_totals", { p_employee_id: employeeId, p_week_start: weekStart }).single<WeekTotals>(),
    supabase
      .from("expenses")
      .select(
        "id, occurred_on, amount_cents, category_id, grupo, description, km, origem, destino, clientes, has_receipt, created_at, category:categories(name), attachments(id, mime_type, original_name, size_bytes, deleted_at), week:employee_weeks!inner(week_start)",
      )
      .eq("employee_id", employeeId)
      .eq("week.week_start", weekStart)
      .is("attachments.deleted_at", null)
      .order("occurred_on")
      .order("created_at"),
    supabase
      .from("receipts")
      .select("id, received_on, amount_cents, description, created_at, week:employee_weeks!inner(week_start)")
      .eq("employee_id", employeeId)
      .eq("week.week_start", weekStart)
      .order("received_on")
      .order("created_at"),
    supabase
      .from("routes")
      .select("id, occurred_on, origem, destino, km, clientes, created_at, week:employee_weeks!inner(week_start)")
      .eq("employee_id", employeeId)
      .eq("week.week_start", weekStart)
      .order("occurred_on")
      .order("created_at"),
  ]);
  for (const r of [totals, expenses, receipts, routes]) if (r.error) throw r.error;
  const t = totals.data!;
  return {
    totals: {
      ...t,
      spent_cents: Number(t.spent_cents),
      received_cents: Number(t.received_cents),
    } as WeekTotals,
    expenses: (expenses.data ?? []).map((e) => ({ ...e, amount_cents: Number(e.amount_cents) })) as unknown as ExpenseRow[],
    receipts: (receipts.data ?? []).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) })) as unknown as ReceiptRow[],
    routes: (routes.data ?? []) as unknown as RouteRow[],
  };
}

/** Lançamentos de várias semanas de um funcionário em 3 consultas (agrupados por semana). */
export async function getEntriesForWeeks(supabase: Client, employeeId: string, weekStarts: IsoDate[]) {
  if (weekStarts.length === 0) return new Map<IsoDate, { expenses: ExpenseRow[]; receipts: ReceiptRow[]; routes: RouteRow[] }>();
  const [expenses, receipts, routes] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("expenses")
        .select(
          "id, occurred_on, amount_cents, category_id, grupo, description, km, origem, destino, clientes, has_receipt, created_at, category:categories(name), attachments(id, mime_type, original_name, size_bytes), week:employee_weeks!inner(week_start)",
        )
        .eq("employee_id", employeeId)
        .in("week.week_start", weekStarts)
        .order("occurred_on")
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("receipts")
        .select("id, received_on, amount_cents, description, created_at, week:employee_weeks!inner(week_start)")
        .eq("employee_id", employeeId)
        .in("week.week_start", weekStarts)
        .order("received_on")
        .range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("routes")
        .select("id, occurred_on, origem, destino, km, clientes, created_at, week:employee_weeks!inner(week_start)")
        .eq("employee_id", employeeId)
        .in("week.week_start", weekStarts)
        .order("occurred_on")
        .range(from, to),
    ),
  ]);
  const out = new Map<IsoDate, { expenses: ExpenseRow[]; receipts: ReceiptRow[]; routes: RouteRow[] }>();
  for (const ws of weekStarts) out.set(ws, { expenses: [], receipts: [], routes: [] });
  const wsOf = (r: Record<string, unknown>) => (r.week as { week_start: IsoDate }).week_start;
  for (const e of expenses) out.get(wsOf(e))?.expenses.push({ ...e, amount_cents: Number(e.amount_cents) } as unknown as ExpenseRow);
  for (const r of receipts) out.get(wsOf(r))?.receipts.push({ ...r, amount_cents: Number(r.amount_cents) } as unknown as ReceiptRow);
  for (const r of routes) out.get(wsOf(r))?.routes.push(r as unknown as RouteRow);
  return out;
}

/**
 * Semana mais antiga navegável pelo funcionário: o início da operação ou, se
 * houver, a semana mais antiga que já tem registro.
 */
export async function oldestWeekStart(supabase: Client, employeeId: string, operationStart: IsoDate): Promise<IsoDate> {
  const { data } = await supabase
    .from("employee_weeks")
    .select("week_start")
    .eq("employee_id", employeeId)
    .order("week_start")
    .limit(1)
    .maybeSingle<{ week_start: IsoDate }>();
  return data && data.week_start < operationStart ? data.week_start : operationStart;
}

export type WeekListItem = {
  week_id: string;
  week_start: IsoDate;
  status: "aberta" | "acertada";
  spent_cents: number;
  received_cents: number;
};

export async function listWeeks(supabase: Client, employeeId: string): Promise<WeekListItem[]> {
  const { data, error } = await supabase.rpc("employee_week_list", { p_employee_id: employeeId });
  if (error) throw error;
  return ((data ?? []) as WeekListItem[]).map((w) => ({
    ...w,
    spent_cents: Number(w.spent_cents),
    received_cents: Number(w.received_cents),
  }));
}

export type AdminWeek = {
  week_id: string;
  week_start: IsoDate;
  status: "aberta" | "acertada";
  version: number;
  spent_cents: number;
  received_cents: number;
  credit_before_cents: number;
  balance_cents: number;
  has_entries: boolean;
  pending_previous: boolean;
  later_settled: boolean;
  settled_at: string | null;
  settled_by_name: string | null;
  settled_automatically: boolean;
};

export async function adminWeeks(supabase: Client, employeeId: string): Promise<AdminWeek[]> {
  const { data, error } = await supabase.rpc("admin_employee_weeks", { p_employee_id: employeeId });
  if (error) throw error;
  return ((data ?? []) as AdminWeek[]).map((w) => ({
    ...w,
    spent_cents: Number(w.spent_cents),
    received_cents: Number(w.received_cents),
    credit_before_cents: Number(w.credit_before_cents),
    balance_cents: Number(w.balance_cents),
  }));
}

/** Fechamento das semanas: o próprio funcionário ou a administração (RLS decide). */
export async function weekBalances(supabase: Client, employeeId: string): Promise<AdminWeek[]> {
  const { data, error } = await supabase.rpc("week_balances", { p_employee_id: employeeId });
  if (error) throw error;
  return ((data ?? []) as AdminWeek[]).map((w) => ({
    ...w,
    spent_cents: Number(w.spent_cents),
    received_cents: Number(w.received_cents),
    credit_before_cents: Number(w.credit_before_cents),
    balance_cents: Number(w.balance_cents),
  }));
}

/**
 * Fechamento de uma semana; se ela ainda não tem registro, o crédito anterior
 * vem do último acerto válido antes dela (mesma regra do banco).
 */
export function balanceFor(weeks: AdminWeek[], weekStart: IsoDate): AdminWeek {
  const found = weeks.find((w) => w.week_start === weekStart);
  if (found) return found;
  const lastSettled = weeks.find((w) => w.week_start < weekStart && w.status === "acertada");
  const credit = lastSettled?.balance_cents ?? 0;
  return {
    week_id: "",
    week_start: weekStart,
    status: "aberta",
    version: 0,
    spent_cents: 0,
    received_cents: 0,
    credit_before_cents: credit,
    balance_cents: credit,
    has_entries: false,
    pending_previous: weeks.some((w) => w.week_start < weekStart && w.status === "aberta" && w.has_entries),
    later_settled: weeks.some((w) => w.week_start > weekStart && w.status === "acertada"),
    settled_at: null,
    settled_by_name: null,
    settled_automatically: false,
  };
}

/** Unidades já usadas nos cadastros (para sugerir a mesma grafia). */
export async function listCompanies(supabase: Client): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("unit").not("unit", "is", null);
  return [...new Set((data ?? []).map((r) => r.unit as string))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Quanto a empresa deve a cada funcionário (semanas terminadas e abertas com saldo negativo). */
export async function owedSummary(supabase: Client): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("admin_owed_summary");
  if (error) throw error;
  return new Map(((data ?? []) as { employee_id: string; owed_cents: number }[]).map((r) => [r.employee_id, Number(r.owed_cents)]));
}

export type EmployeeCard = {
  id: string;
  full_name: string;
  username: string;
  avatar: "masculino" | "feminino" | "neutro";
  photo_path: string | null;
  active: boolean;
  unit: string | null;
};

export async function listEmployees(supabase: Client, includeInactive: boolean): Promise<EmployeeCard[]> {
  let q = supabase
    .from("profiles")
    .select("id, full_name, username, avatar, photo_path, active, unit")
    .eq("role", "funcionario")
    .order("full_name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EmployeeCard[];
}

/** Busca todas as páginas (o PostgREST limita linhas por requisição). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
