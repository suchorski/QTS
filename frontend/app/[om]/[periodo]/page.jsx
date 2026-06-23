"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCcw, AlertTriangle } from "lucide-react";
import QtsDocument from "../../components/QtsDocument";
import { getPublicQtsByOmPeriod } from "../../lib/api";

export default function QtsPublicoPorOmPeriodoPage() {
  const params = useParams();
  const om = String(params?.om || "").trim();
  const periodo = String(params?.periodo || "").trim().toLowerCase();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [qts, setQts] = useState(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        if (!om || (periodo !== "atual" && periodo !== "proximo")) {
          setErro("Link inválido.");
          return;
        }

        const data = await getPublicQtsByOmPeriod(om, periodo);
        setQts(data);
      } catch (error) {
        setErro(error.message || "Não foi possível abrir o QTS");
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [om, periodo]);

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
