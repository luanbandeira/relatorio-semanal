"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Gravações nunca são repetidas automaticamente: a pessoa decide
          // tentar de novo (o id gerado no cliente evita duplicidade).
          mutations: { retry: false },
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
