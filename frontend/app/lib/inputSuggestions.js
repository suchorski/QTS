// Sugestões de preenchimento por campo, persistidas em localStorage.
// Mantém no máximo 10 textos por campo, ordenados por mais usado e, em
// empate, em ordem alfabética. Ao salvar um novo texto acima do limite, o
// menos usado (último da ordenação) é descartado.

const PREFIX = "qts:suggestions:";
const MAX_STORED = 10;

function readStore(key) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item.label === "string" && item.label.trim()
    );
  } catch {
    return [];
  }
}

function writeStore(key, items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(items));
  } catch {
    // Ignora cota/indisponibilidade do localStorage.
  }
}

function ordenar(items) {
  return [...items].sort((a, b) => {
    const contadorA = a.count ?? 0;
    const contadorB = b.count ?? 0;
    if (contadorB !== contadorA) {
      return contadorB - contadorA;
    }
    return a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
  });
}

// Retorna os textos mais usados (já ordenados) para um campo.
export function getTopSuggestions(key, limit = 3) {
  return ordenar(readStore(key)).slice(0, limit);
}

// Registra o uso de um texto. `label` é o texto exibido/comparado e `value`
// é o conteúdo aplicado ao campo (por padrão, igual ao label).
export function recordSuggestion(key, label, value) {
  const texto = (label || "").trim();
  if (!texto) return;

  const conteudo = value === undefined || value === null ? texto : value;
  const items = readStore(key);
  const idx = items.findIndex(
    (item) =>
      item.label.localeCompare(texto, "pt-BR", { sensitivity: "base" }) === 0
  );

  if (idx >= 0) {
    items[idx] = {
      ...items[idx],
      label: texto,
      value: conteudo,
      count: (items[idx].count ?? 0) + 1,
    };
  } else {
    items.push({ label: texto, value: conteudo, count: 1 });
  }

  writeStore(key, ordenar(items).slice(0, MAX_STORED));
}
