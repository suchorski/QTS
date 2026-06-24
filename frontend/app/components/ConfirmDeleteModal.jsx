"use client";

import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";

export default function ConfirmDeleteModal({
  aberto,
  visivel,
  titulo = "Confirmar exclusão",
  descricao,
  confirmarTexto = "Excluir",
  cancelarTexto = "Cancelar",
  confirmando = false,
  confirmandoTexto = "Excluindo...",
  variante = "perigo",
  onCancelar,
  onConfirmar,
}) {
  if (!aberto) return null;

  const podeFechar = !confirmando;
  const ehSucesso = variante === "sucesso";
  const IconeCabecalho = ehSucesso ? CheckCircle2 : AlertTriangle;
  const IconeConfirmar = ehSucesso ? CheckCircle2 : Trash2;
  const cabecalhoClasse = ehSucesso
    ? "bg-green-100 text-green-600"
    : "bg-red-100 text-red-600";
  const confirmarClasse = ehSucesso
    ? "bg-green-700 hover:bg-green-600"
    : "bg-red-600 hover:bg-red-700";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
          visivel ? "opacity-100" : "opacity-0"
        }`}
        onClick={podeFechar ? onCancelar : undefined}
      />

      <div
        className={`relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl transition-all duration-200 ${
          visivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-2 ${cabecalhoClasse}`}>
            <IconeCabecalho className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{titulo}</h3>
            <p className="mt-1 text-sm text-gray-600">{descricao}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancelar}
            className="btn-secondary"
            disabled={confirmando}
          >
            {cancelarTexto}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${confirmarClasse}`}
            disabled={confirmando}
          >
            <IconeConfirmar className="h-4 w-4" />
            {confirmando ? confirmandoTexto : confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  );
}