import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esboços exibidos imediatamente ao trocar de tela (loading.tsx), enquanto os
 * dados chegam do servidor. Mesma estrutura das telas reais para a mudança
 * não "pular".
 */
function Loading({ children, label = "Carregando" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-5">
      <span className="sr-only">{label}...</span>
      {children}
    </div>
  );
}

export function WeekSkeleton() {
  return (
    <Loading label="Carregando a semana">
      <Skeleton className="h-6 w-40" />
      <div className="space-y-4 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-52" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
      <div className="space-y-2 rounded-xl border p-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex justify-between py-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function ListSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <Loading>
      {title && <Skeleton className="h-7 w-44" />}
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function FormSkeleton() {
  return (
    <Loading label="Carregando o formulário">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-12 rounded-lg" />
    </Loading>
  );
}

export function CardGridSkeleton() {
  return (
    <Loading label="Carregando funcionários">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-11 rounded-lg" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border p-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function EmployeeDetailSkeleton() {
  return (
    <Loading label="Carregando semanas do funcionário">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border p-4">
          <div className="flex justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, j) => (
              <Skeleton key={j} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      ))}
    </Loading>
  );
}
