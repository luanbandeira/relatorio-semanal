import { CircleCheckIcon, CircleDotIcon, TriangleAlertIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Status da semana sempre com texto e ícone (nunca só cor).
 * Para o funcionário o status é neutro: "Em aberto" / "Encerrada".
 */
export function WeekStatus({
  status,
  audience,
  className,
}: {
  status: "aberta" | "acertada";
  audience: "funcionario" | "admin";
  className?: string;
}) {
  const open = status === "aberta";
  const label = open ? "Em aberto" : audience === "admin" ? "Acertada" : "Encerrada";
  const Icon = open ? CircleDotIcon : CircleCheckIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium",
        open ? "border-blue-200 bg-info-bg text-accent-foreground" : "border-green-200 bg-success-bg text-success",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Notice({
  tone,
  title,
  children,
  className,
}: {
  tone: "info" | "warning" | "error" | "success";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-blue-200 bg-info-bg text-accent-foreground",
    warning: "border-amber-200 bg-warning-bg text-warning",
    error: "border-red-200 bg-red-50 text-destructive",
    success: "border-green-200 bg-success-bg text-success",
  }[tone];
  const Icon = tone === "success" ? CircleCheckIcon : tone === "info" ? InfoIcon : TriangleAlertIcon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", styles, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
