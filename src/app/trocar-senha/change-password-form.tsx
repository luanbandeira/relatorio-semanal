"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Notice } from "@/components/status";
import { changePasswordAction } from "@/app/actions/auth";
import { changePasswordSchema } from "@/lib/validation";
import { GENERIC_ERROR } from "@/lib/errors";

type Values = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const change = useMutation({
    mutationFn: changePasswordAction,
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Senha alterada.");
        router.replace("/");
        router.refresh();
      } else if (res.fieldErrors) {
        for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof Values, { message: v });
      }
    },
  });
  const serverError = change.data && !change.data.ok ? change.data.error : change.isError ? GENERIC_ERROR : null;

  return (
    <form className="mt-6 space-y-4" onSubmit={form.handleSubmit((v) => change.mutate(v))} noValidate>
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <Field data-invalid={!!form.formState.errors.password}>
        <FieldLabel htmlFor="password">Nova senha</FieldLabel>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.password}
          aria-describedby="password-help"
          {...form.register("password")}
        />
        <FieldDescription id="password-help">Mínimo de 8 caracteres, com letras e números.</FieldDescription>
        <FieldError errors={[form.formState.errors.password]} />
      </Field>
      <Field data-invalid={!!form.formState.errors.confirm}>
        <FieldLabel htmlFor="confirm">Repita a nova senha</FieldLabel>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.confirm}
          {...form.register("confirm")}
        />
        <FieldError errors={[form.formState.errors.confirm]} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={change.isPending}>
        {change.isPending ? "Salvando..." : "Salvar nova senha"}
      </Button>
      {forced ? (
        <a href="/sair" className="block text-center text-sm text-primary underline-offset-4 hover:underline">
          Sair
        </a>
      ) : (
        <Link href="/perfil" className="block text-center text-sm text-primary underline-offset-4 hover:underline">
          Voltar
        </Link>
      )}
    </form>
  );
}
