import { describe, expect, it } from "vitest";
import {
  addDays,
  formatWeekRange,
  isIsoDate,
  isMonday,
  maxEntryDate,
  monthRange,
  suggestedDateForWeek,
  todayLocal,
  weekDays,
  weekStartOf,
} from "@/lib/dates";

describe("semanas de segunda a domingo", () => {
  it("primeira semana operacional 28/09 a 04/10/2026 é uma única semana (CA05)", () => {
    for (const d of weekDays("2026-09-28")) expect(weekStartOf(d)).toBe("2026-09-28");
    expect(weekDays("2026-09-28").at(-1)).toBe("2026-10-04");
    expect(formatWeekRange("2026-09-28")).toBe("28/09 a 04/10/2026");
  });
  it("domingo pertence à semana iniciada na segunda anterior", () => {
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28");
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05");
  });
  it("atravessa virada de ano", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });
  it("isMonday / isIsoDate", () => {
    expect(isMonday("2026-09-28")).toBe(true);
    expect(isMonday("2026-09-29")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });
});

describe("fuso America/Sao_Paulo", () => {
  it("23h30 em São Paulo ainda é o mesmo dia (UTC já virou)", () => {
    // 2026-09-30 23:30 em São Paulo (UTC-3) = 2026-10-01 02:30 UTC
    expect(todayLocal(new Date("2026-10-01T02:30:00Z"))).toBe("2026-09-30");
  });
  it("limite de lançamento é o domingo da semana atual", () => {
    expect(maxEntryDate(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-04");
    expect(maxEntryDate(new Date("2026-10-05T02:00:00Z"))).toBe("2026-10-04"); // domingo 23h em São Paulo
  });
  it("data sugerida: hoje na semana atual, segunda-feira em semana antiga", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(suggestedDateForWeek("2026-09-28", now)).toBe("2026-10-02");
    expect(suggestedDateForWeek("2026-09-21", now)).toBe("2026-09-21");
  });
});

describe("mês", () => {
  it("total mensal usa a data real: semana 28/09-04/10 divide-se entre setembro e outubro", () => {
    const set = monthRange("2026-09");
    const out = monthRange("2026-10");
    expect(set).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(out.from).toBe("2026-10-01");
    const semana = weekDays("2026-09-28");
    expect(semana.filter((d) => d >= set.from && d <= set.to)).toHaveLength(3);
    expect(semana.filter((d) => d >= out.from && d <= out.to)).toHaveLength(4);
  });
  it("fevereiro e dezembro", () => {
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2026-12").to).toBe("2026-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
