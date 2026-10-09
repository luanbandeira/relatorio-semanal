import { cn } from "@/lib/utils";

// Tons suaves (fundo claro, texto escuro, contraste AA) para não competir com o nome.
const PALETTES = [
  "border-rose-200 bg-rose-50 text-rose-800",
  "border-emerald-200 bg-emerald-50 text-emerald-800",
  "border-amber-200 bg-amber-50 text-amber-800",
  "border-violet-200 bg-violet-50 text-violet-800",
  "border-blue-200 bg-blue-50 text-blue-800", // primeira cor da paleta
  "border-teal-200 bg-teal-50 text-teal-800",
  "border-slate-300 bg-slate-50 text-slate-700",
];

/** Cor estável por unidade: a mesma unidade tem sempre o mesmo tom. */
export function unitPalette(unit: string): number {
  let h = 7;
  for (const ch of unit.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PALETTES.length;
}

/** Selo da unidade no estilo de "marca de time": discreto e padronizado. */
export function UnitBadge({ unit, className }: { unit: string | null | undefined; className?: string }) {
  if (!unit) return null;
  return (
    <span
      title={`Unidade: ${unit}`}
      className={cn(
        "inline-flex max-w-[9rem] shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] leading-none font-semibold tracking-wide uppercase",
        PALETTES[unitPalette(unit)],
        className,
      )}
    >
      <span className="sr-only">Unidade: </span>
      <span className="truncate">{unit}</span>
    </span>
  );
}
