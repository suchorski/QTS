"use client";

import { Trash2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://qts-api.pamals.intraer";

const COLUNAS = [
  { key: "hora", label: "Hora", width: "w-[10%]" },
  { key: "evento", label: "Evento", width: "w-[22%]" },
  { key: "participantes", label: "Participantes", width: "w-[24%]" },
  { key: "local", label: "Local", width: "w-[16%]" },
  { key: "responsavel", label: "Responsável", width: "w-[12%]" },
  { key: "uniforme", label: "Uniforme", width: "w-[10%]" },
];

function imagemUrl(caminho) {
  if (!caminho) return "";
  return `${API_BASE}${caminho}`;
}

// Verifica se uma palavra do nome completo corresponde a um token do nome de
// guerra. O token pode ser a palavra inteira ou apenas a letra inicial.
function tokenCombina(palavra, token) {
  if (!palavra || !token) return false;
  if (token.length === 1) {
    return palavra[0]?.toLowerCase() === token.toLowerCase();
  }
  return palavra.toLowerCase() === token.toLowerCase();
}

// Renderiza o nome completo deixando em negrito as palavras que compõem o
// nome de guerra. Os tokens do nome de guerra podem aparecer em qualquer
// ordem e como palavra inteira ou apenas a letra inicial (ex.: "THIAGO
// BASTOS SUCHORSKI" + "B SUCHORSKI" => Thiago **Bastos** **Suchorski**).
function renderNomeComGuerra(nome, nomeGuerra) {
  const palavras = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const tokens = String(nomeGuerra || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return palavras.map((palavra, idx) => {
    const negrito = tokens.some((token) => tokenCombina(palavra, token));
    return (
      <span key={idx} className={negrito ? "font-bold" : "font-normal"}>
        {idx > 0 ? " " : ""}
        {palavra}
      </span>
    );
  });
}

function blocoAssinatura(rotulo, pessoa) {
  const pendente = !pessoa?.name;
  const rank = pessoa?.rank || "";
  const corps = pessoa?.corps || "";
  const position = pessoa?.position || "";
  const sufixo = [rank, corps].filter(Boolean).join(" ");
  const assinatura = pessoa?.signatureUrl ? imagemUrl(pessoa.signatureUrl) : "";
  const offsetAssinatura = Number(pessoa?.signatureOffset) || 0;
  const escalaAssinatura = Number(pessoa?.signatureScale) || 1;

  return (
    <div className="flex flex-col items-center px-4 py-5 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
        {rotulo}
      </p>
      {!pendente ? (
        <>
          <div className="relative mt-2 flex h-14 w-56 items-end justify-center">
            {assinatura ? (
              <img
                src={assinatura}
                alt={`Assinatura de ${pessoa.name}`}
                className="pointer-events-none absolute bottom-0 left-1/2 max-h-14 w-auto object-contain"
                style={{
                  transform: `translateX(-50%) translateY(${offsetAssinatura}px) scale(${escalaAssinatura})`,
                  transformOrigin: "bottom center",
                }}
              />
            ) : null}
          </div>
          <div className="mb-1 h-px w-56 bg-slate-400" />
          <p className="text-sm uppercase text-slate-800">
            {renderNomeComGuerra(pessoa.name, pessoa.warName)}
            {sufixo ? <span className="font-normal"> {sufixo}</span> : null}
          </p>
          {position ? (
            <p className="text-xs text-slate-500">{position}</p>
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-1 mt-6 h-px w-56 bg-slate-300" />
          <p className="text-xs italic text-slate-400">Pendente</p>
        </>
      )}
    </div>
  );
}

export default function QtsDocument({ data, onSolicitarExclusaoItem }) {
  if (!data?.header) return null;

  const { header, days = [], proposedBy, approvedBy } = data;
  const fab = imagemUrl(header.fabImageUrl);
  const dom = imagemUrl(header.domImageUrl);
  const editavel = typeof onSolicitarExclusaoItem === "function";

  return (
    <div className="qts-print-doc overflow-x-auto">
      <div className="mx-auto min-w-[720px] max-w-5xl bg-white">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-4 border-2 border-b-0 border-slate-400 px-6 py-4">
          <div className="flex h-20 w-24 shrink-0 items-center justify-start">
            {fab ? (
              <img
                src={fab}
                alt="Comando da Aeronáutica"
                className="max-h-20 max-w-full object-contain"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-400">
                Imagem FAB
              </div>
            )}
          </div>

          <div className="flex-1 text-center">
            <h2 className="text-base font-bold uppercase leading-tight text-slate-900 sm:text-lg">
              {header.omName}
            </h2>
            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
              {header.title}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-blue-900">
              {header.dateLabel}
            </p>
          </div>

          <div className="flex h-20 w-24 shrink-0 items-center justify-end">
            {dom ? (
              <img
                src={dom}
                alt="Distintivo da OM"
                className="max-h-20 max-w-full object-contain"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-400">
                DOM
              </div>
            )}
          </div>
        </div>

        {/* Tabela */}
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="w-[6%] border border-slate-400 px-2 py-2 text-center font-bold uppercase">
                Dia
              </th>
              {COLUNAS.map((coluna) => (
                <th
                  key={coluna.key}
                  className={`${coluna.width} border border-slate-400 px-2 py-2 text-center font-bold uppercase`}
                >
                  {coluna.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIndex) => {
              const zebra = dayIndex % 2 === 0 ? "bg-blue-50/60" : "bg-white";
              const diaCell = (
                <td
                  rowSpan={day.noExpedient ? 1 : day.items.length}
                  className="border border-slate-400 bg-blue-100/80 px-1 py-2 text-center align-middle font-bold text-slate-800"
                >
                  <span className="block text-xs">{day.dayShort}</span>
                  <span className="block text-sm">{day.dayNumber}</span>
                </td>
              );

              if (day.noExpedient) {
                const fimDeSemana = day.weekday === 0 || day.weekday === 6;
                const textoVazio =
                  day.noExpedientReason ||
                  (fimDeSemana ? "Final de semana" : "Não haverá expediente");
                return (
                  <tr key={day.date} className={zebra}>
                    {diaCell}
                    <td
                      colSpan={COLUNAS.length}
                      className="border border-slate-400 px-3 py-2 text-center font-medium uppercase italic text-slate-600"
                    >
                      {textoVazio}
                    </td>
                  </tr>
                );
              }

              return day.items.map((item, idx) => (
                <tr key={`${day.date}-${idx}`} className={zebra}>
                  {idx === 0 && diaCell}
                  {item.fullRow ? (
                    <td
                      colSpan={COLUNAS.length}
                      className="border border-slate-400 px-3 py-2 text-center font-medium uppercase italic text-slate-600"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>{item.evento}</span>
                        {editavel ? (
                          <button
                            type="button"
                            onClick={() => onSolicitarExclusaoItem(day, item)}
                            className="shrink-0 rounded-full p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                            title="Excluir linha da prévia"
                            aria-label="Excluir linha da prévia"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="border border-slate-400 px-2 py-1.5 text-center text-slate-700">
                        {item.hora}
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex-1 text-center">{item.evento}</span>
                          {editavel ? (
                            <button
                              type="button"
                              onClick={() => onSolicitarExclusaoItem(day, item)}
                              className="shrink-0 rounded-full p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                              title="Excluir linha da prévia"
                              aria-label="Excluir linha da prévia"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center text-slate-700">
                        {item.participantes}
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center text-slate-700">
                        {item.local}
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center text-slate-700">
                        {item.responsavel}
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-medium text-slate-700">
                        {item.uniforme}
                      </td>
                    </>
                  )}
                </tr>
              ));
            })}
            {days.length === 0 && (
              <tr>
                <td
                  colSpan={COLUNAS.length + 1}
                  className="border border-slate-400 px-3 py-6 text-center text-slate-500"
                >
                  Nenhum item de agenda no intervalo selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Observação */}
        {data.observacao && (
          <div className="border-2 border-t-0 border-slate-400 px-4 py-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
              Observações
            </p>
            <div
              className="whitespace-pre-wrap text-justify text-sm text-slate-800 [&_b]:font-bold [&_i]:italic [&_u]:underline"
              style={{ hyphens: 'auto', WebkitHyphens: 'auto', msHyphens: 'auto' }}
              lang="pt-BR"
              dangerouslySetInnerHTML={{ __html: data.observacao }}
            />
          </div>
        )}

        {/* Rodapé / assinaturas */}
        <div className="grid grid-cols-2 border-2 border-t-0 border-slate-400">
          <div className="border-r border-slate-400">
            {blocoAssinatura("Proposto por", proposedBy)}
          </div>
          <div>{blocoAssinatura("Aprovado por", approvedBy)}</div>
        </div>
      </div>
    </div>
  );
}
