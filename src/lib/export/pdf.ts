import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { ReportData } from "@/lib/report";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { pdfText } from "./sanitize";

const BLUE: [number, number, number] = [29, 78, 216];
const GRAPHITE: [number, number, number] = [55, 65, 81];

/** PDF paisagem com cabeçalho de período, resumo, despesas e recebimentos. */
export function buildPdf(report: ReportData): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const t = pdfText;

  doc.setTextColor(...GRAPHITE);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(t("Relatório Semanal"), 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 22;
  const lines = [
    `Período: ${report.period.label}`,
    `Gerado em: ${formatDateTimeBR(report.generatedAt)} por ${report.generatedBy}`,
    ...report.filtersDescription,
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(t(line), 265) as string[];
    doc.text(wrapped, 14, y);
    y += 5 * wrapped.length;
  }

  const common = {
    theme: "grid" as const,
    styles: { fontSize: 8, textColor: GRAPHITE, cellPadding: 1.5 },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255] as [number, number, number] },
    margin: { left: 14, right: 14 },
  };

  autoTable(doc, {
    ...common,
    startY: y + 2,
    head: [["Funcionário", "Total gasto", "Total recebido"]],
    body: [
      ...report.byEmployee.map((e) => [t(`${e.name} (${e.username})`), formatCents(e.spentCents), formatCents(e.receivedCents)]),
      [
        t("Total registrado no período"),
        formatCents(report.totals.spentCents),
        report.receiptsApplicable ? formatCents(report.totals.receivedCents) : t("não se aplica"),
      ],
    ],
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === report.byEmployee.length) data.cell.styles.fontStyle = "bold";
    },
  });

  doc.addPage();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("Despesas"), 14, 15);
  autoTable(doc, {
    ...common,
    startY: 19,
    head: [["Data", "Funcionário", "Semana", "Categoria", t("Descrição"), "Valor", "Comp."]],
    body: [
      ...report.expenses.map((e) => [
        formatDateBR(e.occurred_on),
        t(`${e.employee_name} (${e.employee_username})`),
        `${formatDateBR(e.week_start)} ${e.week_status === "aberta" ? "(aberta)" : "(acertada)"}`,
        t(e.category),
        t(e.description),
        formatCents(e.amount_cents),
        e.has_receipt ? "Sim" : t("Não"),
      ]),
      ["", "", "", "", "Total", formatCents(report.totals.spentCents), ""],
    ],
    columnStyles: { 4: { cellWidth: 80 }, 5: { halign: "right" } },
  });

  doc.addPage();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("Valores recebidos da empresa"), 14, 15);
  if (!report.receiptsApplicable) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(t("Recebimentos não se aplicam ao filtro por categoria."), 14, 22);
  } else {
    autoTable(doc, {
      ...common,
      startY: 19,
      head: [["Data", "Funcionário", t("Semana de referência"), t("Descrição"), "Valor"]],
      body: [
        ...report.receipts.map((r) => [
          formatDateBR(r.received_on),
          t(`${r.employee_name} (${r.employee_username})`),
          `${formatDateBR(r.week_start)} ${r.week_status === "aberta" ? "(aberta)" : "(acertada)"}`,
          t(r.description ?? ""),
          formatCents(r.amount_cents),
        ]),
        ["", "", "", "Total", formatCents(report.totals.receivedCents)],
      ],
      columnStyles: { 3: { cellWidth: 100 }, 4: { halign: "right" } },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(t(`Página ${i} de ${pages}`), 283, 205, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
