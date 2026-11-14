"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const INTERVAL_MS = 3000;
const MAX_TRIES = 20; // ~1 minuto; depois disso a pessoa pode recarregar a página.

/** Enquanto a triagem está pendente, atualiza o painel até o resultado chegar (a triagem roda após a resposta). */
export function TriageRefresh() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= MAX_TRIES) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, INTERVAL_MS);
    return () => clearTimeout(t);
  }, [router, tries]);
  return (
    <p className="panel-note" role="status" aria-live="polite">
      {tries < MAX_TRIES ? "Classificando… o resultado aparece aqui em alguns segundos." : "A triagem está demorando. Recarregue a página em instantes."}
    </p>
  );
}
