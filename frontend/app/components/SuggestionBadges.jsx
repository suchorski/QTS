"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { getTopSuggestions } from "../lib/inputSuggestions";

// Mostra os textos mais usados de um campo como badges clicáveis para
// preenchimento rápido. Lê de localStorage via getTopSuggestions.
export default function SuggestionBadges({
  storageKey,
  onSelect,
  refreshKey,
  limit = 3,
  className = "",
}) {
  const [sugestoes, setSugestoes] = useState([]);

  useEffect(() => {
    setSugestoes(getTopSuggestions(storageKey, limit));
  }, [storageKey, limit, refreshKey]);

  if (sugestoes.length === 0) return null;

  return (
    <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${className}`}>
      {sugestoes.map((item) => (
        <button
          key={item.label}
          type="button"
          title={item.label}
          onClick={() => onSelect?.(item)}
          className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100"
        >
          <Sparkles className="h-3 w-3 shrink-0 text-blue-500" />
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
