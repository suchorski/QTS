"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ShieldAlert,
  Eye,
  X,
  CheckCircle2,
  FileText,
  Clock,
  AlertTriangle,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  Search,
  Printer,
  Share2,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import QtsDocument from "../components/QtsDocument";
import { useToast } from "../hooks/useToast";
import {
  getMe,
  getQtsHistoryList,
  getQtsHistory,
} from "../lib/api";

function StatusBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200">
      Arquivado
    </span>
  );
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function HistoricoQtsPage() {
  const router = useRouter();
  const { sucesso: showSucesso, erro: showErro } = useToast();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [itens, setItens] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  const [modalRegistro, setModalRegistro] = useState(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [carregandoModal, setCarregandoModal] = useState(false);

  const ehHistorico = usuario?.roles?.some((r) => r.code === "historico_qts");

  const carregarHistorico = useCallback(
    async (pagina = 1, filtros = {}) => {
      setCarregandoLista(true);
      try {
        const resposta = await getQtsHistoryList({
          page: pagina,
          limit: 20,
          dateFrom: filtros.dateFrom || "",
          dateTo: filtros.dateTo || "",
        });
        setItens(resposta.data || []);
        setPage(resposta.page || pagina);
        setTotal(resposta.total || 0);
        setHasMore(Boolean(resposta.hasMore));
      } catch (error) {
        showErro(error.message || "Erro ao carregar o histórico de QTS");
      } finally {
        setCarregandoLista(false);
      }
    },
    []
  );

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
        if (dados?.roles?.some((r) => r.code === "historico_qts")) {
          await carregarHistorico(1, {});
        }
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [router, carregarHistorico]);

  const abrirVisualizacao = async (registro) => {
    setCarregandoModal(true);
    setModalRegistro({ resumo: registro, completo: null });
    requestAnimationFrame(() => setModalVisivel(true));
    try {
      const completo = await getQtsHistory(registro.id);
      setModalRegistro({ resumo: registro, completo });
    } catch (error) {
      showErro(error.message || "Erro ao carregar o QTS");
      fecharVisualizacao();
    } finally {
      setCarregandoModal(false);
    }
  };

  const fecharVisualizacao = () => {
    setModalVisivel(false);
    setTimeout(() => setModalRegistro(null), 200);
  };

  const aplicarFiltros = () => {
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    carregarHistorico(1, { dateFrom, dateTo });
  };

  const imprimirRegistro = (registro) => {
    const url = `/qts-impressao?tipo=historico&id=${encodeURIComponent(registro.id)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copiarLinkRegistro = async (registro) => {
    try {
      const url = `${window.location.origin}/qts-compartilhado/${encodeURIComponent(registro.id)}`;
      await navigator.clipboard.writeText(url);
      showSucesso("Link copiado para a área de transferência.");
    } catch (error) {
      showErro(error.message || "Erro ao copiar o link do QTS");
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
          {!ehHistorico ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="mb-2 text-2xl font-bold text-red-600">Restrição de Acesso</h1>
              <p className="mx-auto mb-6 max-w-md text-gray-600">
                Esta tela é exclusiva para usuários com o perfil <strong>Histórico de QTS</strong>.
              </p>
              <button onClick={() => router.push("/dashboard")} className="btn-primary">
                Voltar ao Dashboard
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-white shadow-md">
                    <Archive className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-blue-900">Histórico de QTS</h1>
                    <p className="text-sm text-gray-600">
                      QTS arquivados do {usuario?.militaryOrganization?.acronym || "OM"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => carregarHistorico(page, { dateFrom: appliedDateFrom, dateTo: appliedDateTo })}
                  disabled={carregandoLista}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-900 disabled:opacity-60"
                >
                  <RefreshCcw className={`h-4 w-4 ${carregandoLista ? "animate-spin" : ""}`} />
                  Atualizar
                </button>
              </div>

              <div className="card mb-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <Search className="h-4 w-4" />
                  Filtrar por período de aprovação
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-sm text-gray-700">
                    <span>Data inicial</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="input-field w-full"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-700">
                    <span>Data final</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                      className="input-field w-full"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <button onClick={aplicarFiltros} className="btn-primary w-full">
                      Aplicar filtro
                    </button>
                    <button
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                        setAppliedDateFrom("");
                        setAppliedDateTo("");
                        carregarHistorico(1, {});
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-blue-900">Histórico arquivado</h2>
                  <span className="text-sm text-gray-500">
                    {total} registro{total === 1 ? "" : "s"}
                  </span>
                </div>

                {carregandoLista ? (
                  <p className="py-8 text-center text-gray-500">Carregando...</p>
                ) : itens.length === 0 ? (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-500">Nenhum QTS arquivado encontrado.</p>
                  </div>
                ) : (
                  <>
                    <ul className="space-y-3">
                      {itens.map((registro) => (
                        <li
                          key={registro.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-gray-900">{registro.dateLabel}</span>
                              <StatusBadge />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                              {registro.validatedBy?.name && (
                                <span>
                                  Validado por {registro.validatedBy.rank ? `${registro.validatedBy.rank} ` : ""}
                                  {registro.validatedBy.warName || registro.validatedBy.name}
                                </span>
                              )}
                              {registro.approvedBy?.name && (
                                <span>
                                  Aprovado por {registro.approvedBy.rank ? `${registro.approvedBy.rank} ` : ""}
                                  {registro.approvedBy.warName || registro.approvedBy.name}
                                </span>
                              )}
                              {registro.approvedAt && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {new Date(registro.approvedAt).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                              {registro.archivedAt && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  Arquivado em {new Date(registro.archivedAt).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => abrirVisualizacao(registro)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900"
                              title="Visualizar"
                              aria-label="Visualizar"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => imprimirRegistro(registro)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900"
                              title="Imprimir"
                              aria-label="Imprimir"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => copiarLinkRegistro(registro)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900"
                              title="Copiar link"
                              aria-label="Copiar link"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-200 pt-4 text-sm">
                      <button
                        onClick={() => carregarHistorico(page - 1, { dateFrom: appliedDateFrom, dateTo: appliedDateTo })}
                        disabled={page <= 1 || carregandoLista}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900 disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </button>
                      <span className="text-gray-500">Página {page}</span>
                      <button
                        onClick={() => carregarHistorico(page + 1, { dateFrom: appliedDateFrom, dateTo: appliedDateTo })}
                        disabled={!hasMore || carregandoLista}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900 disabled:opacity-50"
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>

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
            className={`relative my-8 w-full max-w-6xl overflow-auto rounded-2xl bg-white shadow-2xl transition-all duration-200 ${
              modalVisivel ? "translate-y-0 scale-100" : "translate-y-2 scale-95"
            }`}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-blue-900">Visualizar histórico de QTS</h3>
                <p className="text-sm text-gray-500">{modalRegistro.resumo.dateLabel}</p>
              </div>
              <button
                onClick={fecharVisualizacao}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              {carregandoModal || !modalRegistro.completo ? (
                <div className="flex items-center justify-center py-16 text-gray-500">
                  <RefreshCcw className="mr-2 h-5 w-5 animate-spin" />
                  Carregando QTS...
                </div>
              ) : (
                <QtsDocument data={modalRegistro.completo.content} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}