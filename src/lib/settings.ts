import "server-only";
import type { Viewer } from "@/lib/auth";

export type AppSettings = {
  data_inicio_operacao: string;
  anexos_max_por_despesa: number;
  anexos_max_bytes: number;
  suporte_duracao_minutos: number;
  senha_temporaria_validade_horas: number;
  acerto_automatico_tolerancia_dias: number;
};

export async function getSettings(supabase: Viewer["supabase"]): Promise<AppSettings> {
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw error;
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return {
    data_inicio_operacao: String(map.data_inicio_operacao ?? "2026-01-01"),
    anexos_max_por_despesa: Number(map.anexos_max_por_despesa ?? 5),
    anexos_max_bytes: Number(map.anexos_max_bytes ?? 10485760),
    suporte_duracao_minutos: Number(map.suporte_duracao_minutos ?? 30),
    senha_temporaria_validade_horas: Number(map.senha_temporaria_validade_horas ?? 72),
    acerto_automatico_tolerancia_dias: Number(map.acerto_automatico_tolerancia_dias ?? 2),
  };
}
