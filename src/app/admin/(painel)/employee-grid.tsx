"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HourglassIcon, SearchIcon, UserXIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { UnitBadge } from "@/components/unit-badge";
import type { EmployeeCard } from "@/lib/queries";
import { normalizeUsername } from "@/lib/identity";
import { formatCents } from "@/lib/money";

function norm(s: string) {
  return normalizeUsername(s);
}

/** Cartões em ordem alfabética com nome, usuário e avatar; busca por nome ou usuário. */
export function EmployeeGrid({
  employees,
  owed = {},
  allowInactive,
  showInactive,
}: {
  employees: EmployeeCard[];
  /** Valor que a empresa deve a cada funcionário (centavos), por id. */
  owed?: Record<string, number>;
  allowInactive: boolean;
  showInactive: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = norm(q);
    return n
      ? employees.filter(
          (e) => norm(e.full_name).includes(n) || e.username.includes(n) || (e.unit ? norm(e.unit).includes(n) : false),
        )
      : employees;
  }, [employees, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="busca" className="sr-only">
            Buscar por nome, usuário ou unidade
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="busca"
            type="search"
            placeholder="Buscar por nome, usuário ou unidade"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        {allowInactive && (
          <Link
            href={showInactive ? "/admin" : "/admin?desativados=1"}
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"
            aria-pressed={showInactive}
          >
            <UserXIcon className="size-4" aria-hidden="true" />
            {showInactive ? "Ocultar desativados" : "Incluir desativados"}
          </Link>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "funcionário" : "funcionários"}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">Nenhum funcionário encontrado.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {filtered.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/funcionarios/${e.id}`}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary hover:bg-secondary"
              >
                <UserAvatar userId={e.id} name={e.full_name} avatar={e.avatar} hasPhoto={!!e.photo_path} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-heading">{e.full_name}</span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{e.username}</span>
                    <UnitBadge unit={e.unit} className="ml-auto" />
                  </span>
                  {owed[e.id] > 0 && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                      <HourglassIcon className="size-3.5" aria-hidden="true" /> A receber {formatCents(owed[e.id])}
                    </span>
                  )}
                  {!e.active && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                      <UserXIcon className="size-3.5" aria-hidden="true" /> Desativado
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
