"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Notice } from "@/components/status";
import { loginAction } from "@/app/actions/auth";
import { loginSchema } from "@/lib/validation";
import { GENERIC_ERROR } from "@/lib/errors";

type Values = z.infer<typeof loginSchema>;

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });

  const login = useMutation({
    mutationFn: loginAction,
    onSuccess: (res) => {
      if (res.ok) {
        router.replace(res.data.mustChange ? "/trocar-senha" : "/");
        router.refresh();
      }
    },
  });

  const serverError = login.data && !login.data.ok ? login.data.error : login.isError ? GENERIC_ERROR : null;

  return (
    <form className="mt-6 space-y-4" onSubmit={form.handleSubmit((v) => login.mutate(v))} noValidate>
      {notice && !serverError && <Notice tone="info">{notice}</Notice>}
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <Field data-invalid={!!form.formState.errors.username}>
        <FieldLabel htmlFor="username">Usuário</FieldLabel>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!form.formState.errors.username}
          {...form.register("username")}
        />
        <FieldError errors={[form.formState.errors.username]} />
      </Field>
      <Field data-invalid={!!form.formState.errors.password}>
        <FieldLabel htmlFor="password">Senha</FieldLabel>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        <FieldError errors={[form.formState.errors.password]} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Esqueceu a senha? Fale com o responsável pelo sistema para receber uma senha temporária.
      </p>
    </form>
  );
}
