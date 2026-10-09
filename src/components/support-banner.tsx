"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { LifeBuoyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endSupportAction } from "@/app/actions/admin";
import { formatDateTimeBR } from "@/lib/dates";

/** Faixa permanente do modo de suporte, com ação para sair. */
export function SupportBanner({
  employeeName,
  username,
  expiresAt,
  employeeId,
}: {
  employeeName: string;
  username: string;
  expiresAt: string;
  employeeId: string;
}) {
  const router = useRouter();
  const exit = useMutation({
    mutationFn: () => endSupportAction(),
    onSuccess: () => {
      router.push(`/admin/funcionarios/${employeeId}`);
      router.refresh();
    },
  });
  return (
    <div role="status" className="sticky top-0 z-40 bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <LifeBuoyIcon className="size-5 shrink-0" aria-hidden="true" />
        <p className="mr-auto">
          <strong>Modo de suporte:</strong> você está acessando como {employeeName} ({username}). Suas ações ficam
          registradas em seu nome. Expira às {formatDateTimeBR(expiresAt).split(" ")[1]}.
        </p>
        <Button size="sm" variant="outline" onClick={() => exit.mutate()} disabled={exit.isPending}>
          {exit.isPending ? "Saindo..." : "Sair do modo de suporte"}
        </Button>
      </div>
    </div>
  );
}
