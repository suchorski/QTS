"use client";

import { AlertTriangle, Trash2 } from "lucide-react";

export default function ConfirmDeleteModal({
  aberto,
  visivel,
  titulo = "Confirmar exclusão",
  descricao,
  confirmarTexto = "Excluir",
  cancelarTexto = "Cancelar",
  confirmando = false,
  onCancelar,
  onConfirmar,
}) {
  if (!aberto) return null;

  const podeFechar = !confirmando;

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
          <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
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
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={confirmando}
          >
            <Trash2 className="h-4 w-4" />
            {confirmando ? "Excluindo..." : confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  );
}