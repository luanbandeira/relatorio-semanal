"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Notice } from "@/components/status";
import { saveReceiptAction } from "@/app/actions/entries";
import { receiptFormSchema, type ReceiptFormValues } from "@/lib/validation";
import { GENERIC_ERROR } from "@/lib/errors";
import { formatWeekRange, isIsoDate, todayLocal, weekStartOf } from "@/lib/dates";

export function ReceiptForm({
  existing,
  defaultDate,
  minDate,
  maxDate,
  openWeeks,
}: {
  existing: ReceiptFormValues | null;
  defaultDate: string;
  minDate: string;
  maxDate: string;
  openWeeks: string[];
}) {
  const router = useRouter();
  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: existing ?? {
      id: crypto.randomUUID(),
      receivedOn: defaultDate,
      weekStart: weekStartOf(defaultDate),
      amount: "",
      description: "",
    },
  });
  const { register, formState, setValue, control } = form;
  const errors = formState.errors;
  const receivedOn = useWatch({ control, name: "receivedOn" });
  const weekStart = useWatch({ control, name: "weekStart" });
  const [customWeek, setCustomWeek] = useState(!!existing && weekStartOf(existing.receivedOn) !== existing.weekStart);

  // Semana sugerida acompanha a data, a menos que a pessoa escolha outra.
  useEffect(() => {
    if (!customWeek && isIsoDate(receivedOn)) setValue("weekStart", weekStartOf(receivedOn));
  }, [receivedOn, customWeek, setValue]);

  const diverges = isIsoDate(receivedOn) && weekStart !== weekStartOf(receivedOn);
  const weekOptions = Array.from(new Set([weekStart, ...openWeeks])).filter(Boolean).sort().reverse();

  const save = useMutation({
    mutationFn: saveReceiptAction,
    onSuccess: (res) => {
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof ReceiptFormValues, { message: v });
        }
        return;
      }
      toast.success(existing ? "Recebimento atualizado." : "Recebimento salvo.");
      const ws = res.data.weekStart;
      router.push(ws === weekStartOf(todayLocal()) ? "/inicio" : `/semanas/${ws}`);
      router.refresh();
    },
  });
  const serverError = save.data && !save.data.ok ? save.data.error : save.isError ? GENERIC_ERROR : null;

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-5" noValidate>
      {serverError && (
        <Notice tone="error" title="Não salvou">
          {serverError} Seus dados continuam no formulário.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.receivedOn}>
          <FieldLabel htmlFor="receivedOn">Data em que recebeu</FieldLabel>
          <Input id="receivedOn" type="date" min={minDate} max={maxDate} aria-invalid={!!errors.receivedOn} {...register("receivedOn")} />
          <FieldError errors={[errors.receivedOn]} />
        </Field>
        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="amount">Valor (R$)</FieldLabel>
          <Input id="amount" inputMode="decimal" placeholder="0,00" autoComplete="off" aria-invalid={!!errors.amount} {...register("amount")} />
          <FieldError errors={[errors.amount]} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
        <Input id="description" placeholder="Ex.: transferência, cartão benefício" maxLength={500} {...register("description")} />
      </Field>

      <Field data-invalid={!!errors.weekStart}>
        <FieldLabel htmlFor="weekStart">Semana de referência</FieldLabel>
        {customWeek ? (
          <NativeSelect id="weekStart" {...register("weekStart")}>
            {weekOptions.map((w) => (
              <option key={w} value={w}>
                {formatWeekRange(w)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <p className="rounded-lg border bg-muted px-3 py-2.5">{isIsoDate(weekStart) ? formatWeekRange(weekStart) : "-"}</p>
        )}
        <FieldDescription>
          {customWeek ? (
            <button type="button" className="text-primary underline underline-offset-2" onClick={() => setCustomWeek(false)}>
              Usar a semana da data
            </button>
          ) : (
            <>
              Definida pela data.{" "}
              <button type="button" className="text-primary underline underline-offset-2" onClick={() => setCustomWeek(true)}>
                É de outra semana?
              </button>
            </>
          )}
        </FieldDescription>
        <FieldError errors={[errors.weekStart]} />
      </Field>
      {diverges && (
        <Notice tone="warning">
          Este valor será contado na semana de {formatWeekRange(weekStart)}, diferente da semana da data do recebimento.
        </Notice>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={save.isPending} className="sm:flex-1">
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Link href="/inicio" className="py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline sm:self-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
