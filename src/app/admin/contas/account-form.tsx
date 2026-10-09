"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Notice } from "@/components/status";
import { createAccountAction, updateAccountAction } from "@/app/actions/admin";
import { accountFormSchema, type AccountFormValues } from "@/lib/validation";
import { formatCpf } from "@/lib/identity";
import { GENERIC_ERROR } from "@/lib/errors";
import { TempPasswordNotice } from "./temp-password";

export function AccountForm({
  id,
  initial,
  units = [],
}: {
  id?: string;
  initial?: AccountFormValues;
  /** Unidades já cadastradas, sugeridas para manter o mesmo padrão. */
  units?: string[];
}) {
  const router = useRouter();
  const [created, setCreated] = useState<{ id: string; tempPassword: string | null } | null>(null);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: initial ?? {
      fullName: "",
      cpf: "",
      username: "",
      role: "funcionario",
      avatar: "neutro",
      unit: "",
      passwordMode: "temporaria",
      password: "",
      confirm: "",
    },
  });
  const errors = form.formState.errors;
  const passwordMode = useWatch({ control: form.control, name: "passwordMode" });

  const save = useMutation({
    mutationFn: async (values: AccountFormValues) =>
      id ? updateAccountAction(id, values) : createAccountAction(values),
    onSuccess: (res) => {
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof AccountFormValues, { message: v });
        }
        return;
      }
      if (!id && res.data && "tempPassword" in res.data) {
        setCreated({ id: res.data.id, tempPassword: res.data.tempPassword });
        return;
      }
      toast.success("Conta atualizada.");
      router.refresh();
    },
  });
  const serverError = save.data && !save.data.ok ? save.data.error : save.isError ? GENERIC_ERROR : null;

  if (created) {
    return (
      <div className="space-y-4">
        {created.tempPassword ? (
          <TempPasswordNotice password={created.tempPassword} />
        ) : (
          <Notice tone="success" title="Conta criada">
            A pessoa já pode entrar com o usuário de acesso e a senha que você definiu, sem precisar trocar.
          </Notice>
        )}
        <Button onClick={() => router.push(`/admin/contas/${created.id}`)}>Concluir</Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <Field data-invalid={!!errors.fullName}>
        <FieldLabel htmlFor="fullName">Nome completo</FieldLabel>
        <Input id="fullName" autoComplete="off" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        <FieldError errors={[errors.fullName]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.cpf}>
          <FieldLabel htmlFor="cpf">CPF (opcional)</FieldLabel>
          <Input
            id="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            aria-invalid={!!errors.cpf}
            {...form.register("cpf", {
              onBlur: (e) => {
                const d = e.target.value.replace(/\D/g, "");
                if (d.length === 11) form.setValue("cpf", formatCpf(d));
              },
            })}
          />
          <FieldError errors={[errors.cpf]} />
        </Field>
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="username">Usuário de acesso</FieldLabel>
          <Input id="username" autoCapitalize="none" autoComplete="off" aria-invalid={!!errors.username} {...form.register("username")} />
          <FieldDescription>Ex.: joao.silva. Aparece nos cartões para diferenciar nomes iguais.</FieldDescription>
          <FieldError errors={[errors.username]} />
        </Field>
      </div>
      <Field data-invalid={!!errors.unit}>
        <FieldLabel htmlFor="unit">Unidade (opcional)</FieldLabel>
        <Input
          id="unit"
          list="unidades-cadastradas"
          autoComplete="off"
          maxLength={40}
          placeholder="Ex.: NRT, SUL"
          aria-invalid={!!errors.unit}
          {...form.register("unit")}
        />
        <datalist id="unidades-cadastradas">
          {units.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FieldDescription>
          Aparece como selo no cartão. Use sempre o mesmo nome; as unidades já cadastradas são sugeridas.
        </FieldDescription>
        <FieldError errors={[errors.unit]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="role">Papel</FieldLabel>
          <NativeSelect id="role" {...form.register("role")}>
            <option value="funcionario">Funcionário</option>
            <option value="visualizador">Visualizador</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="avatar">Avatar</FieldLabel>
          <NativeSelect id="avatar" {...form.register("avatar")}>
            <option value="neutro">Neutro</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </NativeSelect>
        </Field>
      </div>
      {!id && (
        <FieldSet>
          <FieldLegend variant="label">Senha de acesso</FieldLegend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Senha de acesso">
            {(
              [
                {
                  value: "temporaria",
                  title: "Gerar senha temporária",
                  text: "6 números. A pessoa cria a própria senha no primeiro acesso.",
                },
                { value: "definida", title: "Definir a senha agora", text: "A pessoa já entra com ela, sem trocar." },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={passwordMode === o.value}
                onClick={() => form.setValue("passwordMode", o.value, { shouldDirty: true })}
                className={
                  "rounded-xl border p-3 text-left " +
                  (passwordMode === o.value ? "border-primary bg-secondary" : "border-input bg-background hover:bg-muted")
                }
              >
                <span className="block font-medium text-heading">{o.title}</span>
                <span className="block text-sm text-muted-foreground">{o.text}</span>
              </button>
            ))}
          </div>
          {passwordMode === "definida" && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="new-password">Senha</FieldLabel>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...form.register("password")}
                />
                <FieldDescription>Mínimo de 8 caracteres, com letras e números.</FieldDescription>
                <FieldError errors={[errors.password]} />
              </Field>
              <Field data-invalid={!!errors.confirm}>
                <FieldLabel htmlFor="confirm-password">Repita a senha</FieldLabel>
                <PasswordInput
                  id="confirm-password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirm}
                  {...form.register("confirm")}
                />
                <FieldError errors={[errors.confirm]} />
              </Field>
            </div>
          )}
        </FieldSet>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Salvando..." : id ? "Salvar alterações" : "Criar conta"}
      </Button>
    </form>
  );
}
