"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCcw, AlertTriangle, ShieldAlert } from "lucide-react";
import QtsDocument from "../../components/QtsDocument";
import { getPublicQtsByOmPeriod } from "../../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://qts-api.pamals.intraer";
const TRUST_FLAG = "qts_trust_attempted";

// Falha de rede no fetch (tipicamente certificado SSL com raiz nao confiavel)
// rejeita com um TypeError, diferente de um erro HTTP da aplicacao.
const ehFalhaDeRede = (error) =>
  error instanceof TypeError ||
  /failed to fetch|networkerror|load failed/i.test(error?.message || "");

export default function QtsPublicoPorOmPeriodoPage() {
  const params = useParams();
  const om = String(params?.om || "").trim();
  const periodo = String(params?.periodo || "").trim().toLowerCase();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [falhaDeRede, setFalhaDeRede] = useState(false);
  const [qts, setQts] = useState(null);

  // Redireciona para o backend para que o navegador exiba a tela de aceite do
  // certificado (CA interna). Apos o aceite, o /trust retorna para esta tela.
  const liberarCertificado = useCallback(() => {
    try {
      sessionStorage.setItem(TRUST_FLAG, "1");
    } catch {
      // ignora indisponibilidade do sessionStorage
    }
    const retorno = window.location.origin + window.location.pathname;
    window.location.href = `${API_BASE}/trust?return=${encodeURIComponent(retorno)}`;
  }, []);

  useEffect(() => {
    const carregar = async () => {
      try {
        if (!om || (periodo !== "atual" && periodo !== "proximo")) {
          setErro("Link inválido.");
          return;
        }

        const data = await getPublicQtsByOmPeriod(om, periodo);
        setQts(data);
        try {
          sessionStorage.removeItem(TRUST_FLAG);
        } catch {
          // ignora
        }
      } catch (error) {
        // Em caso de falha de rede (certificado SSL nao confiavel), redireciona
        // automaticamente uma unica vez para a tela de aceite do certificado.
        if (ehFalhaDeRede(error)) {
          setFalhaDeRede(true);
          let jaTentou = false;
          try {
            jaTentou = sessionStorage.getItem(TRUST_FLAG) === "1";
          } catch {
            // ignora
          }
          if (!jaTentou) {
            liberarCertificado();
            return;
          }
          setErro("Servidor inacessível. Verifique o certificado de segurança.");
        } else {
          setErro(error.message || "Não foi possível abrir o QTS");
        }
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [om, periodo, liberarCertificado]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex min-h-screen items-center justify-center text-gray-600">
          <RefreshCcw className="mr-2 h-5 w-5 animate-spin" />
          Carregando QTS...
        </div>
      </div>
    );
  }

  if (erro || !qts?.content) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-4 py-14">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro || "QTS não encontrado para o período solicitado."}</span>
            </div>
          </div>
          {falhaDeRede && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-red-600">
                <ShieldAlert className="h-3.5 w-3.5" />
                Não foi possível conectar ao servidor com segurança.
              </span>
              <button
                type="button"
                onClick={liberarCertificado}
                className="text-xs font-semibold text-blue-700 underline hover:text-blue-900"
              >
                Liberar acesso seguro (aceitar certificado)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-6">
      <div className="mx-auto max-w-6xl px-4">
        <QtsDocument data={qts.content} />
      </div>
    </div>
  );
}
