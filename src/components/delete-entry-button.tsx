"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
import { deleteEntryAction } from "@/app/actions/entries";
import { GENERIC_ERROR } from "@/lib/errors";

const NOUN = { expense: "despesa", receipt: "recebimento", route: "percurso", attachment: "anexo" } as const;

export function DeleteEntryButton({
  kind,
  id,
  label,
}: {
  kind: keyof typeof NOUN;
  id: string;
  label: string;
}) {
  const router = useRouter();
  const del = useMutation({
    mutationFn: () => deleteEntryAction({ kind, id }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`${NOUN[kind][0].toUpperCase()}${NOUN[kind].slice(1)} excluído(a).`);
        router.refresh();
      } else toast.error(res.error);
    },
    onError: () => toast.error(GENERIC_ERROR),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-lg text-destructive hover:bg-red-50"
          aria-label={`Excluir ${NOUN[kind]}: ${label}`}
          disabled={del.isPending}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {NOUN[kind]}?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{label}&rdquo; deixará de aparecer e sairá dos totais. A exclusão fica registrada no histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-white hover:bg-destructive/90">
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
