import ExcelJS from "exceljs";
import type { ReportData } from "@/lib/report";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { safeCellText } from "./sanitize";

const MONEY_FMT = '"R$" #,##0.00';

/**
 * Planilha com resumo, despesas e recebimentos separados. Totais são
 * calculados em centavos inteiros no servidor e gravados como valores (sem
 * fórmulas); todo texto de usuário passa por safeCellText.
 */
export async function buildExcel(report: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Relatório Semanal";
  wb.created = report.generatedAt;

  const money = (cents: number) => cents / 100;

  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [{ width: 38 }, { width: 22 }, { width: 22 }];
  resumo.addRow(["Relatório Semanal"]).font = { bold: true, size: 14 };
  resumo.addRow([`Período: ${report.period.label}`]);
  resumo.addRow([`Gerado em: ${formatDateTimeBR(report.generatedAt)} por ${safeCellText(report.generatedBy)}`]);
  for (const f of report.filtersDescription) resumo.addRow([safeCellText(f)]);
  resumo.addRow([]);
  const head = resumo.addRow(["Funcionário", "Total gasto", "Total recebido"]);
  head.font = { bold: true };
  for (const e of report.byEmployee) {
    const row = resumo.addRow([safeCellText(`${e.name} (${e.username})`), money(e.spentCents), money(e.receivedCents)]);
    row.getCell(2).numFmt = MONEY_FMT;
    row.getCell(3).numFmt = MONEY_FMT;
  }
  const tot = resumo.addRow([
    "Total registrado no período",
    money(report.totals.spentCents),
    report.receiptsApplicable ? money(report.totals.receivedCents) : "não se aplica",
  ]);
  tot.font = { bold: true };
  tot.getCell(2).numFmt = MONEY_FMT;
  tot.getCell(3).numFmt = MONEY_FMT;

  if (report.byCategory.length) {
    resumo.addRow([]);
    resumo.addRow(["Categoria", "Total gasto"]).font = { bold: true };
    for (const c of report.byCategory) {
      const r = resumo.addRow([safeCellText(c.name), money(c.spentCents)]);
      r.getCell(2).numFmt = MONEY_FMT;
    }
  }

  const desp = wb.addWorksheet("Despesas");
  desp.columns = [
    { header: "Data", width: 12 },
    { header: "Funcionário", width: 28 },
    { header: "Usuário", width: 16 },
    { header: "Semana", width: 12 },
    { header: "Status da semana", width: 16 },
    { header: "Categoria", width: 22 },
    { header: "Grupo", width: 12 },
    { header: "Descrição", width: 40 },
    { header: "Valor", width: 14 },
    { header: "Comprovante", width: 12 },
    { header: "Km", width: 8 },
    { header: "Origem", width: 18 },
    { header: "Destino", width: 18 },
    { header: "Clientes", width: 30 },
  ];
  desp.getRow(1).font = { bold: true };
  for (const e of report.expenses) {
    const row = desp.addRow([
      formatDateBR(e.occurred_on),
      safeCellText(e.employee_name),
      safeCellText(e.employee_username),
      formatDateBR(e.week_start),
      e.week_status === "aberta" ? "Aberta" : "Acertada",
      safeCellText(e.category),
      e.grupo === "percurso" ? "Percurso" : "Outras",
      safeCellText(e.description),
      money(e.amount_cents),
      e.has_receipt ? "Sim" : "Não",
      e.km ?? "",
      safeCellText(e.origem),
      safeCellText(e.destino),
      safeCellText(e.clientes),
    ]);
    row.getCell(9).numFmt = MONEY_FMT;
  }
  const dt = desp.addRow(["", "", "", "", "", "", "", "Total", money(report.totals.spentCents)]);
  dt.font = { bold: true };
  dt.getCell(9).numFmt = MONEY_FMT;

  const rec = wb.addWorksheet("Recebimentos");
  rec.columns = [
    { header: "Data", width: 12 },
    { header: "Funcionário", width: 28 },
    { header: "Usuário", width: 16 },
    { header: "Semana de referência", width: 20 },
    { header: "Status da semana", width: 16 },
    { header: "Descrição", width: 40 },
    { header: "Valor", width: 14 },
  ];
  rec.getRow(1).font = { bold: true };
  if (!report.receiptsApplicable) {
    rec.addRow(["Recebimentos não se aplicam ao filtro por categoria."]);
  }
  for (const r of report.receipts) {
    const row = rec.addRow([
      formatDateBR(r.received_on),
      safeCellText(r.employee_name),
      safeCellText(r.employee_username),
      formatDateBR(r.week_start),
      r.week_status === "aberta" ? "Aberta" : "Acertada",
      safeCellText(r.description),
      money(r.amount_cents),
    ]);
    row.getCell(7).numFmt = MONEY_FMT;
  }
  if (report.receiptsApplicable) {
    const rt = rec.addRow(["", "", "", "", "", "Total", money(report.totals.receivedCents)]);
    rt.font = { bold: true };
    rt.getCell(7).numFmt = MONEY_FMT;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
