import { describe, expect, it } from "vitest";
import { autoCloseDate, autoSettleMessage, weekEnded } from "@/lib/auto-settle";

const base = { week_start: "2026-09-28", status: "aberta" as const, balance_cents: 2000, pending_previous: false };

describe("acerto automático (mensagens)", () => {
  it("com 2 dias de tolerância, a semana de 28/09 fecha na quarta 07/10", () => {
    expect(autoCloseDate("2026-09-28", 2)).toBe("2026-10-07");
    expect(autoCloseDate("2026-09-28", 0)).toBe("2026-10-05");
  });
  it("semana termina no domingo", () => {
    expect(weekEnded("2026-09-28", "2026-10-04")).toBe(false);
    expect(weekEnded("2026-09-28", "2026-10-05")).toBe(true);
  });
  it("crédito: informa o dia do fechamento", () => {
    expect(autoSettleMessage(base, 2, "admin", "2026-10-05")?.text).toBe("Fecha automaticamente na quarta, 07/10.");
    expect(autoSettleMessage(base, 2, "admin", "2026-10-07")?.text).toBe("Fecha automaticamente nos próximos minutos.");
  });
  it("empresa deve e semana já terminou: aguarda recebimento", () => {
    const m = autoSettleMessage({ ...base, balance_cents: -3000 }, 2, "funcionario", "2026-10-05");
    expect(m?.tone).toBe("warning");
    expect(m?.text).toContain("R$ 30,00");
    expect(autoSettleMessage({ ...base, balance_cents: -3000 }, 2, "admin", "2026-10-05")?.text).toContain("Aguardando");
  });
  it("semana em andamento com saldo negativo: sem aviso (provisório)", () => {
    expect(autoSettleMessage({ ...base, balance_cents: -3000 }, 2, "admin", "2026-10-01")).toBeNull();
  });
  it("semana anterior pendente segura o fechamento", () => {
    expect(autoSettleMessage({ ...base, pending_previous: true }, 2, "admin", "2026-10-08")?.text).toContain("semana anterior");
  });
  it("semana acertada não tem aviso", () => {
    expect(autoSettleMessage({ ...base, status: "acertada" }, 2, "admin")).toBeNull();
  });
});
