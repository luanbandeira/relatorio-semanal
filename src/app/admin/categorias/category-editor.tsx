"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Notice } from "@/components/status";
import { saveCategoryAction } from "@/app/actions/admin";
import { GENERIC_ERROR } from "@/lib/errors";

type Category = { id: string; name: string; grupo: "percurso" | "outras"; active: boolean; sort_order: number };
type Draft = { id?: string; name: string; grupo: "percurso" | "outras"; active: boolean; sortOrder: number };

export function CategoryEditor({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: saveCategoryAction,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Categoria salva.");
        setDraft(null);
        router.refresh();
      }
    },
  });
  const error = save.data && !save.data.ok ? save.data.error : save.isError ? GENERIC_ERROR : null;

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-2xl border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-heading">{c.name}</span>{" "}
              <span className="text-sm text-muted-foreground">
                · {c.grupo === "percurso" ? "Percurso" : "Outras despesas"} · ordem {c.sort_order}
              </span>
              {!c.active && <span className="ml-2 text-sm font-medium text-destructive">Desativada</span>}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar ${c.name}`}
              onClick={() => {
                save.reset();
                setDraft({ id: c.id, name: c.name, grupo: c.grupo, active: c.active, sortOrder: c.sort_order });
              }}
            >
              <PencilIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>

      {!draft && (
        <Button
          variant="outline"
          onClick={() => {
            save.reset();
            setDraft({ name: "", grupo: "outras", active: true, sortOrder: 100 });
          }}
        >
          <PlusIcon aria-hidden="true" /> Nova categoria
        </Button>
      )}

      {draft && (
        <form
          className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <h2 className="font-semibold sm:col-span-2">{draft.id ? "Editar categoria" : "Nova categoria"}</h2>
          {error && <Notice tone="error" className="sm:col-span-2">{error}</Notice>}
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome</Label>
            <Input id="cat-name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-group">Grupo</Label>
            <NativeSelect
              id="cat-group"
              value={draft.grupo}
              onChange={(e) => setDraft({ ...draft, grupo: e.target.value as Draft["grupo"] })}
            >
              <option value="percurso">Percurso</option>
              <option value="outras">Outras despesas</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-order">Ordem</Label>
            <Input
              id="cat-order"
              type="number"
              min={0}
              max={1000}
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-3">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Ativa
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
