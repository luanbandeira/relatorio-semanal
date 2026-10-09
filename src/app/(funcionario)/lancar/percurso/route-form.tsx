"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Notice } from "@/components/status";
import { saveRouteAction } from "@/app/actions/entries";
import { routeFormSchema, type RouteFormValues } from "@/lib/validation";
import { GENERIC_ERROR } from "@/lib/errors";
import { todayLocal, weekStartOf } from "@/lib/dates";

export function RouteForm({
  existing,
  defaultDate,
  minDate,
  maxDate,
}: {
  existing: RouteFormValues | null;
  defaultDate: string;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const blank = (date: string, origem = ""): RouteFormValues => ({
    id: crypto.randomUUID(),
    occurredOn: date,
    origem,
    destino: "",
    km: "",
    clientes: "",
  });
  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: existing ?? blank(defaultDate),
  });
  const { register, formState } = form;
  const errors = formState.errors;

  const save = useMutation({
    mutationFn: ({ values }: { values: RouteFormValues; another: boolean }) => saveRouteAction(values),
    onSuccess: (res, { values, another }) => {
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof RouteFormValues, { message: v });
        }
        return;
      }
      toast.success(existing ? "Percurso atualizado." : "Percurso salvo.");
      if (another && !existing) {
        // Próximo trecho começa onde o anterior terminou.
        form.reset(blank(values.occurredOn, values.destino));
        document.getElementById("destino")?.focus();
        return;
      }
      const ws = res.data.weekStart;
      router.push(ws === weekStartOf(todayLocal()) ? "/inicio" : `/semanas/${ws}`);
      router.refresh();
    },
  });
  const serverError = save.data && !save.data.ok ? save.data.error : save.isError ? GENERIC_ERROR : null;
  const submit = (another: boolean) => form.handleSubmit((values) => save.mutate({ values, another }));

  return (
    <form onSubmit={submit(false)} className="space-y-5" noValidate>
      {serverError && (
        <Notice tone="error" title="Não salvou">
          {serverError} Seus dados continuam no formulário.
        </Notice>
      )}
      <Field data-invalid={!!errors.occurredOn}>
        <FieldLabel htmlFor="occurredOn">Data</FieldLabel>
        <Input id="occurredOn" type="date" min={minDate} max={maxDate} aria-invalid={!!errors.occurredOn} {...register("occurredOn")} />
        <FieldError errors={[errors.occurredOn]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.origem}>
          <FieldLabel htmlFor="origem">Origem</FieldLabel>
          <Input id="origem" placeholder="Ex.: São Paulo" maxLength={120} aria-invalid={!!errors.origem} {...register("origem")} />
          <FieldError errors={[errors.origem]} />
        </Field>
        <Field data-invalid={!!errors.destino}>
          <FieldLabel htmlFor="destino">Destino</FieldLabel>
          <Input id="destino" placeholder="Ex.: Campinas" maxLength={120} aria-invalid={!!errors.destino} {...register("destino")} />
          <FieldError errors={[errors.destino]} />
        </Field>
      </div>
      <Field data-invalid={!!errors.km}>
        <FieldLabel htmlFor="km">Km estimados (opcional)</FieldLabel>
        <Input id="km" inputMode="decimal" placeholder="Ex.: 135" aria-invalid={!!errors.km} {...register("km")} />
        <FieldError errors={[errors.km]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="clientes">Clientes visitados (opcional)</FieldLabel>
        <Textarea id="clientes" rows={3} maxLength={500} {...register("clientes")} />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={save.isPending} className="sm:flex-1">
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
        {!existing && (
          <Button type="button" size="lg" variant="outline" disabled={save.isPending} onClick={submit(true)} className="sm:flex-1">
            Salvar e adicionar outro trecho
          </Button>
        )}
        <Link href="/inicio" className="py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline sm:self-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
