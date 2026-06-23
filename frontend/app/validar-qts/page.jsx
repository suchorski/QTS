"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  ShieldAlert,
  Eye,
  X,
  CheckCircle2,
  FileText,
  Clock,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import QtsDocument from "../components/QtsDocument";
import { getMe, getQtsList, getQts, updateQtsStatus } from "../lib/api";

const STATUS_INFO = {
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
};

function StatusBadge({ status }) {
  const info = STATUS_INFO[status] || STATUS_INFO.minuta;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${info.className}`}
    >
      {info.label}
    </span>
  );
}

export default function ValidarQtsPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [minutas, setMinutas] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [modalRegistro, setModalRegistro] = useState(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [carregandoModal, setCarregandoModal] = useState(false);
  const [validandoId, setValidandoId] = useState(null);

  const ehValidador = usuario?.roles?.some((r) => r.code === "validador");

  const carregarMinutas = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const resposta = await getQtsList({ page: 1, limit: 50, status: "minuta" });
      setMinutas(resposta.data || []);
    } catch (error) {
      setErro(error.message || "Erro ao carregar as minutas");
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
        if (dados?.roles?.some((r) => r.code === "validador")) {
          await carregarMinutas();
        }
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [router, carregarMinutas]);

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

  const validar = async (registro) => {
    setErro("");
    setSucesso("");
    setValidandoId(registro.id);
    try {
      await updateQtsStatus(registro.id, "validado");
      setSucesso(`QTS de ${registro.dateLabel} validado com sucesso.`);
      if (modalRegistro?.resumo?.id === registro.id) {
        fecharVisualizacao();
      }
      await carregarMinutas();
    } catch (error) {
      setErro(error.message || "Erro ao validar o QTS");
    } finally {
      setValidandoId(null);
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
          {!ehValidador ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Restrição de Acesso
              </h1>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Esta tela é exclusiva para usuários com o perfil{" "}
                <strong>Validador</strong>. Seu perfil atual não possui
                permissão para validar o Quadro de Trabalho Semanal.
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
                    <ClipboardCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-blue-900">
                      Validar QTS
                    </h1>
                    <p className="text-sm text-gray-600">
                      Minutas pendentes de validação da{" "}
                      {usuario?.militaryOrganization?.acronym || "sua OM"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={carregarMinutas}
                  disabled={carregandoLista}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-900 disabled:opacity-60"
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${carregandoLista ? "animate-spin" : ""}`}
                  />
                  Atualizar
                </button>
              </div>

              {erro && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}
              {sucesso && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {sucesso}
                </div>
              )}

              {/* Lista de minutas */}
              <div className="card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-blue-900">
                    Minutas em aberto
                  </h2>
                  <span className="text-sm text-gray-500">
                    {minutas.length} registro{minutas.length === 1 ? "" : "s"}
                  </span>
                </div>

                {carregandoLista ? (
                  <p className="py-8 text-center text-gray-500">Carregando...</p>
                ) : minutas.length === 0 ? (
                  <div className="py-10 text-center">
                    <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-500">
                      Nenhuma minuta pendente de validação no momento.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {minutas.map((registro) => (
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
                          {registro.createdBy?.name && (
                            <div className="mt-1 text-xs text-gray-500">
                              Gerado por{" "}
                              {registro.createdBy.rank
                                ? `${registro.createdBy.rank} `
                                : ""}
                              {registro.createdBy.warName ||
                                registro.createdBy.name}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => abrirVisualizacao(registro)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                            Visualizar
                          </button>
                          <button
                            onClick={() => validar(registro)}
                            disabled={validandoId === registro.id}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                            title="Validar"
                          >
                            {validandoId === registro.id ? (
                              <RefreshCcw className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            {validandoId === registro.id
                              ? "Validando..."
                              : "Validar"}
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-900" />
                <h3 className="font-semibold text-blue-900">
                  {modalRegistro.resumo?.dateLabel}
                </h3>
                <StatusBadge status={modalRegistro.resumo?.status} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => validar(modalRegistro.resumo)}
                  disabled={validandoId === modalRegistro.resumo?.id}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  {validandoId === modalRegistro.resumo?.id ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {validandoId === modalRegistro.resumo?.id
                    ? "Validando..."
                    : "Validar"}
                </button>
                <button
                  onClick={fecharVisualizacao}
                  className="rounded-full p-1 text-gray-600 hover:bg-gray-100"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
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
    </div>
  );
}
