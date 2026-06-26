"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, RefreshCcw, ShieldAlert, Upload, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useToast } from "../hooks/useToast";
import { getFabImageSettings, getMe, uploadFabImage } from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://qts-api.pamals.intraer";
const MODAL_FADE_MS = 200;

export default function ConfiguracoesPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { sucesso: showSucesso, erro: showErro } = useToast();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null);
  const [modalRenderizado, setModalRenderizado] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);

  const ehAdminGlobal = usuario?.roles?.some((role) => role.code === "admin_global");
  const savedImageUrl = imageUrl ? `${API_BASE}${imageUrl}?v=${updatedAt || "1"}` : "";

  useEffect(() => {
    const carregar = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }

        const dadosUsuario = await getMe();
        setUsuario(dadosUsuario);

        if (dadosUsuario?.roles?.some((role) => role.code === "admin_global")) {
          const settings = await getFabImageSettings();
          setImageUrl(settings.imageUrl || "");
          setUpdatedAt(settings.updatedAt || null);
        }
      } catch (error) {
        showErro("Erro ao carregar configurações do sistema");
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [router]);

  useEffect(() => {
    if (!modalRenderizado) return undefined;

    const timer = setTimeout(() => {
      setModalVisivel(true);
    }, 10);

    return () => clearTimeout(timer);
  }, [modalRenderizado]);

  const abrirModal = () => {
    setModalRenderizado(true);
  };

  const fecharModal = () => {
    setModalVisivel(false);
    setTimeout(() => {
      setModalRenderizado(false);
    }, MODAL_FADE_MS);
  };

  const aoSelecionarArquivo = (event) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    if (!["image/png", "image/webp"].includes(arquivo.type)) {
      showErro("Envie uma imagem PNG ou WebP");
      event.target.value = "";
      return;
    }
    setArquivoSelecionado(arquivo);
  };

  const salvarImagem = async (event) => {
    event.preventDefault();
    if (!arquivoSelecionado) {
      showErro("Selecione uma imagem antes de salvar");
      return;
    }

    setCarregandoImagem(true);

    try {
      const resposta = await uploadFabImage(arquivoSelecionado);
      setImageUrl(resposta.imageUrl || "");
      setUpdatedAt(resposta.updatedAt || null);
      setArquivoSelecionado(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      showSucesso("Imagem enviada e otimizada com sucesso. O sistema converteu para WebP com 400px de altura.");
    } catch (error) {
      showErro(error.message || "Erro ao salvar imagem");
    } finally {
      setCarregandoImagem(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-700">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar usuario={usuario} />

      <div className="md:pl-64">
        <main className="mx-auto max-w-3xl px-4 py-8 pt-16 md:pt-8">
          {!ehAdminGlobal ? (
            <div className="card text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-600">Acesso restrito</h1>
              <p className="mt-2 text-gray-600">
                Esta tela é exclusiva para o perfil <strong>Administrador Global</strong>.
              </p>
              <button onClick={() => router.push("/dashboard")} className="btn-primary mt-6">
                Voltar ao Dashboard
              </button>
            </div>
          ) : (
            <div className="card">
              <h1 className="mb-6 text-2xl font-bold text-blue-900">Configurações Globais</h1>

              <form onSubmit={salvarImagem} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Imagem da FAB</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/webp"
                    onChange={aoSelecionarArquivo}
                    className="hidden"
                  />

                  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-gray-600">
                        {arquivoSelecionado ? arquivoSelecionado.name : "Nenhum arquivo selecionado"}
                      </p>

                      {arquivoSelecionado && (
                        <button
                          type="button"
                          onClick={() => {
                            setArquivoSelecionado(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = "";
                            }
                          }}
                          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Limpar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-sm text-white hover:bg-blue-800"
                      >
                        <Upload className="h-4 w-4" />
                        Selecionar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {savedImageUrl && (
                    <button
                      type="button"
                      onClick={abrirModal}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4" />
                      Ver imagem
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={!arquivoSelecionado || carregandoImagem}
                    className="ml-auto inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {carregandoImagem ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {carregandoImagem ? "Enviando..." : "Upload"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {modalRenderizado && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
            modalVisivel ? "bg-black/70 opacity-100" : "bg-black/0 opacity-0"
          }`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              fecharModal();
            }
          }}
        >
          <div
            className={`relative w-full max-w-3xl rounded-lg bg-white p-4 transition-all duration-200 ${
              modalVisivel ? "translate-y-0 scale-100" : "translate-y-2 scale-95"
            }`}
          >
            <button
              type="button"
              onClick={fecharModal}
              className="absolute right-3 top-3 rounded-full p-1 text-gray-600 hover:bg-gray-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            {savedImageUrl ? (
              <img
                src={savedImageUrl}
                alt="Imagem FAB"
                className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
              />
            ) : (
              <p className="py-10 text-center text-gray-600">Nenhuma imagem disponível.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}