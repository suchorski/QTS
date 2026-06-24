"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  ShieldAlert,
  Sparkles,
  Save,
  Eye,
  Trash2,
  X,
  RefreshCcw,
  CalendarRange,
  CheckCircle2,
  FileText,
  Clock,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import QtsDocument from "../components/QtsDocument";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import RichTextEditor from "../components/RichTextEditor";
import SuggestionBadges from "../components/SuggestionBadges";
import { useToast } from "../hooks/useToast";
import {
  getMe,
  getQtsPreview,
  getQtsList,
  getQts,
  createQts,
  deleteQts,
} from "../lib/api";
import { recordSuggestion } from "../lib/inputSuggestions";

const SUGESTAO_OBSERVACAO_CHAVE = "qts:observacao";

const STATUS_INFO = {
  rascunho: {
    label: "Rascunho",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  minuta: {
    label: "Minuta",
    className: "bg-amber-100 text-amber-800 ring-amber-200",
  },
  validado: {
    label: "Validado",
    className: "bg-blue-100 text-blue-800 ring-blue-200",
  },
  aprovado: {
    label: "Aprovado",
    className: "bg-green-100 text-green-800 ring-green-200",
  },
  invalidado: {
    label: "Invalidado",
    className: "bg-red-100 text-red-800 ring-red-200",
  },
};

function StatusBadge({ status }) {
  const info = STATUS_INFO[status] || STATUS_INFO.rascunho;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${info.className}`}
    >
      {info.label}
    </span>
  );
}

function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// Segunda a domingo de uma semana com deslocamento (0 = atual, 1 = seguinte)
function semanaIntervalo(offsetSemanas = 0) {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=Dom .. 6=Sáb
  const diasAteSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - diasAteSegunda + offsetSemanas * 7);
  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);
  return { from: toInputDate(segunda), to: toInputDate(domingo) };
}

function rotuloIntervaloCurto(fromIso, toIso) {
  const fmt = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${fmt(fromIso)} – ${fmt(toIso)}`;
}

const CONFIRMACAO_VAZIA = {
  aberto: false,
  visivel: false,
  registro: null,
  rotulo: "",
};

const CONFIRMACAO_ITEM_VAZIA = {
  aberto: false,
  visivel: false,
  item: null,
};

export default function QtsPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const semanaSeguinte = semanaIntervalo(1);
  const [dateFrom, setDateFrom] = useState(semanaSeguinte.from);
  const [dateTo, setDateTo] = useState(semanaSeguinte.to);

  const [preview, setPreview] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const { sucesso: showSucesso } = useToast();

  const [salvos, setSalvos] = useState([]);
  const [carregandoSalvos, setCarregandoSalvos] = useState(true);

  const [validados, setValidados] = useState([]);
  const [carregandoValidados, setCarregandoValidados] = useState(true);

  const [modalRegistro, setModalRegistro] = useState(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [carregandoModal, setCarregandoModal] = useState(false);

  const [confirmacao, setConfirmacao] = useState(CONFIRMACAO_VAZIA);
  const [confirmacaoItem, setConfirmacaoItem] = useState(CONFIRMACAO_ITEM_VAZIA);
  const [excluindoId, setExcluindoId] = useState(null);
  const [excludedItemKeys, setExcludedItemKeys] = useState([]);

  const observacaoRef = useRef(null);

  const [sugestoesVersao, setSugestoesVersao] = useState(0);

  const ehEditor = usuario?.roles?.some((r) => r.code === "editor");

  const carregarSalvos = useCallback(async () => {
    setCarregandoSalvos(true);
    try {
      const resposta = await getQtsList({ page: 1, limit: 20, status: "minuta" });
      setSalvos(resposta.data || []);
    } catch (error) {
      // silencioso: a listagem é complementar
    } finally {
      setCarregandoSalvos(false);
    }
  }, []);

  const carregarValidados = useCallback(async () => {
    setCarregandoValidados(true);
    try {
      const resposta = await getQtsList({
        page: 1,
        limit: 20,
        status: "validado",
      });
      setValidados(resposta.data || []);
    } catch (error) {
      // silencioso: a listagem é complementar
    } finally {
      setCarregandoValidados(false);
    }
  }, []);

  useEffect(() => {
    const carregar = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }
        const dados = await getMe();
        setUsuario(dados);
        if (dados?.roles?.some((r) => r.code === "editor")) {
          await Promise.all([carregarSalvos(), carregarValidados()]);
        }
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [router, carregarSalvos, carregarValidados]);

  const aplicarSemana = (offsetSemanas) => {
    const { from, to } = semanaIntervalo(offsetSemanas);
    setDateFrom(from);
    setDateTo(to);
    setErro("");
    setPreview(null);
    setExcludedItemKeys([]);
  };

  const gerar = async () => {
    setErro("");
    if (!dateFrom || !dateTo) {
      setErro("Informe a data inicial e final");
      return;
    }
    if (dateFrom > dateTo) {
      setErro("A data final deve ser igual ou posterior à inicial");
      return;
    }
    setGerando(true);
    try {
      const dados = await getQtsPreview(dateFrom, dateTo);
      setExcludedItemKeys([]);
      setPreview({ ...dados, observacao: observacaoRef.current?.innerHTML || "" });
    } catch (error) {
      setPreview(null);
      setExcludedItemKeys([]);
      setErro(error.message || "Erro ao gerar o QTS");
    } finally {
      setGerando(false);
    }
  };

  const removerLinhaPreview = (itemKey) => {
    if (!itemKey) return;

    setPreview((atual) => {
      if (!atual?.days) return atual;

      return {
        ...atual,
        days: atual.days.map((day) => {
          if (!Array.isArray(day.items) || day.items.length === 0) {
            return day;
          }

          const items = day.items.filter((item) => item.itemKey !== itemKey);
          if (items.length === day.items.length) {
            return day;
          }

          return {
            ...day,
            items,
            noExpedient: items.length === 0,
            noExpedientReason: items.length === 0 ? null : day.noExpedientReason,
          };
        }),
      };
    });

    setExcludedItemKeys((atual) =>
      atual.includes(itemKey) ? atual : [...atual, itemKey]
    );
  };

  const abrirConfirmacaoItem = (day, item) => {
    setConfirmacaoItem({
      aberto: true,
      visivel: false,
      item: {
        itemKey: item.itemKey,
        evento: item.evento,
        hora: item.hora,
        dia: `${day.dayShort} ${day.dayNumber}`,
      },
    });
    requestAnimationFrame(() =>
      setConfirmacaoItem((atual) => ({ ...atual, visivel: true }))
    );
  };

  const fecharConfirmacaoItem = () => {
    setConfirmacaoItem((atual) => ({ ...atual, visivel: false }));
    setTimeout(() => setConfirmacaoItem(CONFIRMACAO_ITEM_VAZIA), 200);
  };

  const confirmarExclusaoItem = () => {
    if (!confirmacaoItem.item?.itemKey) return;
    removerLinhaPreview(confirmacaoItem.item.itemKey);
    fecharConfirmacaoItem();
  };

  const salvar = async () => {
    if (!preview) return;
    setErro("");
    undefined;
    setSalvando(true);
    try {
      await createQts(
        dateFrom,
        dateTo,
        observacaoRef.current?.innerHTML || "",
        excludedItemKeys
      );
      const observacaoHtml = observacaoRef.current?.innerHTML || "";
      const observacaoTexto = (observacaoRef.current?.innerText || "").trim();
      if (observacaoTexto) {
        recordSuggestion(
          SUGESTAO_OBSERVACAO_CHAVE,
          observacaoTexto,
          observacaoHtml
        );
        setSugestoesVersao((v) => v + 1);
      }
      setPreview(null);
      setExcludedItemKeys([]);
      showSucesso("QTS salvo como minuta com sucesso.");
      await carregarSalvos();
    } catch (error) {
      setErro(error.message || "Erro ao salvar o QTS");
    } finally {
      setSalvando(false);
    }
  };

  const abrirVisualizacao = async (registro) => {
    setCarregandoModal(true);
    setModalRegistro({ resumo: registro, completo: null });
    requestAnimationFrame(() => setModalVisivel(true));
    try {
      const completo = await getQts(registro.id);
      setModalRegistro({ resumo: registro, completo });
    } catch (error) {
      setErro(error.message || "Erro ao carregar o QTS");
      fecharVisualizacao();
    } finally {
      setCarregandoModal(false);
    }
  };

  const fecharVisualizacao = () => {
    setModalVisivel(false);
    setTimeout(() => setModalRegistro(null), 200);
  };

  const abrirConfirmacao = (registro) => {
    setConfirmacao({
      aberto: true,
      visivel: false,
      registro,
      rotulo: rotuloIntervaloCurto(
        toInputDate(new Date(registro.startDate)),
        toInputDate(new Date(registro.endDate))
      ),
    });
    requestAnimationFrame(() =>
      setConfirmacao((atual) => ({ ...atual, visivel: true }))
    );
  };

  const fecharConfirmacao = () => {
    setConfirmacao((atual) => ({ ...atual, visivel: false }));
    setTimeout(() => setConfirmacao(CONFIRMACAO_VAZIA), 200);
  };

  const confirmarExclusao = async () => {
    if (!confirmacao.registro) return;
    setExcluindoId(confirmacao.registro.id);
    setErro("");
    try {
      await deleteQts(confirmacao.registro.id);
      showSucesso("QTS excluído com sucesso.");
      fecharConfirmacao();
      await Promise.all([carregarSalvos(), carregarValidados()]);
    } catch (error) {
      setErro(error.message || "Erro ao excluir o QTS");
    } finally {
      setExcluindoId(null);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-slate-900">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <Sidebar usuario={usuario} />

      <div className="md:pl-64">
        <main className="mx-auto max-w-6xl px-4 py-8 pt-16 md:pt-8">
          {!ehEditor ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Restrição de Acesso
              </h1>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Esta tela é exclusiva para usuários com o perfil{" "}
                <strong>Editor</strong>. Seu perfil atual não possui permissão
                para gerar o Quadro de Trabalho Semanal.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="btn-primary"
              >
                Voltar ao Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Cabeçalho da página */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-white shadow-md">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-blue-900">
                      Gerar QTS
                    </h1>
                    <p className="text-sm text-gray-600">
                      Quadro de Trabalho Semanal da{" "}
                      {usuario?.militaryOrganization?.acronym || "sua OM"}
                    </p>
                  </div>
                </div>
              </div>

              {erro && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {erro}
                </div>
              )}

              {/* Painel de geração */}
              <div className="card mb-6 overflow-hidden p-0">
                <div className="border-b border-gray-100 bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-4">
                  <div className="flex items-center gap-2 text-white">
                    <CalendarRange className="h-5 w-5" />
                    <h2 className="font-semibold">Intervalo do quadro</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-blue-100">
                    Pré-preenchido com a próxima semana (segunda a domingo).
                  </p>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">
                        Data inicial
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="input-field w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">
                        Data final
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="input-field w-full"
                      />
                    </div>

                    <button
                      onClick={gerar}
                      disabled={gerando}
                      className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {gerando ? (
                        <RefreshCcw className="h-5 w-5 animate-spin" />
                      ) : (
                        <Sparkles className="h-5 w-5" />
                      )}
                      {gerando ? "Gerando..." : "Gerar QTS"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Atalhos:
                    </span>
                    {[
                      { label: "Semana atual", offset: 0 },
                      { label: "Próxima semana", offset: 1 },
                      { label: "Em 2 semanas", offset: 2 },
                    ].map(({ label, offset }) => {
                      const intervalo = semanaIntervalo(offset);
                      const ativo =
                        dateFrom === intervalo.from && dateTo === intervalo.to;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => aplicarSemana(offset)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            ativo
                              ? "border-blue-900 bg-blue-900 text-white"
                              : "border-gray-300 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-900"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Observação */}
                  <div className="mt-5 border-t border-gray-100 pt-5">
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">
                      Observações
                      <span className="ml-1 font-normal text-gray-400">(aparece no documento entre os dias e as assinaturas)</span>
                    </label>
                    <RichTextEditor editorRef={observacaoRef} />
                    <SuggestionBadges
                      storageKey={SUGESTAO_OBSERVACAO_CHAVE}
                      refreshKey={sugestoesVersao}
                      onSelect={(item) => {
                        if (observacaoRef.current) {
                          observacaoRef.current.innerHTML = item.value;
                          observacaoRef.current.focus();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Pré-visualização */}
              {preview && (
                <div className="card mb-8 p-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-900" />
                      <h2 className="font-semibold text-blue-900">
                        Pré-visualização
                      </h2>
                      <StatusBadge status="rascunho" />
                    </div>
                    <button
                      onClick={salvar}
                      disabled={salvando}
                      className="btn-primary flex items-center gap-2 disabled:opacity-60"
                    >
                      {salvando ? (
                        <RefreshCcw className="h-5 w-5 animate-spin" />
                      ) : (
                        <Save className="h-5 w-5" />
                      )}
                      {salvando ? "Gerando..." : "Gerar Minuta"}
                    </button>
                  </div>
                  <div className="border-b border-gray-100 px-6 py-4">
                    <p className="text-xs text-gray-500">
                      Use a lixeira dentro da célula do evento para retirar da minuta itens que não ocorrerão nesta semana.
                    </p>
                  </div>
                  <div className="bg-slate-100 p-4 sm:p-6">
                    <div className="rounded-lg bg-white p-3 shadow-inner sm:p-5">
                      <QtsDocument
                        data={preview}
                        onSolicitarExclusaoItem={abrirConfirmacaoItem}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Minutas salvas */}
              <div className="card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-blue-900">
                    Minutas salvas
                  </h2>
                  <span className="text-sm text-gray-500">
                    {salvos.length} registro{salvos.length === 1 ? "" : "s"}
                  </span>
                </div>

                {carregandoSalvos ? (
                  <p className="py-8 text-center text-gray-500">Carregando...</p>
                ) : salvos.length === 0 ? (
                  <div className="py-10 text-center">
                    <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-500">
                      Nenhuma minuta salva ainda. Gere e salve um quadro para começar.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {salvos.map((registro) => (
                      <li
                        key={registro.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              {registro.dateLabel}
                            </span>
                            <StatusBadge status={registro.status} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            {registro.createdBy?.name && (
                              <span>
                                Gerado por{" "}
                                {registro.createdBy.rank
                                  ? `${registro.createdBy.rank} `
                                  : ""}
                                {registro.createdBy.warName ||
                                  registro.createdBy.name}
                              </span>
                            )}
                            {registro.approvedBy?.name && (
                              <span className="flex items-center gap-1 text-green-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Aprovado
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => abrirVisualizacao(registro)}
                            className="rounded-lg p-2 text-blue-700 transition-colors hover:bg-blue-50"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {registro.status !== "aprovado" && (
                            <button
                              onClick={() => abrirConfirmacao(registro)}
                              disabled={excluindoId === registro.id}
                              className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* QTS validados */}
              <div className="card mt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-blue-900">
                    QTS validados
                  </h2>
                  <span className="text-sm text-gray-500">
                    {validados.length} registro{validados.length === 1 ? "" : "s"}
                  </span>
                </div>

                {carregandoValidados ? (
                  <p className="py-8 text-center text-gray-500">Carregando...</p>
                ) : validados.length === 0 ? (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-500">
                      Nenhum QTS validado no momento.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {validados.map((registro) => (
                      <li
                        key={registro.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              {registro.dateLabel}
                            </span>
                            <StatusBadge status={registro.status} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            {registro.createdBy?.name && (
                              <span>
                                Gerado por{" "}
                                {registro.createdBy.rank
                                  ? `${registro.createdBy.rank} `
                                  : ""}
                                {registro.createdBy.warName ||
                                  registro.createdBy.name}
                              </span>
                            )}
                            {registro.validatedBy?.name && (
                              <span className="flex items-center gap-1 text-blue-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Validado por{" "}
                                {registro.validatedBy.rank
                                  ? `${registro.validatedBy.rank} `
                                  : ""}
                                {registro.validatedBy.warName ||
                                  registro.validatedBy.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => abrirVisualizacao(registro)}
                            className="rounded-lg p-2 text-blue-700 transition-colors hover:bg-blue-50"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => abrirConfirmacao(registro)}
                            disabled={excluindoId === registro.id}
                            className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal de visualização */}
      {modalRegistro && (
        <div
          className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 transition-opacity duration-200 ${
            modalVisivel ? "bg-black/70 opacity-100" : "bg-black/0 opacity-0"
          }`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              fecharVisualizacao();
            }
          }}
        >
          <div
            className={`relative my-8 w-full max-w-5xl rounded-lg bg-white shadow-2xl transition-all duration-200 ${
              modalVisivel ? "translate-y-0 scale-100" : "translate-y-2 scale-95"
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-900" />
                <h3 className="font-semibold text-blue-900">
                  {modalRegistro.resumo?.dateLabel}
                </h3>
                <StatusBadge status={modalRegistro.resumo?.status} />
              </div>
              <button
                onClick={fecharVisualizacao}
                className="rounded-full p-1 text-gray-600 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-100 p-4 sm:p-6">
              {carregandoModal || !modalRegistro.completo ? (
                <p className="flex items-center justify-center gap-2 py-12 text-gray-500">
                  <Clock className="h-4 w-4 animate-pulse" />
                  Carregando documento...
                </p>
              ) : (
                <div className="rounded-lg bg-white p-3 shadow-inner sm:p-5">
                  <QtsDocument data={modalRegistro.completo.content} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        aberto={confirmacao.aberto}
        visivel={confirmacao.visivel}
        titulo="Excluir QTS"
        descricao={`Tem certeza que deseja excluir o QTS de ${confirmacao.rotulo}? Esta ação não pode ser desfeita.`}
        confirmando={Boolean(excluindoId)}
        onConfirmar={confirmarExclusao}
        onCancelar={fecharConfirmacao}
      />

      <ConfirmDeleteModal
        aberto={confirmacaoItem.aberto}
        visivel={confirmacaoItem.visivel}
        titulo="Excluir linha da prévia"
        descricao={
          confirmacaoItem.item
            ? `Deseja excluir da minuta o evento ${confirmacaoItem.item.evento} (${confirmacaoItem.item.hora}) de ${confirmacaoItem.item.dia}?`
            : ""
        }
        confirmarTexto="Excluir linha"
        onConfirmar={confirmarExclusaoItem}
        onCancelar={fecharConfirmacaoItem}
      />
    </div>
  );
}
