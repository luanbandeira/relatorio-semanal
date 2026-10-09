import Link from "next/link";
import { PaperclipIcon, ReceiptTextIcon, RouteIcon, WalletIcon, PencilIcon } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatShortBR, weekDays, weekdayName, formatDateBR } from "@/lib/dates";
import type { ExpenseRow, ReceiptRow, RouteRow } from "@/lib/queries";
import { DeleteEntryButton } from "@/components/delete-entry-button";

type Props = {
  weekStart: string;
  expenses: ExpenseRow[];
  receipts: ReceiptRow[];
  routes: RouteRow[];
  /** Quando true, mostra ações de editar/excluir (semana aberta e quem pode escrever). */
  editable: boolean;
};

/**
 * Dias da semana listados verticalmente, com cada despesa em sua própria
 * linha. Recebimentos e percursos ficam em seções próprias para não misturar
 * entradas e saídas.
 */
export function WeekEntries({ weekStart, expenses, receipts, routes, editable }: Props) {
  const days = weekDays(weekStart);
  return (
    <div className="space-y-6">
      <section aria-labelledby={`despesas-${weekStart}`}>
        <h3 id={`despesas-${weekStart}`} className="mb-2 flex items-center gap-2 text-base font-semibold">
          <WalletIcon className="size-5 text-primary" aria-hidden="true" /> Despesas por dia
        </h3>
        <ol className="divide-y rounded-xl border">
          {days.map((day) => {
            const items = expenses.filter((e) => e.occurred_on === day);
            const total = items.reduce((s, e) => s + e.amount_cents, 0);
            return (
              <li key={day} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium capitalize text-heading">
                    {weekdayName(day)} <span className="font-normal text-muted-foreground">{formatShortBR(day)}</span>
                  </p>
                  <p className={items.length ? "font-medium tabular-nums" : "text-sm text-muted-foreground tabular-nums"}>
                    {formatCents(total)}
                  </p>
                </div>
                {items.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {items.map((e) => (
                      <li key={e.id} className="flex items-start gap-2 rounded-lg bg-muted/60 px-2 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-heading">{e.category?.name}</p>
                          <p className="break-words text-foreground">{e.description}</p>
                          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {e.has_receipt && (
                              <span className="inline-flex items-center gap-1">
                                <ReceiptTextIcon className="size-3.5" aria-hidden="true" /> Comprovante: sim
                              </span>
                            )}
                            {e.attachments.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <PaperclipIcon className="size-3.5" aria-hidden="true" />
                                {e.attachments.map((a, i) => (
                                  <a
                                    key={a.id}
                                    href={`/api/anexos/${a.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline underline-offset-2"
                                  >
                                    anexo {i + 1}
                                  </a>
                                ))}
                              </span>
                            )}
                            {(e.origem || e.destino) && (
                              <span>
                                {e.origem ?? "?"} → {e.destino ?? "?"}
                              </span>
                            )}
                            {e.km !== null && <span>{String(e.km).replace(".", ",")} km</span>}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums">{formatCents(e.amount_cents)}</p>
                        {editable && (
                          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            <Link
                              href={`/lancar/despesa?id=${e.id}`}
                              className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-background"
                              aria-label={`Editar despesa ${e.description}`}
                            >
                              <PencilIcon className="size-4" aria-hidden="true" />
                            </Link>
                            <DeleteEntryButton kind="expense" id={e.id} label={e.description} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby={`recebidos-${weekStart}`}>
        <h3 id={`recebidos-${weekStart}`} className="mb-2 flex items-center gap-2 text-base font-semibold">
          <WalletIcon className="size-5 text-success" aria-hidden="true" /> Valores recebidos da empresa
        </h3>
        {receipts.length === 0 ? (
          <p className="rounded-xl border px-3 py-3 text-sm text-muted-foreground">Nenhum valor recebido registrado.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-heading">{formatDateBR(r.received_on)}</p>
                  {r.description && <p className="break-words">{r.description}</p>}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{formatCents(r.amount_cents)}</p>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Link
                      href={`/lancar/recebimento?id=${r.id}`}
                      className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
                      aria-label="Editar recebimento"
                    >
                      <PencilIcon className="size-4" aria-hidden="true" />
                    </Link>
                    <DeleteEntryButton kind="receipt" id={r.id} label={`recebimento de ${formatCents(r.amount_cents)}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`percursos-${weekStart}`}>
        <h3 id={`percursos-${weekStart}`} className="mb-2 flex items-center gap-2 text-base font-semibold">
          <RouteIcon className="size-5 text-muted-foreground" aria-hidden="true" /> Percursos
        </h3>
        {routes.length === 0 ? (
          <p className="rounded-xl border px-3 py-3 text-sm text-muted-foreground">Nenhum percurso registrado.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {routes.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-heading">
                    {formatShortBR(r.occurred_on)} · {r.origem} → {r.destino}
                  </p>
                  <p className="text-muted-foreground">
                    {r.km !== null ? `${String(r.km).replace(".", ",")} km` : "km não informado"}
                    {r.clientes ? ` · Clientes: ${r.clientes}` : ""}
                  </p>
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Link
                      href={`/lancar/percurso?id=${r.id}`}
                      className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
                      aria-label="Editar percurso"
                    >
                      <PencilIcon className="size-4" aria-hidden="true" />
                    </Link>
                    <DeleteEntryButton kind="route" id={r.id} label={`percurso ${r.origem} → ${r.destino}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
