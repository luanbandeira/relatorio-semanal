"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRoundIcon, UserCheckIcon, UserXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { resetPasswordAction, setAccountActiveAction } from "@/app/actions/admin";
import { GENERIC_ERROR } from "@/lib/errors";
import { TempPasswordNotice } from "../temp-password";

export function AccountActions({ id, active, isSelf }: { id: string; active: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [temp, setTemp] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const reset = useMutation({
    mutationFn: () => resetPasswordAction(id),
    onSuccess: (r) => (r.ok ? setTemp(r.data.tempPassword) : toast.error(r.error)),
    onError: () => toast.error(GENERIC_ERROR),
  });
  const toggle = useMutation({
    mutationFn: () => setAccountActiveAction({ id, active: !active, reason: reason || undefined }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(active ? "Conta desativada. O acesso foi bloqueado." : "Conta reativada.");
        setReason("");
        router.refresh();
      } else toast.error(r.error);
    },
    onError: () => toast.error(GENERIC_ERROR),
  });

  if (isSelf) return null;

  return (
    <section className="space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">Acesso</h2>
      {temp && <TempPasswordNotice password={temp} />}
      <div className="flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={reset.isPending}>
              <KeyRoundIcon aria-hidden="true" /> Definir senha temporária
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Definir nova senha temporária?</AlertDialogTitle>
              <AlertDialogDescription>
                A senha atual deixa de valer. A pessoa precisará trocar a senha ao entrar. A senha antiga não é mostrada nem
                recuperada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => reset.mutate()}>Gerar senha</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant={active ? "destructive" : "outline"} disabled={toggle.isPending}>
              {active ? <UserXIcon aria-hidden="true" /> : <UserCheckIcon aria-hidden="true" />}
              {active ? "Desativar conta" : "Reativar conta"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{active ? "Desativar esta conta?" : "Reativar esta conta?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {active
                  ? "O acesso é bloqueado imediatamente, inclusive em sessões abertas. O histórico é preservado."
                  : "A pessoa volta a acessar com a senha atual."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {active && (
              <div className="space-y-2">
                <Label htmlFor="deact-reason">Motivo (opcional)</Label>
                <Textarea id="deact-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => toggle.mutate()}>{active ? "Desativar" : "Reativar"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
