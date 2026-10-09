"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettingAction } from "@/app/actions/admin";
import { GENERIC_ERROR } from "@/lib/errors";

type Settings = {
  data_inicio_operacao: string;
  anexos_max_por_despesa: number;
  suporte_duracao_minutos: number;
  senha_temporaria_validade_horas: number;
  acerto_automatico_tolerancia_dias: number;
};

const FIELDS: { key: keyof Settings; label: string; help: string; type: "date" | "number"; min?: number; max?: number }[] = [
  {
    key: "acerto_automatico_tolerancia_dias",
    label: "Acerto automático: dias de tolerância após o domingo",
    help: "Semanas sem valor a receber fecham sozinhas depois desse prazo (2 = fecha na quarta). Entre 0 e 14.",
    type: "number",
    min: 0,
    max: 14,
  },
  {
    key: "data_inicio_operacao",
    label: "Início da operação (segunda-feira)",
    help: "Lançamentos antes desta data são recusados.",
    type: "date",
  },
  { key: "anexos_max_por_despesa", label: "Máximo de anexos por despesa", help: "Entre 1 e 10.", type: "number", min: 1, max: 10 },
  { key: "suporte_duracao_minutos", label: "Duração do modo de suporte (minutos)", help: "Entre 5 e 120.", type: "number", min: 5, max: 120 },
  {
    key: "senha_temporaria_validade_horas",
    label: "Validade da senha temporária (horas)",
    help: "Entre 1 e 168.",
    type: "number",
    min: 1,
    max: 168,
  },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [values, setValues] = useState<Settings>(settings);
  const save = useMutation({
    mutationFn: async (key: keyof Settings) => saveSettingAction({ key, value: values[key] }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Configuração salva.");
        router.refresh();
      } else toast.error(r.error);
    },
    onError: () => toast.error(GENERIC_ERROR),
  });

  return (
    <ul className="space-y-3">
      {FIELDS.map((f) => (
        <li key={f.key} className="rounded-2xl border p-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(f.key);
            }}
          >
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                type={f.type}
                min={f.min}
                max={f.max}
                value={String(values[f.key])}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">{f.help}</p>
            </div>
            <Button type="submit" variant="outline" disabled={save.isPending}>
              Salvar
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
