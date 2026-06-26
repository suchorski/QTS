"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, RefreshCcw, ShieldAlert, Upload, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useToast } from "../hooks/useToast";
import {
  getLocalOmSettings,
  getMe,
  validateLocalOmSmtpSettings,
  updateLocalOmName,
  updateLocalOmSmtpSettings,
  uploadLocalOmImage,
} from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://qts-api.pamals.intraer";
const MODAL_FADE_MS = 200;

export default function ConfiguracoesLocalPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { sucesso: showSucesso, erro: showErro, info: showInfo } = useToast();

  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [salvandoSmtp, setSalvandoSmtp] = useState(false);
  const [validandoSmtp, setValidandoSmtp] = useState(false);
  const [smtpValidado, setSmtpValidado] = useState(false);

  const [omAcronym, setOmAcronym] = useState("");
  const [omNomeExtenso, setOmNomeExtenso] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null);

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpAllowInvalidCertificate, setSmtpAllowInvalidCertificate] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpRecipientEmail, setSmtpRecipientEmail] = useState("");
  const [smtpSenderEmail, setSmtpSenderEmail] = useState("");
  const [smtpSenderName, setSmtpSenderName] = useState("");
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);

  const [modalRenderizado, setModalRenderizado] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);

  const ehAdminLocal = usuario?.roles?.some((role) => role.code === "admin_local");
  const ehAdminGlobal = usuario?.roles?.some((role) => role.code === "admin_global");
  const temAcesso = ehAdminLocal || ehAdminGlobal;

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

        const isAdminLocal = dadosUsuario?.roles?.some((role) => role.code === "admin_local");
        const isAdminGlobal = dadosUsuario?.roles?.some((role) => role.code === "admin_global");

        if (isAdminLocal || isAdminGlobal) {
          const settings = await getLocalOmSettings();
          setOmAcronym(settings?.militaryOrganization?.acronym || "");
          setOmNomeExtenso(settings?.militaryOrganization?.name || "");
          setImageUrl(settings?.imageUrl || "");
          setUpdatedAt(settings?.updatedAt || null);
          setSmtpEnabled(Boolean(settings?.smtp?.enabled));
          setSmtpHost(settings?.smtp?.host || "");
          setSmtpPort(String(settings?.smtp?.port || "587"));
          setSmtpSecure(Boolean(settings?.smtp?.secure));
          setSmtpAllowInvalidCertificate(Boolean(settings?.smtp?.allowInvalidCertificate));
          setSmtpUser(settings?.smtp?.user || "");
          setSmtpRecipientEmail(settings?.smtp?.recipientEmail || "");
          setSmtpSenderEmail(settings?.smtp?.senderEmail || "");
          setSmtpSenderName(settings?.smtp?.senderName || "");
          setSmtpHasPassword(Boolean(settings?.smtp?.hasPassword));
          setSmtpPassword("");
        }
      } catch (error) {
        showErro("Erro ao carregar configurações locais");
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
      const response = await uploadLocalOmImage(arquivoSelecionado);
      setImageUrl(response.imageUrl || "");
      setUpdatedAt(response.updatedAt || null);
      setArquivoSelecionado(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      showSucesso("DOM da OM enviado com sucesso.");
    } catch (error) {
      showErro(error.message || "Erro ao enviar imagem da OM");
    } finally {
      setCarregandoImagem(false);
    }
  };

  const salvarNomeOM = async (event) => {
    event.preventDefault();

    const nome = String(omNomeExtenso || "").trim();
    if (!nome) {
      showErro("Informe o nome por extenso da OM");
      return;
    }

    setSalvandoNome(true);

    try {
      const response = await updateLocalOmName(nome);
      setOmNomeExtenso(response?.militaryOrganization?.name || nome);
      showSucesso("Nome por extenso da OM salvo com sucesso.");
    } catch (error) {
      showErro(error.message || "Erro ao salvar nome da OM");
    } finally {
      setSalvandoNome(false);
    }
  };

  const validarSmtp = async () => {
    setValidandoSmtp(true);

    try {
      const payload = {
        enabled: smtpEnabled,
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        allowInvalidCertificate: smtpAllowInvalidCertificate,
        user: smtpUser,
        password: smtpPassword,
        recipientEmail: smtpRecipientEmail,
        senderEmail: smtpSenderEmail,
        senderName: smtpSenderName,
      };

      const response = await validateLocalOmSmtpSettings(payload);

      if (response?.valid) {
        setSmtpValidado(true);
        if (!smtpEnabled) {
          showInfo(response?.message || "SMTP desativado. Nada para validar.");
        } else {
          showSucesso(response?.message || "Conexão SMTP validada com sucesso.");
        }
      } else {
        setSmtpValidado(false);
        showErro(response?.message || "Validação SMTP não foi concluída");
      }
    } catch (error) {
      setSmtpValidado(false);
      showErro(error.message || "Erro ao validar conexão SMTP");
    } finally {
      setValidandoSmtp(false);
    }
  };

  const salvarSmtp = async (event) => {
    event.preventDefault();

    if (!smtpValidado) {
      showErro("Valide a configuração SMTP antes de salvar");
      return;
    }

    setSalvandoSmtp(true);

    try {
      const payload = {
        enabled: smtpEnabled,
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        allowInvalidCertificate: smtpAllowInvalidCertificate,
        user: smtpUser,
        password: smtpPassword,
        recipientEmail: smtpRecipientEmail,
        senderEmail: smtpSenderEmail,
        senderName: smtpSenderName,
      };

      const response = await updateLocalOmSmtpSettings(payload);
      const smtp = response?.smtp || {};

      setSmtpEnabled(Boolean(smtp.enabled));
      setSmtpHost(smtp.host || "");
      setSmtpPort(String(smtp.port || "587"));
      setSmtpSecure(Boolean(smtp.secure));
      setSmtpAllowInvalidCertificate(Boolean(smtp.allowInvalidCertificate));
      setSmtpUser(smtp.user || "");
      setSmtpRecipientEmail(smtp.recipientEmail || "");
      setSmtpSenderEmail(smtp.senderEmail || "");
      setSmtpSenderName(smtp.senderName || "");
      setSmtpHasPassword(Boolean(smtp.hasPassword));
      setSmtpPassword("");

      showSucesso("Configuração SMTP salva com sucesso.");
    } catch (error) {
      showErro(error.message || "Erro ao salvar configuração SMTP");
    } finally {
      setSalvandoSmtp(false);
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
                <strong>Administrador Local</strong> ou{" "}
                <strong>Administrador Global</strong>. Seu perfil atual não
                possui permissão para acessar as configurações da OM.
              </p>
              <button onClick={() => router.push("/dashboard")} className="btn-primary">
                Voltar ao Dashboard
              </button>
            </div>
          ) : (
            <div className="card space-y-6">
              <h1 className="text-2xl font-bold text-blue-900">Configurações da OM</h1>

              <form onSubmit={salvarImagem} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">DOM da OM</label>
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

              <form onSubmit={salvarNomeOM} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Sigla da OM</label>
                  <input
                    type="text"
                    value={omAcronym}
                    disabled
                    className="block w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-600"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Nome por extenso da OM</label>
                  <input
                    type="text"
                    value={omNomeExtenso}
                    onChange={(event) => setOmNomeExtenso(event.target.value)}
                    placeholder="Ex.: Parque de Material Aeronáutico de Lagoa Santa"
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={salvandoNome}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {salvandoNome ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
                    {salvandoNome ? "Salvando..." : "Salvar nome da OM"}
                  </button>
                </div>
              </form>

              <form onSubmit={salvarSmtp} noValidate className="space-y-4 border-t border-gray-200 pt-6">
                <h2 className="text-lg font-semibold text-blue-900">
                  Notificação por email de QTS aprovado
                </h2>

                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={smtpEnabled}
                    onChange={(event) => {
                      setSmtpEnabled(event.target.checked);
                      setSmtpValidado(false);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900"
                  />
                  Ativar envio automático de email ao aprovar QTS desta OM
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Servidor SMTP</label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(event) => {
                        setSmtpHost(event.target.value);
                        setSmtpValidado(false);
                      }}
                      placeholder="smtp.fab.mil.br"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Porta SMTP</label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={smtpPort}
                      onChange={(event) => {
                        setSmtpPort(event.target.value);
                        setSmtpValidado(false);
                      }}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={smtpSecure}
                    onChange={(event) => {
                      const secureChecked = event.target.checked;
                      setSmtpSecure(secureChecked);
                      setSmtpPort(secureChecked ? "465" : "587");
                      setSmtpValidado(false);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900"
                  />
                  Usar conexão segura (SSL/TLS)
                </label>

                <label className="flex items-center gap-3 text-sm text-gray-700 pl-7">
                  <input
                    type="checkbox"
                    checked={smtpAllowInvalidCertificate}
                    disabled={!smtpSecure}
                    onChange={(event) => {
                      setSmtpAllowInvalidCertificate(event.target.checked);
                      setSmtpValidado(false);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  Aceitar certificado SSL autoassinado ou vencido
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Usuário SMTP</label>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={(event) => {
                        setSmtpUser(event.target.value);
                        setSmtpValidado(false);
                      }}
                      placeholder="usuario@fab.mil.br"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Senha SMTP</label>
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(event) => {
                        setSmtpPassword(event.target.value);
                        setSmtpValidado(false);
                      }}
                      placeholder={smtpHasPassword ? "Deixe em branco para manter a senha atual" : "Informe a senha"}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Email destinatário</label>
                  <input
                    type="email"
                    value={smtpRecipientEmail}
                    onChange={(event) => {
                      setSmtpRecipientEmail(event.target.value);
                      setSmtpValidado(false);
                    }}
                      placeholder="destinatario@fab.mil.br"
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Email do remetente (opcional)</label>
                    <input
                      type="email"
                      value={smtpSenderEmail}
                      onChange={(event) => {
                        setSmtpSenderEmail(event.target.value);
                        setSmtpValidado(false);
                      }}
                      placeholder="qts@fab.mil.br"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Nome do remetente (opcional)</label>
                    <input
                      type="text"
                      value={smtpSenderName}
                      onChange={(event) => {
                        setSmtpSenderName(event.target.value);
                        setSmtpValidado(false);
                      }}
                      placeholder="Sistema QTS"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={validarSmtp}
                    disabled={salvandoSmtp || validandoSmtp}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-900 px-4 py-2 text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {validandoSmtp ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
                    {validandoSmtp ? "Validando..." : "Validar"}
                  </button>

                  {smtpValidado && (
                  <button
                    type="submit"
                    disabled={salvandoSmtp}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {salvandoSmtp ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
                    {salvandoSmtp ? "Salvando..." : "Salvar SMTP"}
                  </button>
                  )}
                </div>

                {!smtpValidado && (
                  <p className="text-sm text-gray-500">
                    Valide os dados SMTP para habilitar o botão de salvar.
                  </p>
                )}
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
                alt="DOM da OM"
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
