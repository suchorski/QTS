"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Eye,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  Printer,
  Share2,
  Link2,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import QtsDocument from "../components/QtsDocument";
import ConfirmInvalidateModal from "../components/ConfirmInvalidateModal";
import { useToast } from "../hooks/useToast";
import {
  getMe,
  getQtsApprovedList,
  getQtsApproved,
  updateQtsStatus,
} from "../lib/api";

function StatusBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-green-800 ring-1 ring-green-200">
      Aprovado
    </span>
  );
}

export default function QtsAprovadosPage() {
  const router = useRouter();
  const { sucesso: showSucesso, erro: showErro } = useToast();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [aprovados, setAprovados] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [modalRegistro, setModalRegistro] = useState(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [carregandoModal, setCarregandoModal] = useState(false);
  const [invalidandoId, setInvalidandoId] = useState(null);
  const [confirmacaoInvalidacao, setConfirmacaoInvalidacao] = useState({
    aberto: false,
    visivel: false,
    registro: null,
  });

  const omSegment = String(usuario?.militaryOrganization?.acronym || "")
    .trim()
    .replace(/\s+/g, "-");

  const podeInvalidarQts = usuario?.roles?.some(
    (role) => role.code === "invalidar_qts"
  );

  const linkAtual =
    omSegment && typeof window !== "undefined"
      ? `${window.location.origin}/${encodeURIComponent(omSegment)}/atual`
      : "";
  const linkProximo =
    omSegment && typeof window !== "undefined"
      ? `${window.location.origin}/${encodeURIComponent(omSegment)}/proximo`
      : "";

  const carregarAprovados = useCallback(async (pagina = 1) => {
    setCarregandoLista(true);
    try {
      const resposta = await getQtsApprovedList({ page: pagina, limit: 20 });
      setAprovados(resposta.data || []);
      setPage(resposta.page || pagina);
      setTotal(resposta.total || 0);
      setHasMore(Boolean(resposta.hasMore));
    } catch (error) {
      showErro(error.message || "Erro ao carregar os QTS aprovados");
    } finally {
      setCarregandoLista(false);
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
        await carregarAprovados(1);
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [router, carregarAprovados]);

  const abrirVisualizacao = async (registro) => {
    setCarregandoModal(true);
    setModalRegistro({ resumo: registro, completo: null });
    requestAnimationFrame(() => setModalVisivel(true));
    try {
      const completo = await getQtsApproved(registro.id);
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

  const abrirConfirmacaoInvalidacao = (registro) => {
    setConfirmacaoInvalidacao({ aberto: true, visivel: false, registro });
    requestAnimationFrame(() =>
      setConfirmacaoInvalidacao((atual) => ({ ...atual, visivel: true }))
    );
  };

  const fecharConfirmacaoInvalidacao = () => {
    setConfirmacaoInvalidacao((atual) => ({ ...atual, visivel: false }));
    setTimeout(
      () => setConfirmacaoInvalidacao({ aberto: false, visivel: false, registro: null }),
      200
    );
  };

  const invalidarQts = async () => {
    if (!confirmacaoInvalidacao.registro) {
      return;
    }

    const registro = confirmacaoInvalidacao.registro;
    setInvalidandoId(registro.id);

    try {
      await updateQtsStatus(registro.id, "invalidado");
      showSucesso(`QTS de ${registro.dateLabel} invalidado com sucesso.`);
      if (modalRegistro?.resumo?.id === registro.id) {
        fecharVisualizacao();
      }
      fecharConfirmacaoInvalidacao();
      await carregarAprovados(page);
    } catch (error) {
      showErro(error.message || "Erro ao invalidar o QTS");
    } finally {
      setInvalidandoId(null);
    }
  };

  const imprimirRegistro = (registro) => {
    const url = `/qts-impressao?tipo=aprovados&id=${encodeURIComponent(registro.id)}`;
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
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-white shadow-md">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-blue-900">QTS Aprovados</h1>
                <p className="text-sm text-gray-600">
                  Aprovados dos últimos 3 meses da {usuario?.militaryOrganization?.acronym || "sua OM"}
                </p>
              </div>
            </div>
            <button
              onClick={() => carregarAprovados(page)}
              disabled={carregandoLista}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-900 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${carregandoLista ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <a
              href={linkAtual || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-left transition-colors ${
                linkAtual
                  ? "border-blue-200 bg-blue-100/80 text-blue-950 hover:bg-blue-200/70"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
              }`}
              onClick={(event) => {
                if (!linkAtual) event.preventDefault();
              }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                <Link2 className="h-4 w-4" />
                QTS Atual
              </span>
            </a>

            <a
              href={linkProximo || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-left transition-colors ${
                linkProximo
                  ? "border-blue-200 bg-blue-100/80 text-blue-950 hover:bg-blue-200/70"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
              }`}
              onClick={(event) => {
                if (!linkProximo) event.preventDefault();
              }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                <Link2 className="h-4 w-4" />
                Próximo QTS
              </span>
            </a>
          </div>

          <div className="card">

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-blue-900">QTS aprovados recentes</h2>
              <span className="text-sm text-gray-500">
                {total} registro{total === 1 ? "" : "s"}
              </span>
            </div>

            {carregandoLista ? (
              <p className="py-8 text-center text-gray-500">Carregando...</p>
            ) : aprovados.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-gray-500">Nenhum QTS aprovado recente encontrado.</p>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {aprovados.map((registro) => (
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
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {podeInvalidarQts && (
                          <button
                            onClick={() => abrirConfirmacaoInvalidacao(registro)}
                            disabled={invalidandoId === registro.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-800 disabled:opacity-50"
                            title="Invalidar"
                            aria-label="Invalidar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
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
                    onClick={() => carregarAprovados(page - 1)}
                    disabled={page <= 1 || carregandoLista}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-900 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </button>
                  <span className="text-gray-500">Página {page}</span>
                  <button
                    onClick={() => carregarAprovados(page + 1)}
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
                <h3 className="text-lg font-semibold text-blue-900">Visualizar QTS aprovado</h3>
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

      <ConfirmInvalidateModal
        aberto={confirmacaoInvalidacao.aberto}
        visivel={confirmacaoInvalidacao.visivel}
        titulo="Invalidar QTS"
        descricao={
          confirmacaoInvalidacao.registro
            ? `Tem certeza que deseja invalidar o QTS de ${confirmacaoInvalidacao.registro.dateLabel}? Ele deixará de aparecer como aprovado e um novo QTS poderá ser validado para este período.`
            : ""
        }
        confirmarTexto="Invalidar"
        confirmando={Boolean(invalidandoId)}
        onConfirmar={invalidarQts}
        onCancelar={fecharConfirmacaoInvalidacao}
      />
    </div>
  );
}