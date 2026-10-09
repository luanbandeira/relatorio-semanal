"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheckIcon, LifeBuoyIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Notice } from "@/components/status";
import { reopenWeekAction, settleWeekAction, startSupportAction } from "@/app/actions/admin";
import { formatCents } from "@/lib/money";
import { formatWeekRange } from "@/lib/dates";
import { GENERIC_ERROR } from "@/lib/errors";

export function SettleButton({
  employeeId,
  weekStart,
  version,
  blocker,
  summary,
}: {
  employeeId: string;
  weekStart: string;
  version: number | null;
  blocker: string | null;
  summary: { credit: number; received: number; spent: number; balance: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const settle = useMutation({
    mutationFn: () => settleWeekAction({ employeeId, weekStart, expectedVersion: version }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Semana acertada. Crédito final: ${formatCents(res.data.balanceCents)}.`);
        setOpen(false);
        router.refresh();
      }
    },
  });
  const error = settle.data && !settle.data.ok ? settle.data.error : settle.isError ? GENERIC_ERROR : null;

  if (blocker) {
    return (
      <div className="space-y-2">
        <Button disabled variant="outline">
          <CircleCheckIcon aria-hidden="true" /> Acertar semana
        </Button>
        <p className="text-sm text-muted-foreground">{blocker}</p>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) settle.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <CircleCheckIcon aria-hidden="true" /> Acertar semana
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acertar semana {formatWeekRange(weekStart)}?</DialogTitle>
          <DialogDescription>
            A semana será encerrada e o funcionário não poderá mais alterá-la. Não registre recebimento aqui: o complemento
            já deve estar lançado pelo funcionário.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>Crédito anterior</dt>
          <dd className="text-right tabular-nums">{formatCents(summary.credit)}</dd>
          <dt>Recebido</dt>
          <dd className="text-right tabular-nums">{formatCents(summary.received)}</dd>
          <dt>Gasto</dt>
          <dd className="text-right tabular-nums">{formatCents(summary.spent)}</dd>
          <dt className="font-semibold">Crédito final</dt>
          <dd className="text-right font-semibold tabular-nums">{formatCents(summary.balance)}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">Os valores são recalculados no servidor no momento do acerto.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={() => settle.mutate()} disabled={settle.isPending}>
            {settle.isPending ? "Acertando..." : "Confirmar acerto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenButton({
  employeeId,
  weekStart,
  laterSettled,
}: {
  employeeId: string;
  weekStart: string;
  laterSettled: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reopen = useMutation({
    mutationFn: () => reopenWeekAction({ employeeId, weekStart, reason }),
    onSuccess: (res) => {
      if (res.ok) {
        const n = res.data.reopened.length;
        toast.success(n > 1 ? `${n} semanas reabertas.` : "Semana reaberta.");
        setOpen(false);
        setReason("");
        router.refresh();
      }
    },
  });
  const error = reopen.data && !reopen.data.ok ? reopen.data.error : reopen.isError ? GENERIC_ERROR : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reopen.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <RotateCcwIcon aria-hidden="true" /> Reabrir semana
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir semana {formatWeekRange(weekStart)}?</DialogTitle>
          <DialogDescription>
            O funcionário poderá alterar os lançamentos de novo. O acerto atual fica invalidado e registrado no histórico.
          </DialogDescription>
        </DialogHeader>
        {laterSettled.length > 0 && (
          <Notice tone="warning" title="Semanas seguintes também serão reabertas">
            O crédito passa de uma semana para a outra, então estes acertos serão invalidados:{" "}
            {laterSettled
              .slice()
              .sort()
              .map((w) => formatWeekRange(w))
              .join("; ")}
            .
          </Notice>
        )}
        <div className="space-y-2">
          <Label htmlFor="reopen-reason">Motivo (obrigatório)</Label>
          <Textarea
            id="reopen-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: funcionário informou valor errado de combustível"
          />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={() => reopen.mutate()} disabled={reopen.isPending || reason.trim().length < 5}>
            {reopen.isPending ? "Reabrindo..." : "Reabrir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupportButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const start = useMutation({
    mutationFn: () => startSupportAction(employeeId),
    onSuccess: (res) => {
      if (res.ok) {
        router.push("/inicio");
        router.refresh();
      } else toast.error(res.error);
    },
    onError: () => toast.error(GENERIC_ERROR),
  });
  return (
    <Button variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>
      <LifeBuoyIcon aria-hidden="true" /> {start.isPending ? "Abrindo..." : "Acessar como funcionário"}
    </Button>
  );
}
