"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Check,
  Trash2,
  X,
  Clock3,
  ShieldCheck,
  Filter,
  ChevronDown,
} from "lucide-react";
import {
  getMe,
  getEventUniforms,
  getEventRequests,
  createEventRequest,
  updateEventRequestStatus,
  deleteEventRequest,
} from "../lib/api";
import { buildUniformSortKey } from "../lib/uniformSort";
import Sidebar from "../components/Sidebar";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "pendente", label: "Pendente" },
  { value: "aceito", label: "Aceito" },
  { value: "negado", label: "Negado" },
];

const FORM_INICIAL = {
  eventDate: "",
  startTime: "",
  endTime: "",
  title: "",
  information: "",
  location: "",
  responsible: "",
  uniformIds: [],
};

function ordenarUniformes(lista) {
  return [...(lista || [])].sort((a, b) => {
    const contadorA = a.usages ?? 0;
    const contadorB = b.usages ?? 0;
    if (contadorB !== contadorA) {
      return contadorB - contadorA;
    }
    const keyA = buildUniformSortKey(a.uniform);
    const keyB = buildUniformSortKey(b.uniform);
    return keyA.localeCompare(keyB, "pt-BR", {
      sensitivity: "base",
    });
  });
}

function formatarData(iso) {
  if (!iso) return "";
  const texto = String(iso);

  // Para datas-only (AAAA-MM-DD ou AAAA-MM-DDTHH:mm...), evita deslocamento por fuso.
  const matchData = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchData) {
    const [, ano, mes, dia] = matchData;
    return `${dia}/${mes}/${ano}`;
  }

  const date = new Date(texto);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function badgeStatus(status) {
  if (status === "aceito") return "bg-emerald-100 text-emerald-800";
  if (status === "negado") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function rotuloStatus(status) {
  if (status === "aceito") return "Aceito";
  if (status === "negado") return "Negado";
  return "Pendente";
}

export default function SolicitacoesPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);

  const [uniformes, setUniformes] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [modalExclusaoAberto, setModalExclusaoAberto] = useState(false);
  const [modalExclusaoVisivel, setModalExclusaoVisivel] = useState(false);
  const [solicitacaoParaExcluir, setSolicitacaoParaExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);

  const [lista, setLista] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);

  const [filtroStatus, setFiltroStatus] = useState("");

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const loadMoreRef = useRef(null);
  const modalCloseTimerRef = useRef(null);
  const modalExclusaoCloseTimerRef = useRef(null);

  const isEditor = useMemo(
    () => usuario?.roles?.some((r) => r.code === "editor") || false,
    [usuario]
  );

  const canReviewRequests = useMemo(
    () =>
      usuario?.roles?.some((r) =>
        ["editor", "validador", "aprovador"].includes(r.code)
      ) || false,
    [usuario]
  );

  const uniformesOrdenados = useMemo(
    () => ordenarUniformes(uniformes),
    [uniformes]
  );

  const carregarLista = useCallback(
    async ({ page = 1, append = false, status = filtroStatus } = {}) => {
      if (append) {
        setCarregandoMais(true);
      } else {
        setCarregandoLista(true);
      }

      try {
        const resposta = await getEventRequests({
          page,
          limit: 10,
          status,
        });

        const data = resposta.data || [];
        setLista((atual) => (append ? [...atual, ...data] : data));
        setPagina(page);
        setHasMore(Boolean(resposta.hasMore));
      } catch (errorLoad) {
        setErro(errorLoad.message || "Erro ao carregar solicitações");
      } finally {
        setCarregandoLista(false);
        setCarregandoMais(false);
      }
    },
    [filtroStatus]
  );

  useEffect(() => {
    const carregarUsuario = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }

        const [dadosUsuario, respostaUniformes] = await Promise.all([
          getMe(),
          getEventUniforms(),
        ]);

        setUsuario(dadosUsuario);
        setUniformes(respostaUniformes.data || []);
      } catch (errorLoad) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregandoUsuario(false);
      }
    };

    carregarUsuario();

    return () => {
      if (modalCloseTimerRef.current) {
        clearTimeout(modalCloseTimerRef.current);
      }
      if (modalExclusaoCloseTimerRef.current) {
        clearTimeout(modalExclusaoCloseTimerRef.current);
      }
    };
  }, [router]);

  useEffect(() => {
    if (!usuario) return;
    carregarLista({ page: 1, append: false, status: filtroStatus });
  }, [usuario, filtroStatus, carregarLista]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (!hasMore || carregandoLista || carregandoMais) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && !carregandoMais) {
          carregarLista({ page: pagina + 1, append: true });
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMore, carregandoLista, carregandoMais, pagina, carregarLista]);

  const alternarUniforme = (id) => {
    setForm((atual) => {
      const set = new Set(atual.uniformIds);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      return {
        ...atual,
        uniformIds: [...set],
      };
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvando(true);

    try {
      await createEventRequest(form);
      setForm(FORM_INICIAL);
      fecharModalSolicitacao();
      setSucesso("Solicitação enviada com sucesso");
      await carregarLista({ page: 1, append: false, status: filtroStatus });
    } catch (errorCreate) {
      setErro(errorCreate.message || "Erro ao criar solicitação");
    } finally {
      setSalvando(false);
    }
  };

  const handleAtualizarStatus = async (id, status) => {
    setErro("");
    setSucesso("");
    try {
      const atualizado = await updateEventRequestStatus(id, status);
      setLista((atual) => atual.map((item) => (item.id === id ? atualizado : item)));
      setSucesso(`Solicitação marcada como ${rotuloStatus(status).toLowerCase()}.`);
    } catch (errorUpdate) {
      setErro(errorUpdate.message || "Erro ao atualizar status");
    }
  };

  const handleExcluir = async () => {
    if (!solicitacaoParaExcluir) return;
    setErro("");
    setSucesso("");
    setExcluindo(true);
    try {
      await deleteEventRequest(solicitacaoParaExcluir.id);
      setLista((atual) => atual.filter((item) => item.id !== solicitacaoParaExcluir.id));
      setSucesso("Solicitação removida com sucesso");
      fecharModalExclusao(true);
    } catch (errorDelete) {
      setErro(errorDelete.message || "Erro ao excluir solicitação");
    } finally {
      setExcluindo(false);
    }
  };

  const abrirModalSolicitacao = () => {
    if (modalCloseTimerRef.current) {
      clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setModalAberto(true);
    requestAnimationFrame(() => setModalVisivel(true));
  };

  const fecharModalSolicitacao = () => {
    if (salvando) return;
    setModalVisivel(false);
    modalCloseTimerRef.current = setTimeout(() => {
      setModalAberto(false);
      modalCloseTimerRef.current = null;
    }, 200);
  };

  const abrirModalExclusao = (item) => {
    if (modalExclusaoCloseTimerRef.current) {
      clearTimeout(modalExclusaoCloseTimerRef.current);
      modalExclusaoCloseTimerRef.current = null;
    }
    setSolicitacaoParaExcluir(item);
    setModalExclusaoAberto(true);
    requestAnimationFrame(() => setModalExclusaoVisivel(true));
  };

  const fecharModalExclusao = (forcar = false) => {
    if (excluindo && !forcar) return;
    setModalExclusaoVisivel(false);
    modalExclusaoCloseTimerRef.current = setTimeout(() => {
      setModalExclusaoAberto(false);
      setSolicitacaoParaExcluir(null);
      modalExclusaoCloseTimerRef.current = null;
    }, 200);
  };

  if (carregandoUsuario) {
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
        <main className="max-w-7xl mx-auto px-4 py-8 pt-16 md:pt-8">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-blue-900">Solicitações de inclusão no QTS</h1>
              <p className="text-sm text-gray-600">
                {canReviewRequests
                  ? "Você visualiza as solicitações da sua OM e pode aprovar ou negar."
                  : "Você visualiza apenas suas solicitações."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setErro("");
                setSucesso("");
                abrirModalSolicitacao();
              }}
              className="btn-primary inline-flex items-center justify-center gap-2 md:min-w-52"
            >
              <CalendarPlus className="h-4 w-4" />
              Nova solicitação
            </button>
          </div>

            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-2 text-slate-700 text-sm font-medium">
                <Filter className="h-4 w-4" />
                Filtrar por status
              </div>
              <div className="relative w-full sm:w-64">
                <select
                  className="input-field w-full pr-9 appearance-none"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {erro && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {erro}
            </div>
          )}

          {sucesso && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
              {sucesso}
            </div>
          )}

          <div>
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-blue-900">Lista de solicitações</h2>
                <span className="text-xs md:text-sm text-slate-500">Rolagem infinita ativa</span>
              </div>

              {carregandoLista ? (
                <div className="py-10 text-center text-gray-500">Carregando solicitações...</div>
              ) : lista.length === 0 ? (
                <div className="py-10 text-center text-gray-500">Nenhuma solicitação encontrada.</div>
              ) : (
                <div className="space-y-3">
                  {lista.map((item) => {
                    const podeExcluir = isEditor || item.requestedBy?.id === usuario?.id;

                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-slate-50 to-white"
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900">{item.title}</h3>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeStatus(item.status)}`}>
                                {rotuloStatus(item.status)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mb-1">
                              <Clock3 className="inline h-4 w-4 mr-1" />
                              {formatarData(item.eventDate)} - {item.startTime}
                              {item.endTime ? ` às ${item.endTime}` : ""}
                            </p>
                            <p className="text-sm text-gray-700 mb-1">
                              <span className="font-medium">Uniformes:</span>{" "}
                              {(item.uniforms || []).map((u) => u.uniform).join(", ") || "-"}
                            </p>
                            {item.information && (
                              <p className="text-sm text-gray-700 mb-1">{item.information}</p>
                            )}
                            {(item.location || item.responsible) && (
                              <p className="text-sm text-gray-700 mb-1">
                                {item.location ? `Local: ${item.location}` : ""}
                                {item.location && item.responsible ? " | " : ""}
                                {item.responsible ? `Responsável: ${item.responsible}` : ""}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-2">
                              Solicitante: {item.requestedBy?.warName || item.requestedBy?.name || "-"}
                              {item.reviewedBy
                                ? ` | Revisado por: ${item.reviewedBy.warName || item.reviewedBy.name}`
                                : ""}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 md:justify-end">
                            {canReviewRequests && item.status !== "aceito" && (
                              <button
                                type="button"
                                onClick={() => handleAtualizarStatus(item.id, "aceito")}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                              >
                                <Check className="h-4 w-4" />
                                Aceitar
                              </button>
                            )}
                            {canReviewRequests && item.status === "pendente" && (
                              <button
                                type="button"
                                onClick={() => handleAtualizarStatus(item.id, "negado")}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700"
                              >
                                <X className="h-4 w-4" />
                                Negar
                              </button>
                            )}
                            {canReviewRequests && item.status === "negado" && (
                              <button
                                type="button"
                                onClick={() => handleAtualizarStatus(item.id, "pendente")}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600"
                              >
                                <ShieldCheck className="h-4 w-4" />
                                Voltar pendente
                              </button>
                            )}
                            {podeExcluir && (
                              <button
                                type="button"
                                onClick={() => abrirModalExclusao(item)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm hover:bg-gray-300"
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {hasMore && <div ref={loadMoreRef} className="h-2" />}

              {carregandoMais && (
                <div className="mt-4 text-center text-sm text-slate-500">Carregando mais solicitações...</div>
              )}
            </section>
          </div>
        </main>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              modalVisivel ? "opacity-100" : "opacity-0"
            }`}
            onClick={salvando ? undefined : fecharModalSolicitacao}
          />

          <div
            className={`relative z-10 w-full max-w-2xl max-h-[92vh] overflow-auto rounded-xl bg-white shadow-2xl border border-gray-200 transition-all duration-200 ${
              modalVisivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-semibold text-blue-900">Nova solicitação</h2>
              </div>
              <button
                type="button"
                onClick={fecharModalSolicitacao}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
                disabled={salvando}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <label className="block">
                <span className="text-sm text-gray-700">Data</span>
                <input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((atual) => ({ ...atual, eventDate: e.target.value }))}
                  className="input-field mt-1"
                  required
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-gray-700">Início</span>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((atual) => ({ ...atual, startTime: e.target.value }))}
                    className="input-field mt-1"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-700">Fim (opcional)</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((atual) => ({ ...atual, endTime: e.target.value }))}
                    className="input-field mt-1"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm text-gray-700">Evento *</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((atual) => ({ ...atual, title: e.target.value }))}
                  className="input-field mt-1"
                  placeholder="Ex.: Formatura geral"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Participantes *</span>
                <input
                  type="text"
                  value={form.information}
                  onChange={(e) => setForm((atual) => ({ ...atual, information: e.target.value }))}
                  className="input-field mt-1"
                  placeholder="Ex.: Todo o efetivo"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Local *</span>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((atual) => ({ ...atual, location: e.target.value }))}
                  className="input-field mt-1"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Responsável *</span>
                <input
                  type="text"
                  value={form.responsible}
                  onChange={(e) => setForm((atual) => ({ ...atual, responsible: e.target.value }))}
                  className="input-field mt-1"
                  required
                />
              </label>

              <div>
                <span className="text-sm text-gray-700 block mb-2">Uniformes</span>
                <p className="mb-2 text-xs text-gray-500">Ordenados pelo mais utilizado</p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {uniformesOrdenados.length === 0 ? (
                    <p className="p-3 text-sm text-gray-500">Nenhum uniforme cadastrado.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {uniformesOrdenados.map((uniforme) => {
                        const marcado = form.uniformIds.includes(uniforme.id);
                        return (
                          <li key={uniforme.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => alternarUniforme(uniforme.id)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900"
                              />
                              <span className="text-sm font-medium text-gray-900">
                                {uniforme.uniform}
                              </span>
                              {uniforme.description && (
                                <span className="truncate text-xs text-gray-500">
                                  {uniforme.description}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {form.uniformIds.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {form.uniformIds.length} selecionado(s)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={fecharModalSolicitacao}
                  className="btn-secondary"
                  disabled={salvando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="btn-primary disabled:opacity-60"
                >
                  {salvando ? "Enviando..." : "Enviar solicitação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        aberto={modalExclusaoAberto}
        visivel={modalExclusaoVisivel}
        titulo="Excluir solicitação"
        descricao={
          solicitacaoParaExcluir
            ? `Tem certeza que deseja excluir a solicitação \"${solicitacaoParaExcluir.title}\"?`
            : "Tem certeza que deseja excluir esta solicitação?"
        }
        confirmarTexto="Excluir solicitação"
        confirmando={excluindo}
        onCancelar={() => fecharModalExclusao()}
        onConfirmar={handleExcluir}
      />
    </div>
  );
}
