"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Printer, RefreshCcw, AlertTriangle } from "lucide-react";
import QtsDocument from "../components/QtsDocument";
import { getMe, getQtsApproved, getQtsHistory } from "../lib/api";

function QtsImpressaoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tipo = String(searchParams.get("tipo") || "").trim();
  const id = String(searchParams.get("id") || "").trim();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [registro, setRegistro] = useState(null);
  const alreadyPrinted = useRef(false);

  const titulo = useMemo(() => {
    if (tipo === "historico") return "Impressão de QTS arquivado";
    return "Impressão de QTS aprovado";
  }, [tipo]);

  useEffect(() => {
    const carregar = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }

        await getMe();

        if (!id || (tipo !== "aprovados" && tipo !== "historico")) {
          setErro("Parâmetros de impressão inválidos.");
          return;
        }

        const completo =
          tipo === "historico"
            ? await getQtsHistory(id)
            : await getQtsApproved(id);

        setRegistro(completo);
      } catch (error) {
        setErro(error.message || "Erro ao carregar QTS para impressão");
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [id, tipo, router]);

  useEffect(() => {
    if (!carregando && registro && !alreadyPrinted.current) {
      alreadyPrinted.current = true;
      setTimeout(() => window.print(), 200);
    }
  }, [carregando, registro]);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 print:hidden">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
            <p className="text-sm text-slate-500">Use o botão para imprimir novamente, se necessário.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-8 print:max-w-none print:px-0 print:pb-0">
        {carregando ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <RefreshCcw className="mr-2 h-5 w-5 animate-spin" />
            Carregando QTS...
          </div>
        ) : erro ? (
          <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          </div>
        ) : (
          <QtsDocument data={registro?.content} />
        )}
      </div>
    </div>
  );
}

export default function QtsImpressaoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 print:bg-white">
          <div className="flex items-center justify-center py-16 text-gray-500">
            <RefreshCcw className="mr-2 h-5 w-5 animate-spin" />
            Carregando QTS...
          </div>
        </div>
      }
    >
      <QtsImpressaoContent />
    </Suspense>
  );
}
