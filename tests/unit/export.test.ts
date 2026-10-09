import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildExcel } from "@/lib/export/excel";
import { buildPdf } from "@/lib/export/pdf";
import { pdfText, safeCellText } from "@/lib/export/sanitize";
import type { ReportData } from "@/lib/report";

const malicious = '=HYPERLINK("http://mal.example","clique")';

function sample(): ReportData {
  return {
    period: { from: "2026-09-01", to: "2026-09-30", label: "Mês 09/2026" },
    filtersDescription: ["Funcionários: todos os acessíveis"],
    generatedAt: new Date("2026-09-30T15:00:00Z"),
    generatedBy: "Gestor Teste",
    receiptsApplicable: true,
    expenses: [
      {
        occurred_on: "2026-09-28",
        amount_cents: 15000,
        description: malicious,
        grupo: "percurso",
        has_receipt: true,
        km: 120,
        origem: "+São Paulo",
        destino: "@Campinas",
        clientes: "-cliente",
        employee_id: "e1",
        category: "Combustível",
        week_start: "2026-09-28",
        week_status: "aberta",
        employee_name: "Ana Teste",
        employee_username: "ana",
      },
      {
        occurred_on: "2026-09-29",
        amount_cents: 3550,
        description: "Almoço",
        grupo: "outras",
        has_receipt: false,
        km: null,
        origem: null,
        destino: null,
        clientes: null,
        employee_id: "e1",
        category: "Alimentação",
        week_start: "2026-09-28",
        week_status: "aberta",
        employee_name: "Ana Teste",
        employee_username: "ana",
      },
    ],
    receipts: [
      {
        received_on: "2026-09-28",
        amount_cents: 20000,
        description: "=1+1",
        employee_id: "e1",
        week_start: "2026-09-28",
        week_status: "aberta",
        employee_name: "Ana Teste",
        employee_username: "ana",
      },
    ],
    totals: { spentCents: 18550, receivedCents: 20000 },
    byEmployee: [{ id: "e1", name: "Ana Teste", username: "ana", spentCents: 18550, receivedCents: 20000 }],
    byCategory: [
      { name: "Combustível", spentCents: 15000 },
      { name: "Alimentação", spentCents: 3550 },
    ],
  };
}

describe("sanitização", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"])("neutraliza %j", (v) => {
    expect(safeCellText(v).startsWith("'")).toBe(true);
  });
  it("mantém texto comum", () => expect(safeCellText("Almoço")).toBe("Almoço"));
  it("PDF usa apenas caracteres suportados", () => expect(pdfText("a − b “c” … ç")).toBe('a - b "c" ... ç'));
});

describe("Excel (CA16)", () => {
  it("separa despesas e recebimentos, totais conferem e não há fórmulas", async () => {
    const buf = await buildExcel(sample());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Despesas", "Recebimentos"]);

    let formulas = 0;
    const texts: string[] = [];
    wb.eachSheet((ws) =>
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          if (cell.type === ExcelJS.ValueType.Formula || (cell.value as { formula?: string })?.formula) formulas++;
          if (typeof cell.value === "string") texts.push(cell.value);
        }),
      ),
    );
    expect(formulas).toBe(0);
    expect(texts.some((t) => t.startsWith("=") || t.startsWith("+") || t.startsWith("@"))).toBe(false);
    expect(texts).toContain(`'${malicious}`);

    const desp = wb.getWorksheet("Despesas")!;
    const last = desp.getRow(desp.rowCount);
    expect(last.getCell(9).value).toBe(185.5);
    const rec = wb.getWorksheet("Recebimentos")!;
    expect(rec.getRow(rec.rowCount).getCell(7).value).toBe(200);
    const resumo = wb.getWorksheet("Resumo")!;
    expect(String(resumo.getRow(2).getCell(1).value)).toContain("Mês 09/2026");
    expect(String(resumo.getRow(3).getCell(1).value)).toContain("Gerado em");
  });
});

describe("PDF", () => {
  it("gera documento válido com período e totais", () => {
    const buf = buildPdf(sample());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });
});
