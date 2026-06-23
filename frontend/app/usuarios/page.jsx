"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ShieldAlert,
  Pencil,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Signature,
  Upload,
  Trash2,
  RefreshCcw,
  Save,
  UserPlus,
} from "lucide-react";
import {
  getMe,
  getUsers,
  getRoles,
  updateUserRoles,
  getUserFieldOptions,
  uploadUserSignature,
  deleteUserSignature,
  updateUserSignaturePosition,
  importUserByCpf,
} from "../lib/api";
import { useToast } from "../hooks/useToast";
import Sidebar from "../components/Sidebar";
import {
  SIGNATURE_SCALE_DEFAULT,
  clampScale,
  removeBackgroundAndNormalize,
} from "../lib/signatureProcessing";
import SignatureCropModal from "../components/SignatureCropModal";
import SignatureCanvasPreview from "../components/SignatureCanvasPreview";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const LIMITE = 10;

function formatarCpf(cpf) {
  const digitos = String(cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11) return cpf || "-";
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export default function UsuariosPage() {
  const router = useRouter();
  const { sucesso: showSucesso } = useToast();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  

  const [usuarios, setUsuarios] = useState([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [omFiltro, setOmFiltro] = useState("");
  const [filtroDebounced, setFiltroDebounced] = useState("");
  const [omFiltroDebounced, setOmFiltroDebounced] = useState("");

  const [roles, setRoles] = useState([]);
  const [modalUsuario, setModalUsuario] = useState(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [rolesSelecionadas, setRolesSelecionadas] = useState(new Set());
  const [positionEdit, setPositionEdit] = useState("");
  const [corpsEdit, setCorpsEdit] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");
  const modalCloseTimerRef = useRef(null);

  // Modal de assinatura
  const [assinaturaUsuario, setAssinaturaUsuario] = useState(null);
  const [assinaturaVisivel, setAssinaturaVisivel] = useState(false);
  const [assinaturaSalvaUrl, setAssinaturaSalvaUrl] = useState("");
  const [assinaturaPreview, setAssinaturaPreview] = useState("");
  const [assinaturaBlob, setAssinaturaBlob] = useState(null);
  const [assinaturaOffset, setAssinaturaOffset] = useState(0);
  const [assinaturaOffsetSalvo, setAssinaturaOffsetSalvo] = useState(0);
  const [assinaturaScale, setAssinaturaScale] = useState(SIGNATURE_SCALE_DEFAULT);
  const [assinaturaScaleSalva, setAssinaturaScaleSalva] = useState(SIGNATURE_SCALE_DEFAULT);
  const [arquivoCrop, setArquivoCrop] = useState(null);
  const [processandoAssinatura, setProcessandoAssinatura] = useState(false);
  const [salvandoAssinatura, setSalvandoAssinatura] = useState(false);
  const [erroAssinatura, setErroAssinatura] = useState("");
  const assinaturaCloseTimerRef = useRef(null);
  const assinaturaFileRef = useRef(null);

  const [positionOptions, setPositionOptions] = useState([]);
  const [corpsOptions, setCorpsOptions] = useState([]);

  // Modal importar por CPF
  const [importModalVisivel, setImportModalVisivel] = useState(false);
  const [importModalAberto, setImportModalAberto] = useState(false);
  const [importCpf, setImportCpf] = useState("");
  const [importando, setImportando] = useState(false);
  const [erroImport, setErroImport] = useState("");
  const importCloseTimerRef = useRef(null);

  const ehAdminGlobal = usuario?.roles?.some((r) => r.code === "admin_global");
  const ehAdminLocal = usuario?.roles?.some((r) => r.code === "admin_local");
  const temAcesso = ehAdminGlobal || ehAdminLocal;

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
      if (assinaturaCloseTimerRef.current) {
        clearTimeout(assinaturaCloseTimerRef.current);
      }
      if (importCloseTimerRef.current) {
        clearTimeout(importCloseTimerRef.current);
      }
    };
  }, [router]);

  const carregarUsuarios = useCallback(
    async (paginaAtual, termo, om) => {
      setCarregandoUsuarios(true);
      setErro("");
      try {
        const resposta = await getUsers(
          paginaAtual,
          LIMITE,
          termo,
          ehAdminGlobal ? om : ""
        );
        setUsuarios(resposta.data || []);
        setTotalPaginas(resposta.totalPages || 1);
        setTotal(resposta.total || 0);
      } catch (error) {
        setErro(error.message || "Erro ao carregar usuários");
      } finally {
        setCarregandoUsuarios(false);
      }
    },
    [ehAdminGlobal]
  );

  // Carregar perfis disponíveis uma vez
  useEffect(() => {
    if (!temAcesso) return;
    getRoles()
      .then((resposta) => setRoles(resposta.data || []))
      .catch(() => {});
  }, [temAcesso]);

  useEffect(() => {
    if (!temAcesso) return;
    getUserFieldOptions()
      .then((resposta) => {
        setPositionOptions(Array.isArray(resposta?.positions) ? resposta.positions : []);
        setCorpsOptions(Array.isArray(resposta?.corps) ? resposta.corps : []);
      })
      .catch(() => {});
  }, [temAcesso]);

  // Reset de página ao alterar filtros
  useEffect(() => {
    setPagina(1);
  }, [filtro, omFiltro]);

  // Debounce dos filtros de busca
  useEffect(() => {
    const id = setTimeout(() => {
      setFiltroDebounced(filtro);
      setOmFiltroDebounced(omFiltro);
    }, 300);

    return () => clearTimeout(id);
  }, [filtro, omFiltro]);

  // Busca com debounce
  useEffect(() => {
    if (!temAcesso) return;
    carregarUsuarios(pagina, filtroDebounced, omFiltroDebounced);
  }, [temAcesso, pagina, filtroDebounced, omFiltroDebounced, carregarUsuarios]);

  const abrirImport = () => {
    if (importCloseTimerRef.current) {
      clearTimeout(importCloseTimerRef.current);
      importCloseTimerRef.current = null;
    }
    setImportCpf("");
    setErroImport("");
    setImportModalVisivel(true);
    requestAnimationFrame(() => setImportModalAberto(true));
  };

  const fecharImport = () => {
    setImportModalAberto(false);
    importCloseTimerRef.current = setTimeout(() => {
      setImportModalVisivel(false);
      setImportCpf("");
      setErroImport("");
      importCloseTimerRef.current = null;
    }, 200);
  };

  const confirmarImport = async (e) => {
    e.preventDefault();
    setImportando(true);
    setErroImport("");
    try {
      const usuarioImportado = await importUserByCpf(importCpf);
      setUsuarios((lista) => {
        const existe = lista.some((u) => u.id === usuarioImportado.id);
        if (existe) {
          return lista.map((u) => (u.id === usuarioImportado.id ? usuarioImportado : u));
        }
        return [usuarioImportado, ...lista];
      });
      showSucesso(
        `Usuário ${usuarioImportado.warName || usuarioImportado.name} importado com sucesso`
      );
      fecharImport();
    } catch (error) {
      setErroImport(error.message || "Erro ao importar usuário");
    } finally {
      setImportando(false);
    }
  };

  const abrirEdicao = (alvo) => {
    if (modalCloseTimerRef.current) {
      clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setModalUsuario(alvo);
    setRolesSelecionadas(new Set((alvo.roles || []).map((r) => r.id)));
    setPositionEdit(alvo.position || "");
    setCorpsEdit(alvo.corps || "");
    setErroModal("");
    requestAnimationFrame(() => setModalVisivel(true));
  };

  const fecharEdicao = () => {
    setModalVisivel(false);
    modalCloseTimerRef.current = setTimeout(() => {
      setModalUsuario(null);
      setRolesSelecionadas(new Set());
      setPositionEdit("");
      setCorpsEdit("");
      setErroModal("");
      modalCloseTimerRef.current = null;
    }, 200);
  };

  const alternarRole = (role) => {
    // Admin local não pode conceder/remover o perfil Admin Global
    if (role.code === "admin_global" && !ehAdminGlobal) return;
    setRolesSelecionadas((anterior) => {
      const proxima = new Set(anterior);
      if (proxima.has(role.id)) {
        proxima.delete(role.id);
      } else {
        proxima.add(role.id);
      }
      return proxima;
    });
  };

  const salvarPerfis = async (e) => {
    e.preventDefault();
    if (!modalUsuario) return;
    setSalvando(true);
    setErroModal("");
    // toast cleared
    try {
      const atualizado = await updateUserRoles(modalUsuario.id, [
        ...rolesSelecionadas,
      ], {
        position: positionEdit,
        corps: corpsEdit,
      });
      setUsuarios((lista) =>
        lista.map((u) => (u.id === atualizado.id ? atualizado : u))
      );
      showSucesso("Perfis atualizados com sucesso");
      fecharEdicao();
    } catch (error) {
      setErroModal(error.message || "Erro ao salvar perfis");
    } finally {
      setSalvando(false);
    }
  };

  const abrirAssinatura = (alvo) => {
    if (assinaturaCloseTimerRef.current) {
      clearTimeout(assinaturaCloseTimerRef.current);
      assinaturaCloseTimerRef.current = null;
    }
    if (assinaturaPreview) {
      URL.revokeObjectURL(assinaturaPreview);
    }
    setAssinaturaUsuario(alvo);
    setAssinaturaSalvaUrl(
      alvo.signatureUrl
        ? `${API_BASE}${alvo.signatureUrl}?v=${
            alvo.updatedAt ? new Date(alvo.updatedAt).getTime() : Date.now()
          }`
        : ""
    );
    setAssinaturaPreview("");
    setAssinaturaBlob(null);
    setAssinaturaOffset(alvo.signatureOffset ?? 0);
    setAssinaturaOffsetSalvo(alvo.signatureOffset ?? 0);
    setAssinaturaScale(clampScale(alvo.signatureScale ?? SIGNATURE_SCALE_DEFAULT));
    setAssinaturaScaleSalva(clampScale(alvo.signatureScale ?? SIGNATURE_SCALE_DEFAULT));
    setErroAssinatura("");
    if (assinaturaFileRef.current) {
      assinaturaFileRef.current.value = "";
    }
    requestAnimationFrame(() => setAssinaturaVisivel(true));
  };

  const fecharAssinatura = () => {
    setAssinaturaVisivel(false);
    assinaturaCloseTimerRef.current = setTimeout(() => {
      if (assinaturaPreview) {
        URL.revokeObjectURL(assinaturaPreview);
      }
      setAssinaturaUsuario(null);
      setAssinaturaSalvaUrl("");
      setAssinaturaPreview("");
      setAssinaturaBlob(null);
      setAssinaturaOffset(0);
      setAssinaturaOffsetSalvo(0);
      setAssinaturaScale(SIGNATURE_SCALE_DEFAULT);
      setAssinaturaScaleSalva(SIGNATURE_SCALE_DEFAULT);
      setArquivoCrop(null);
      setErroAssinatura("");
      assinaturaCloseTimerRef.current = null;
    }, 200);
  };

  const aoSelecionarAssinatura = (event) => {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)) {
      setErroAssinatura("Envie uma imagem PNG, JPG ou WebP da assinatura");
      return;
    }

    setErroAssinatura("");
    setArquivoCrop(arquivo);
  };

  const aoConfirmarCrop = async (blobRecortado) => {
    setErroAssinatura("");
    setProcessandoAssinatura(true);

    try {
      // Após o recorte: remove o fundo e normaliza para 150px de altura.
      const processado = await removeBackgroundAndNormalize(blobRecortado, {
        publicPath: `${window.location.origin}/imgly/`,
      });

      if (assinaturaPreview) {
        URL.revokeObjectURL(assinaturaPreview);
      }
      setAssinaturaBlob(processado);
      setAssinaturaPreview(URL.createObjectURL(processado));
      setAssinaturaOffset(0);
      setAssinaturaScale(SIGNATURE_SCALE_DEFAULT);
      setArquivoCrop(null);
    } catch (error) {
      setErroAssinatura("Não foi possível remover o fundo da imagem. Tente outra foto.");
      setArquivoCrop(null);
    } finally {
      setProcessandoAssinatura(false);
    }
  };

  const salvarAssinatura = async () => {
    if (!assinaturaUsuario) return;
    setSalvandoAssinatura(true);
    setErroAssinatura("");
    // toast cleared

    try {
      let novaUrl = assinaturaSalvaUrl;
      let signatureUrlRelativa = assinaturaUsuario.signatureUrl || null;

      if (assinaturaBlob) {
        const resposta = await uploadUserSignature(assinaturaUsuario.id, assinaturaBlob);
        signatureUrlRelativa = resposta.signatureUrl;
        novaUrl = `${API_BASE}${resposta.signatureUrl}?v=${Date.now()}`;
      }

      await updateUserSignaturePosition(
        assinaturaUsuario.id,
        assinaturaOffset,
        assinaturaScale
      );

      setUsuarios((lista) =>
        lista.map((u) =>
          u.id === assinaturaUsuario.id
            ? {
                ...u,
                signatureUrl: signatureUrlRelativa,
                signatureOffset: assinaturaOffset,
                signatureScale: assinaturaScale,
                updatedAt: new Date().toISOString(),
              }
            : u
        )
      );
      setAssinaturaUsuario((prev) =>
        prev
          ? {
              ...prev,
              signatureUrl: signatureUrlRelativa,
              signatureOffset: assinaturaOffset,
              signatureScale: assinaturaScale,
            }
          : prev
      );
      setAssinaturaOffsetSalvo(assinaturaOffset);
      setAssinaturaScaleSalva(assinaturaScale);

      if (assinaturaPreview) {
        URL.revokeObjectURL(assinaturaPreview);
      }
      setAssinaturaPreview("");
      setAssinaturaBlob(null);
      setAssinaturaSalvaUrl(novaUrl);
      showSucesso("Assinatura atualizada com sucesso");
      fecharAssinatura();
    } catch (error) {
      setErroAssinatura(error.message || "Erro ao salvar a assinatura");
    } finally {
      setSalvandoAssinatura(false);
    }
  };

  const removerAssinatura = async () => {
    if (!assinaturaUsuario) return;
    setSalvandoAssinatura(true);
    setErroAssinatura("");
    // toast cleared

    try {
      await deleteUserSignature(assinaturaUsuario.id);

      if (assinaturaPreview) {
        URL.revokeObjectURL(assinaturaPreview);
      }
      setAssinaturaPreview("");
      setAssinaturaBlob(null);
      setAssinaturaSalvaUrl("");
      setUsuarios((lista) =>
        lista.map((u) =>
          u.id === assinaturaUsuario.id
            ? { ...u, signatureUrl: null, signatureScale: SIGNATURE_SCALE_DEFAULT }
            : u
        )
      );
      setAssinaturaUsuario((prev) =>
        prev ? { ...prev, signatureUrl: null, signatureScale: SIGNATURE_SCALE_DEFAULT } : prev
      );
      setAssinaturaScale(SIGNATURE_SCALE_DEFAULT);
      setAssinaturaScaleSalva(SIGNATURE_SCALE_DEFAULT);
      showSucesso("Assinatura removida");
    } catch (error) {
      setErroAssinatura(error.message || "Erro ao remover a assinatura");
    } finally {
      setSalvandoAssinatura(false);
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
        <main className="mx-auto max-w-6xl px-4 py-8 pt-16 md:pt-8">
          {!temAcesso ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Restrição de Acesso
              </h1>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Esta tela é exclusiva para usuários com o perfil{" "}
                <strong>Administrador Global</strong> ou{" "}
                <strong>Administrador Local</strong>.
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
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-blue-900">
                    Gerenciar Usuários
                  </h1>
                  <p className="text-sm text-gray-600">
                    {ehAdminGlobal
                      ? "Todos os usuários do sistema"
                      : "Usuários da sua OM"}
                  </p>
                </div>
                <button
                  onClick={abrirImport}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800"
                  title="Importar usuário pelo CPF (somente da própria OM)"
                >
                  <UserPlus className="h-4 w-4" />
                  Importar por CPF
                </button>
              </div>

              {erro && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  {erro}
                </div>
              )}

              {/* Filtros */}
              <div className="card mb-6">
                <div
                  className={`grid grid-cols-1 gap-4 ${
                    ehAdminGlobal ? "md:grid-cols-2" : ""
                  }`}
                >
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Buscar (Nome, CPF, SARAM, Posto)
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

                  {ehAdminGlobal && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Organização Militar
                      </label>
                      <input
                        type="text"
                        value={omFiltro}
                        onChange={(e) => setOmFiltro(e.target.value)}
                        placeholder="Filtrar por OM..."
                        className="input-field"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Tabela */}
              <div className="card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 px-4 text-left font-semibold text-gray-700">
                          Nome de Guerra
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-gray-700">
                          Nome Completo
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-gray-700">
                          OM
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-gray-700">
                          Posto
                        </th>
                        <th className="py-3 px-4 text-right font-semibold text-gray-700">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {carregandoUsuarios ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-500">
                            Carregando...
                          </td>
                        </tr>
                      ) : usuarios.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-500">
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      ) : (
                        usuarios.map((u) => (
                          <tr
                            key={u.id}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="py-3 px-4 font-semibold text-gray-900">
                              {u.warName || "-"}
                            </td>
                            <td className="py-3 px-4 text-gray-600">{u.name}</td>
                            <td className="py-3 px-4 text-gray-600">
                              {u.militaryOrganization?.acronym || "-"}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {u.rank?.acronym || "-"}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => abrirAssinatura(u)}
                                  className={`relative rounded-lg p-2 transition-colors hover:bg-blue-50 ${
                                    u.signatureUrl ? "text-emerald-600" : "text-gray-500"
                                  }`}
                                  title={
                                    u.signatureUrl
                                      ? "Alterar assinatura"
                                      : "Adicionar assinatura"
                                  }
                                >
                                  <Signature className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => abrirEdicao(u)}
                                  className="rounded-lg p-2 text-blue-700 transition-colors hover:bg-blue-50"
                                  title="Editar perfis"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                {total > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-4">
                    <p className="text-sm text-gray-600">
                      Página {pagina} de {totalPaginas} · {total} usuário(s)
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        disabled={pagina <= 1 || carregandoUsuarios}
                        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </button>
                      <button
                        onClick={() =>
                          setPagina((p) => Math.min(totalPaginas, p + 1))
                        }
                        disabled={pagina >= totalPaginas || carregandoUsuarios}
                        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal importar por CPF */}
      {importModalVisivel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              importModalAberto ? "opacity-100" : "opacity-0"
            }`}
            onClick={fecharImport}
          />
          <div
            className={`relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl transition-all duration-200 ${
              importModalAberto ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-blue-900">Importar Usuário</h2>
              <button
                onClick={fecharImport}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              Informe o CPF do militar. Seus dados serão importados do LDAP. O usuário
              deve pertencer à <strong>sua OM</strong>.
            </p>

            {erroImport && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {erroImport}
              </div>
            )}

            <form onSubmit={confirmarImport} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  CPF
                </label>
                <input
                  type="text"
                  value={importCpf}
                  onChange={(e) => setImportCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="input-field"
                  autoFocus
                  disabled={importando}
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={fecharImport}
                  className="btn-secondary"
                  disabled={importando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={importando || !importCpf.trim()}
                >
                  {importando ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {importando ? "Importando..." : "Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de edição de perfis */}
      {modalUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              modalVisivel ? "opacity-100" : "opacity-0"
            }`}
            onClick={fecharEdicao}
          />
          <div
            className={`relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl transition-all duration-200 ${
              modalVisivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-blue-900">Editar Usuário</h2>
              <button
                onClick={fecharEdicao}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">
                {modalUsuario.warName || modalUsuario.name}
              </p>
              <p className="text-gray-600">
                {formatarCpf(modalUsuario.cpf)}
                {modalUsuario.rank?.acronym ? ` · ${modalUsuario.rank.acronym}` : ""}
                {modalUsuario.militaryOrganization?.acronym
                  ? ` · ${modalUsuario.militaryOrganization.acronym}`
                  : ""}
              </p>
            </div>

            {erroModal && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {erroModal}
              </div>
            )}

            <form onSubmit={salvarPerfis} className="space-y-3">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Função (opcional)
                  </label>
                  <input
                    type="text"
                    value={positionEdit}
                    onChange={(e) => setPositionEdit(e.target.value)}
                    list="position-options"
                    placeholder="Digite ou selecione"
                    className="input-field"
                  />
                  <datalist id="position-options">
                    {positionOptions.map((item) => (
                      <option key={`dl-position-${item}`} value={item} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Quadro (opcional)
                  </label>
                  <input
                    type="text"
                    value={corpsEdit}
                    onChange={(e) => setCorpsEdit(e.target.value)}
                    list="corps-options"
                    placeholder="Digite ou selecione"
                    className="input-field"
                  />
                  <datalist id="corps-options">
                    {corpsOptions.map((item) => (
                      <option key={`dl-corps-${item}`} value={item} />
                    ))}
                  </datalist>
                </div>
              </div>

              <p className="text-sm font-medium text-gray-700">Perfis</p>
              <div className="space-y-2">
                {roles.map((role) => {
                  const bloqueado =
                    role.code === "admin_global" && !ehAdminGlobal;
                  const marcado = rolesSelecionadas.has(role.id);
                  return (
                    <label
                      key={role.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                        bloqueado
                          ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                          : "cursor-pointer border-gray-200 hover:bg-blue-50"
                      } ${marcado ? "border-blue-300 bg-blue-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={bloqueado}
                        onChange={() => alternarRole(role)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                          {role.name}
                        </span>
                        {role.description && (
                          <span className="block text-xs text-gray-500">
                            {role.description}
                          </span>
                        )}
                        {bloqueado && (
                          <span className="block text-xs text-amber-600">
                            Apenas Administradores Globais podem alterar este
                            perfil.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={fecharEdicao}
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

      {/* Modal de assinatura */}
      {assinaturaUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              assinaturaVisivel ? "opacity-100" : "opacity-0"
            }`}
            onClick={fecharAssinatura}
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-all duration-200 ${
              assinaturaVisivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-blue-900">Assinatura</h2>
              <button
                onClick={fecharAssinatura}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">
                {assinaturaUsuario.warName || assinaturaUsuario.name}
              </p>
              <p className="text-gray-600">
                {formatarCpf(assinaturaUsuario.cpf)}
                {assinaturaUsuario.rank?.acronym
                  ? ` · ${assinaturaUsuario.rank.acronym}`
                  : ""}
                {assinaturaUsuario.militaryOrganization?.acronym
                  ? ` · ${assinaturaUsuario.militaryOrganization.acronym}`
                  : ""}
              </p>
            </div>

            <p className="mb-4 text-sm text-gray-500">
              Selecione uma foto da assinatura feita em uma folha em branco. Primeiro
              você recorta a imagem; depois o fundo é removido (no seu computador) e a
              altura é ajustada. Por fim, posicione e redimensione com o mouse.
            </p>

            {erroAssinatura && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {erroAssinatura}
              </div>
            )}

            <input
              ref={assinaturaFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={aoSelecionarAssinatura}
              className="hidden"
            />

            <div
              className={`mb-4 grid gap-3 ${(assinaturaPreview || assinaturaSalvaUrl) ? "grid-cols-2" : "grid-cols-1"}`}
            >
              <button
                type="button"
                onClick={() => assinaturaFileRef.current?.click()}
                disabled={processandoAssinatura || salvandoAssinatura}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processandoAssinatura ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {processandoAssinatura ? "Processando..." : "Selecionar imagem"}
              </button>

              {(assinaturaPreview || assinaturaSalvaUrl) && (
                <button
                  type="button"
                  onClick={removerAssinatura}
                  disabled={salvandoAssinatura || processandoAssinatura}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </button>
              )}
            </div>

            {assinaturaPreview || assinaturaSalvaUrl ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700">
                  Posicione e redimensione a assinatura sobre a linha:
                </p>

                <SignatureCanvasPreview
                  src={assinaturaPreview || assinaturaSalvaUrl}
                  label={assinaturaUsuario.warName || assinaturaUsuario.name}
                  offset={assinaturaOffset}
                  scale={assinaturaScale}
                  disabled={processandoAssinatura || salvandoAssinatura}
                  onChange={({ offset: novoOffset, scale: novaEscala }) => {
                    setAssinaturaOffset(novoOffset);
                    setAssinaturaScale(novaEscala);
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
                <Signature className="h-6 w-6 text-gray-400" />
                Nenhuma assinatura cadastrada.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-5">
              <button
                type="button"
                onClick={fecharAssinatura}
                className="btn-secondary"
                disabled={salvandoAssinatura}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarAssinatura}
                disabled={
                  salvandoAssinatura ||
                  processandoAssinatura ||
                  (!assinaturaBlob &&
                    assinaturaOffset === assinaturaOffsetSalvo &&
                    assinaturaScale === assinaturaScaleSalva)
                }
                className="btn-primary flex items-center gap-2"
              >
                {salvandoAssinatura ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {salvandoAssinatura ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {arquivoCrop && (
        <SignatureCropModal
          file={arquivoCrop}
          busy={processandoAssinatura}
          onCancel={() => setArquivoCrop(null)}
          onConfirm={aoConfirmarCrop}
        />
      )}
    </div>
  );
}
