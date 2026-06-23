"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Pencil, Trash2, ShieldAlert, X, Check } from "lucide-react";
import {
  getMe,
  getUniforms,
  createUniform,
  updateUniform,
  deleteUniform,
} from "../lib/api";
import { buildUniformSortKey } from "../lib/uniformSort";
import Sidebar from "../components/Sidebar";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const FORM_VAZIO = { id: null, uniform: "", description: "" };
const CONFIRMACAO_VAZIA = {
  aberto: false,
  visivel: false,
  uniform: null,
  rotulo: "",
};

export default function UniformsPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [uniforms, setUniforms] = useState([]);
  const [carregandoUniforms, setCarregandoUniforms] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [form, setForm] = useState(FORM_VAZIO);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(CONFIRMACAO_VAZIA);
  const [excluindoId, setExcluindoId] = useState(null);
  const modalCloseTimerRef = useRef(null);
  const confirmCloseTimerRef = useRef(null);

  const ehAdminGlobal = usuario?.roles?.some((r) => r.code === "admin_global");

  useEffect(() => {
    const carregarUsuario = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }
        const dados = await getMe();
        setUsuario(dados);
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };
    carregarUsuario();

    return () => {
      if (modalCloseTimerRef.current) {
        clearTimeout(modalCloseTimerRef.current);
      }
      if (confirmCloseTimerRef.current) {
        clearTimeout(confirmCloseTimerRef.current);
      }
    };
  }, [router]);

  const carregarUniforms = async (termo = "") => {
    setCarregandoUniforms(true);
    setErro("");
    try {
      const resposta = await getUniforms(termo);
      const ordenados = [...(resposta.data || [])].sort((a, b) => {
        const keyA = buildUniformSortKey(a.uniform);
        const keyB = buildUniformSortKey(b.uniform);
        return keyA.localeCompare(keyB, "pt-BR", { sensitivity: "base" });
      });
      setUniforms(ordenados);
    } catch (error) {
      setErro(error.message || "Erro ao carregar uniformes");
    } finally {
      setCarregandoUniforms(false);
    }
  };

  useEffect(() => {
    if (!ehAdminGlobal) return;
    const id = setTimeout(() => carregarUniforms(filtro), 300);
    return () => clearTimeout(id);
  }, [filtro, ehAdminGlobal]);

  const abrirNovo = () => {
    if (modalCloseTimerRef.current) {
      clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setForm(FORM_VAZIO);
    setErro("");
    setModalAberto(true);
    requestAnimationFrame(() => setModalVisivel(true));
  };

  const abrirEdicao = (uniform) => {
    if (modalCloseTimerRef.current) {
      clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setForm({
      id: uniform.id,
      uniform: uniform.uniform,
      description: uniform.description || "",
    });
    setErro("");
    setModalAberto(true);
    requestAnimationFrame(() => setModalVisivel(true));
  };

  const fecharModal = () => {
    setModalVisivel(false);
    modalCloseTimerRef.current = setTimeout(() => {
      setModalAberto(false);
      setForm(FORM_VAZIO);
      modalCloseTimerRef.current = null;
    }, 200);
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const payload = {
        uniform: form.uniform.trim(),
        description: form.description.trim() || null,
      };
      if (form.id) {
        await updateUniform(form.id, payload);
        setSucesso("Uniforme atualizado com sucesso");
      } else {
        await createUniform(payload);
        setSucesso("Uniforme criado com sucesso");
      }
      fecharModal();
      await carregarUniforms(filtro);
    } catch (error) {
      setErro(error.message || "Erro ao salvar uniforme");
    } finally {
      setSalvando(false);
    }
  };

  const abrirConfirmacaoExclusao = (uniform) => {
    if (confirmCloseTimerRef.current) {
      clearTimeout(confirmCloseTimerRef.current);
      confirmCloseTimerRef.current = null;
    }
    setConfirmacao({
      aberto: true,
      visivel: false,
      uniform,
      rotulo: uniform.uniform,
    });
    requestAnimationFrame(() => {
      setConfirmacao((atual) => ({ ...atual, visivel: true }));
    });
  };

  const fecharConfirmacaoExclusao = () => {
    setConfirmacao((atual) => ({ ...atual, visivel: false }));
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmacao(CONFIRMACAO_VAZIA);
      confirmCloseTimerRef.current = null;
    }, 200);
  };

  const confirmarExclusao = async () => {
    if (!confirmacao.uniform) return;
    setErro("");
    setSucesso("");
    setExcluindoId(confirmacao.uniform.id);
    try {
      await deleteUniform(confirmacao.uniform.id);
      setSucesso("Uniforme excluído com sucesso");
      fecharConfirmacaoExclusao();
      await carregarUniforms(filtro);
    } catch (error) {
      setErro(error.message || "Erro ao excluir uniforme");
    } finally {
      setExcluindoId(null);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-slate-900">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <Sidebar usuario={usuario} />

      <div className="md:pl-64">
        <main className="mx-auto max-w-5xl px-4 py-8 pt-16 md:pt-8">
          {!ehAdminGlobal ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Restrição de Acesso
              </h1>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Esta tela é exclusiva para usuários com o perfil{" "}
                <strong>Administrador Global</strong>. Seu perfil atual não
                possui permissão para gerenciar uniformes.
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
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-blue-900">Uniformes</h1>
                  <p className="text-sm text-gray-600">
                    Gerencie os uniformes disponíveis no sistema
                  </p>
                </div>
                <button
                  onClick={abrirNovo}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  Novo
                </button>
              </div>

              {erro && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  {erro}
                </div>
              )}
              {sucesso && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                  {sucesso}
                </div>
              )}

              <div className="card mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Buscar (uniforme ou descrição)
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Digite para filtrar..."
                    className="w-full py-2 pr-4 pl-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
              </div>

              <div className="card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 px-4 text-left font-semibold text-gray-700">
                          Uniforme
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-gray-700">
                          Descrição
                        </th>
                        <th className="py-3 px-4 text-right font-semibold text-gray-700">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {carregandoUniforms ? (
                        <tr>
                        <td colSpan={3} className="py-8 text-center text-gray-500">
                          Carregando...
                        </td>
                      </tr>
                      ) : uniforms.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-gray-500">
                            Nenhum uniforme encontrado.
                          </td>
                        </tr>
                      ) : (
                        uniforms.map((uniform) => (
                          <tr
                            key={uniform.id}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="py-3 px-4 font-semibold text-gray-900">
                              {uniform.uniform}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {uniform.description || "-"}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => abrirEdicao(uniform)}
                                  className="rounded-lg p-2 text-blue-700 transition-colors hover:bg-blue-50"
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => abrirConfirmacaoExclusao(uniform)}
                                  disabled={excluindoId === uniform.id}
                                  className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal de criação/edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              modalVisivel ? "opacity-100" : "opacity-0"
            }`}
            onClick={fecharModal}
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-all duration-200 ${
              modalVisivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-blue-900">
                {form.id ? "Editar Uniforme" : "Novo Uniforme"}
              </h2>
              <button
                onClick={fecharModal}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {erro && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {erro}
              </div>
            )}

            <form onSubmit={salvar} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Uniforme <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.uniform}
                  onChange={(e) =>
                    setForm({ ...form, uniform: e.target.value })
                  }
                  placeholder="Ex.: 4º A"
                  className="input-field"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Descrição
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ex.: Rigor"
                  className="input-field"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="btn-secondary"
                  disabled={salvando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={salvando}
                >
                  <Check className="h-4 w-4" />
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        aberto={confirmacao.aberto}
        visivel={confirmacao.visivel}
        titulo="Excluir uniforme"
        descricao={`Tem certeza que deseja excluir "${confirmacao.rotulo}"? Esta ação não pode ser desfeita.`}
        confirmando={Boolean(confirmacao.uniform && excluindoId === confirmacao.uniform.id)}
        onCancelar={fecharConfirmacaoExclusao}
        onConfirmar={confirmarExclusao}
      />
    </div>
  );
}
