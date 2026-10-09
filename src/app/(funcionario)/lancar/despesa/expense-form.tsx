"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDownIcon, PaperclipIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Notice } from "@/components/status";
import { DeleteEntryButton } from "@/components/delete-entry-button";
import { saveExpenseAction } from "@/app/actions/entries";
import { expenseFormSchema, type ExpenseFormValues } from "@/lib/validation";
import { GENERIC_ERROR } from "@/lib/errors";
import { weekStartOf, todayLocal } from "@/lib/dates";
import { fileProblem, uploadAttachment } from "@/lib/upload";
import { MAX_ATTACHMENTS_PER_EXPENSE } from "@/lib/files";

type Category = { id: string; name: string; grupo: "percurso" | "outras" };
type Existing = Omit<ExpenseFormValues, "grupo"> & {
  grupo: "percurso" | "outras";
  attachments: { id: string; original_name: string | null; mime_type: string }[];
};

function blank(date: string): ExpenseFormValues {
  return {
    id: crypto.randomUUID(),
    occurredOn: date,
    amount: "",
    categoryId: "",
    description: "",
    grupo: undefined,
    km: "",
    origem: "",
    destino: "",
    clientes: "",
    hasReceipt: false,
  };
}

export function ExpenseForm({
  categories,
  existing,
  defaultDate,
  minDate,
  maxDate,
}: {
  categories: Category[];
  existing: Existing | null;
  defaultDate: string;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [optionalOpen, setOptionalOpen] = useState(
    !!existing && !!(existing.km || existing.origem || existing.destino || existing.clientes),
  );

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: existing
      ? {
          ...existing,
          // Grupo salvo diferente do padrão da categoria = ajuste manual.
          grupo:
            categories.find((c) => c.id === existing.categoryId)?.grupo === existing.grupo ? undefined : existing.grupo,
        }
      : blank(defaultDate),
  });
  const { register, formState, setValue, control } = form;
  const errors = formState.errors;
  const hasReceipt = useWatch({ control, name: "hasReceipt" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const grupo = useWatch({ control, name: "grupo" });
  const autoGroup = categories.find((c) => c.id === categoryId)?.grupo;
  const existingCount = existing?.attachments.length ?? 0;

  const save = useMutation({
    mutationFn: async ({ values }: { values: ExpenseFormValues; another: boolean }) => {
      const res = await saveExpenseAction(values);
      if (!res.ok) return res;
      // Despesa salva. Anexos vão em seguida; falha de anexo não desfaz a despesa.
      const failed: string[] = [];
      for (const f of files) {
        try {
          await uploadAttachment(values.id, f);
        } catch (e) {
          failed.push(e instanceof Error ? e.message : f.name);
        }
      }
      return { ...res, failed };
    },
    onSuccess: (res, { values, another }) => {
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof ExpenseFormValues, { message: v });
        }
        return;
      }
      const failed = "failed" in res ? res.failed : [];
      setFiles([]);
      if (failed.length) {
        setUploadWarning(
          `Despesa salva, mas ${failed.length === 1 ? "um anexo não foi enviado" : "alguns anexos não foram enviados"}: ${failed.join(" ")} Abra a despesa para anexar de novo.`,
        );
        toast.warning("Despesa salva sem todos os anexos.");
        router.refresh();
        return;
      }
      toast.success(existing ? "Despesa atualizada." : "Despesa salva.");
      if (another && !existing) {
        form.reset(blank(values.occurredOn));
        setOptionalOpen(false);
        router.refresh();
        document.getElementById("amount")?.focus();
      } else {
        const ws = res.data.weekStart;
        router.push(ws === weekStartOf(todayLocal()) ? "/inicio" : `/semanas/${ws}`);
        router.refresh();
      }
    },
  });

  const serverError = save.data && !save.data.ok ? save.data.error : save.isError ? GENERIC_ERROR : null;

  function onPickFiles(list: FileList | null) {
    setFileError(null);
    if (!list) return;
    const picked = Array.from(list);
    const problems = picked.map(fileProblem).filter(Boolean) as string[];
    if (problems.length) setFileError(problems.join(" "));
    const ok = picked.filter((f) => !fileProblem(f));
    const room = MAX_ATTACHMENTS_PER_EXPENSE - existingCount - files.length;
    if (ok.length > room) setFileError(`Máximo de ${MAX_ATTACHMENTS_PER_EXPENSE} anexos por despesa.`);
    setFiles((prev) => [...prev, ...ok.slice(0, Math.max(0, room))]);
    if (fileInput.current) fileInput.current.value = "";
  }

  const submit = (another: boolean) =>
    form.handleSubmit((values) => {
      setUploadWarning(null);
      save.mutate({ values, another });
    });

  return (
    <form onSubmit={submit(false)} className="space-y-5" noValidate>
      {serverError && (
        <Notice tone="error" title="Não salvou">
          {serverError} Seus dados continuam no formulário.
        </Notice>
      )}
      {uploadWarning && <Notice tone="warning">{uploadWarning}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.occurredOn}>
          <FieldLabel htmlFor="occurredOn">Data do gasto</FieldLabel>
          <Input id="occurredOn" type="date" min={minDate} max={maxDate} aria-invalid={!!errors.occurredOn} {...register("occurredOn")} />
          <FieldError errors={[errors.occurredOn]} />
        </Field>
        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="amount">Valor (R$)</FieldLabel>
          <Input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            aria-invalid={!!errors.amount}
            {...register("amount")}
          />
          <FieldError errors={[errors.amount]} />
        </Field>
      </div>

      <Field data-invalid={!!errors.categoryId}>
        <FieldLabel htmlFor="categoryId">Categoria</FieldLabel>
        <NativeSelect id="categoryId" aria-invalid={!!errors.categoryId} {...register("categoryId")}>
          <option value="">Escolha...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError errors={[errors.categoryId]} />
      </Field>

      <Field data-invalid={!!errors.description}>
        <FieldLabel htmlFor="description">Descrição</FieldLabel>
        <Input
          id="description"
          placeholder="Ex.: abastecimento posto BR, almoço em Campinas"
          maxLength={500}
          aria-invalid={!!errors.description}
          {...register("description")}
        />
        <FieldError errors={[errors.description]} />
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Tem comprovante?</FieldLegend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tem comprovante?">
          {[
            { v: true, label: "Sim" },
            { v: false, label: "Não" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={hasReceipt === o.v}
              onClick={() => setValue("hasReceipt", o.v, { shouldDirty: true })}
              className={
                "h-11 rounded-lg border text-base font-medium " +
                (hasReceipt === o.v ? "border-primary bg-secondary text-secondary-foreground" : "border-input bg-background")
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        {hasReceipt && (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed p-3">
            <FieldLabel htmlFor="files">Anexe o comprovante aqui</FieldLabel>
            <FieldDescription>Opcional. Foto (câmera ou galeria) ou PDF, até 10 MB cada.</FieldDescription>
            <input
              ref={fileInput}
              id="files"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
              onChange={(e) => onPickFiles(e.target.files)}
              className="block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:font-medium file:text-secondary-foreground"
            />
            {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
            {files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <PaperclipIcon className="size-4" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
                      aria-label={`Remover ${f.name}`}
                    >
                      <XIcon className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {existing && existing.attachments.length > 0 && (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-medium">Anexos já enviados</p>
            <ul className="space-y-1">
              {existing.attachments.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2">
                  <PaperclipIcon className="size-4" aria-hidden="true" />
                  <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-primary underline">
                    {a.original_name ?? `Anexo ${i + 1}`}
                  </a>
                  <DeleteEntryButton kind="attachment" id={a.id} label={a.original_name ?? `Anexo ${i + 1}`} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </FieldSet>

      <Collapsible open={optionalOpen} onOpenChange={setOptionalOpen}>
        <CollapsibleTrigger className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left font-medium">
          Mais detalhes (opcional)
          <ChevronDownIcon className={`size-4 transition-transform ${optionalOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4">
          <Field>
            <FieldLabel htmlFor="grupo">Grupo</FieldLabel>
            <NativeSelect
              id="grupo"
              value={grupo ?? ""}
              onChange={(e) =>
                setValue("grupo", (e.target.value || undefined) as ExpenseFormValues["grupo"], { shouldDirty: true })
              }
            >
              <option value="">
                Automático{autoGroup ? ` (${autoGroup === "percurso" ? "Percurso" : "Outras despesas"})` : ""}
              </option>
              <option value="percurso">Percurso</option>
              <option value="outras">Outras despesas</option>
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={!!errors.km}>
              <FieldLabel htmlFor="km">Km estimados</FieldLabel>
              <Input id="km" inputMode="decimal" placeholder="Ex.: 120" aria-invalid={!!errors.km} {...register("km")} />
              <FieldError errors={[errors.km]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="origem">Origem</FieldLabel>
              <Input id="origem" maxLength={120} {...register("origem")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="destino">Destino</FieldLabel>
              <Input id="destino" maxLength={120} {...register("destino")} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="clientes">Clientes visitados</FieldLabel>
            <Textarea id="clientes" rows={2} maxLength={500} {...register("clientes")} />
          </Field>
        </CollapsibleContent>
      </Collapsible>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:border-0 sm:px-0">
        <Button type="submit" size="lg" disabled={save.isPending} className="sm:flex-1">
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
        {!existing && (
          <Button type="button" size="lg" variant="outline" disabled={save.isPending} onClick={submit(true)} className="sm:flex-1">
            Salvar e adicionar outra
          </Button>
        )}
        <Link href="/inicio" className="py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline sm:self-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
