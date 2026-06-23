"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, RefreshCcw, Save, Trash2, Upload } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useToast } from "../hooks/useToast";
import {
  deleteMySignature,
  getMe,
  updateMyProfile,
  updateMySignaturePosition,
  uploadMySignature,
} from "../lib/api";
import {
  SIGNATURE_SCALE_DEFAULT,
  clampScale,
  removeBackgroundAndNormalize,
} from "../lib/signatureProcessing";
import SignatureCropModal from "../components/SignatureCropModal";
import SignatureCanvasPreview from "../components/SignatureCanvasPreview";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function CampoSomenteLeitura({ rotulo, valor }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">{rotulo}</label>
      <input
        type="text"
        value={valor || "—"}
        disabled
        className="block w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-600"
      />
    </div>
  );
}

export default function PerfilPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { sucesso: showSucesso, erro: showErro } = useToast();

  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Perfil (função/quadro)
  const [position, setPosition] = useState("");
  const [corps, setCorps] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  // Assinatura
  const [assinaturaSalvaUrl, setAssinaturaSalvaUrl] = useState("");
  const [previewProcessado, setPreviewProcessado] = useState("");
  const [blobProcessado, setBlobProcessado] = useState(null);
  const [arquivoCrop, setArquivoCrop] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [salvandoAssinatura, setSalvandoAssinatura] = useState(false);
  const [offset, setOffset] = useState(0);
  const [escala, setEscala] = useState(SIGNATURE_SCALE_DEFAULT);

  const assinaturaExibida = previewProcessado || assinaturaSalvaUrl;
  const houveMudancaAssinatura = useMemo(
    () =>
      offset !== (usuario?.signatureOffset ?? 0) ||
      escala !== clampScale(usuario?.signatureScale ?? SIGNATURE_SCALE_DEFAULT),
    [offset, escala, usuario]
  );

  const organizacaoMilitar = useMemo(() => {
    const om = usuario?.militaryOrganization;
    if (!om?.acronym) return "";
    return om.name ? `${om.acronym} - ${om.name}` : om.acronym;
  }, [usuario]);

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
        setPosition(dados?.position || "");
        setCorps(dados?.corps || "");
        setOffset(dados?.signatureOffset ?? 0);
        setEscala(clampScale(dados?.signatureScale ?? SIGNATURE_SCALE_DEFAULT));
        if (dados?.signatureUrl) {
          setAssinaturaSalvaUrl(`${API_BASE}${dados.signatureUrl}?v=${Date.now()}`);
        }
      } catch (error) {
        showErro("Erro ao carregar o perfil");
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [router]);

  useEffect(() => {
    return () => {
      if (previewProcessado) {
        URL.revokeObjectURL(previewProcessado);
      }
    };
  }, [previewProcessado]);

  const salvarPerfil = async (event) => {
    event.preventDefault();
    setSalvandoPerfil(true);

    try {
      const atualizado = await updateMyProfile({ position, corps });
      setPosition(atualizado?.position || "");
      setCorps(atualizado?.corps || "");
      setUsuario((prev) =>
        prev ? { ...prev, position: atualizado?.position, corps: atualizado?.corps } : prev
      );
      showSucesso("Dados do perfil salvos com sucesso.");
    } catch (error) {
      showErro(error.message || "Erro ao salvar o perfil");
    } finally {
      setSalvandoPerfil(false);
    }
  };

  const aoSelecionarArquivo = (event) => {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)) {
      showErro("Envie uma imagem PNG, JPG ou WebP da assinatura");
      return;
    }

    setArquivoCrop(arquivo);
  };

  const aoConfirmarCrop = async (blobRecortado) => {
    setProcessando(true);

    try {
      // Após o recorte: remove o fundo e normaliza para 150px de altura.
      const processado = await removeBackgroundAndNormalize(blobRecortado, {
        publicPath: `${window.location.origin}/imgly/`,
      });

      if (previewProcessado) {
        URL.revokeObjectURL(previewProcessado);
      }

      setBlobProcessado(processado);
      setPreviewProcessado(URL.createObjectURL(processado));
      setOffset(0);
      setEscala(SIGNATURE_SCALE_DEFAULT);
      setArquivoCrop(null);
    } catch (error) {
      showErro("Não foi possível remover o fundo da imagem. Tente outra foto.");
      setArquivoCrop(null);
    } finally {
      setProcessando(false);
    }
  };

  const salvarAssinatura = async () => {
    setSalvandoAssinatura(true);

    try {
      let novaUrl = assinaturaSalvaUrl;

      if (blobProcessado) {
        const resposta = await uploadMySignature(blobProcessado);
        novaUrl = `${API_BASE}${resposta.signatureUrl}?v=${Date.now()}`;
      }

      await updateMySignaturePosition(offset, escala);

      if (previewProcessado) {
        URL.revokeObjectURL(previewProcessado);
      }
      setPreviewProcessado("");
      setBlobProcessado(null);
      setAssinaturaSalvaUrl(novaUrl);
      setUsuario((prev) =>
        prev
          ? { ...prev, signatureOffset: offset, signatureScale: escala }
          : prev
      );
      showSucesso("Assinatura salva com sucesso.");
    } catch (error) {
      showErro(error.message || "Erro ao salvar a assinatura");
    } finally {
      setSalvandoAssinatura(false);
    }
  };

  const removerAssinatura = async () => {
    setSalvandoAssinatura(true);

    try {
      await deleteMySignature();
      if (previewProcessado) {
        URL.revokeObjectURL(previewProcessado);
      }
      setPreviewProcessado("");
      setBlobProcessado(null);
      setAssinaturaSalvaUrl("");
      setUsuario((prev) =>
        prev ? { ...prev, signatureUrl: null, signatureScale: SIGNATURE_SCALE_DEFAULT } : prev
      );
      setEscala(SIGNATURE_SCALE_DEFAULT);
      showSucesso("Assinatura removida.");
    } catch (error) {
      showErro(error.message || "Erro ao remover a assinatura");
    } finally {
      setSalvandoAssinatura(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-700">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-900" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  const podeSalvarAssinatura = Boolean(blobProcessado) || (assinaturaSalvaUrl && houveMudancaAssinatura);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar usuario={usuario} />

      <div className="md:pl-64">
        <main className="mx-auto max-w-3xl px-4 py-8 pt-16 md:pt-8 space-y-6">
          <h1 className="text-2xl font-bold text-blue-900">Meu Perfil</h1>

          {/* Dados pessoais */}
          <form onSubmit={salvarPerfil} className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Dados pessoais</h2>
              <p className="mt-1 text-sm text-gray-500">
                Os campos em cinza são atualizados automática e periodicamente a partir
                do sistema de pessoal e não podem ser editados aqui.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CampoSomenteLeitura rotulo="CPF" valor={usuario?.cpf} />
              <CampoSomenteLeitura rotulo="SARAM" valor={usuario?.saram} />
              <CampoSomenteLeitura
                rotulo="Posto/Graduação"
                valor={usuario?.rank?.acronym || usuario?.rank?.name}
              />
              <CampoSomenteLeitura rotulo="Nome de guerra" valor={usuario?.warName} />
              <CampoSomenteLeitura rotulo="Nome completo" valor={usuario?.name} />
              <CampoSomenteLeitura rotulo="E-mail" valor={usuario?.email} />
            </div>

            <CampoSomenteLeitura
              rotulo="Organização Militar"
              valor={organizacaoMilitar}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Função</label>
                <input
                  type="text"
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  placeholder="Digite a função"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Quadro</label>
                <input
                  type="text"
                  value={corps}
                  onChange={(event) => setCorps(event.target.value)}
                  placeholder="Digite o quadro"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={salvandoPerfil}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoPerfil ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {salvandoPerfil ? "Salvando..." : "Salvar dados"}
              </button>
            </div>
          </form>

          {/* Assinatura */}
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Assinatura</h2>
              <p className="mt-1 text-sm text-gray-500">
                Selecione uma foto da sua assinatura feita em uma folha em branco.
                Primeiro você recorta a imagem; em seguida o sistema remove o fundo
                (no seu computador) e ajusta a altura. Depois posicione e redimensione
                com o mouse. Esta assinatura é usada centralizada ao gerar o QTS na
                validação e na aprovação.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={aoSelecionarArquivo}
              className="hidden"
            />

            <div
              className={`grid gap-3 ${assinaturaExibida ? "grid-cols-2" : "grid-cols-1"}`}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processando}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processando ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {processando ? "Processando..." : "Selecionar imagem"}
              </button>

              {assinaturaExibida && (
                <button
                  type="button"
                  onClick={removerAssinatura}
                  disabled={salvandoAssinatura || processando}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover assinatura
                </button>
              )}
            </div>

            {assinaturaExibida ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700">
                  Posicione e redimensione a assinatura sobre a linha:
                </p>

                <SignatureCanvasPreview
                  src={assinaturaExibida}
                  label={usuario?.warName || usuario?.name}
                  offset={offset}
                  scale={escala}
                  disabled={processando || salvandoAssinatura}
                  onChange={({ offset: novoOffset, scale: novaEscala }) => {
                    setOffset(novoOffset);
                    setEscala(novaEscala);
                  }}
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={salvarAssinatura}
                    disabled={!podeSalvarAssinatura || salvandoAssinatura || processando}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {salvandoAssinatura ? (
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {salvandoAssinatura ? "Salvando..." : "Salvar assinatura"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
                <Eraser className="h-6 w-6 text-gray-400" />
                Nenhuma assinatura cadastrada.
              </div>
            )}
          </div>
        </main>
      </div>

      {arquivoCrop && (
        <SignatureCropModal
          file={arquivoCrop}
          busy={processando}
          onCancel={() => setArquivoCrop(null)}
          onConfirm={aoConfirmarCrop}
        />
      )}
    </div>
  );
}
