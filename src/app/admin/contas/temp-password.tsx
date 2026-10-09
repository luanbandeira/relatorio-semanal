"use client";

import { useState } from "react";
import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Senha temporária mostrada uma única vez; não fica guardada em lugar nenhum. */
export function TempPasswordNotice({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="space-y-3 rounded-2xl border border-blue-200 bg-info-bg p-4">
      <p className="flex items-center gap-2 font-semibold text-accent-foreground">
        <KeyRoundIcon className="size-5" aria-hidden="true" /> Senha temporária
      </p>
      <p className="rounded-lg bg-background px-3 py-2 font-mono text-lg tracking-wide select-all">{password}</p>
      <p className="text-sm">
        Entregue pessoalmente. Ela vale por tempo limitado e será trocada no primeiro acesso. Esta é a única vez que ela
        aparece.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(password);
          setCopied(true);
        }}
      >
        <CopyIcon aria-hidden="true" /> {copied ? "Copiada" : "Copiar"}
      </Button>
    </div>
  );
}
