import { useContext } from "react";
import { ToastContext } from "../contexts/ToastContext";

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de um ToastProvider");
  }

  return {
    sucesso: (message) => context.addToast(message, "success"),
    erro: (message) => context.addToast(message, "error"),
    info: (message) => context.addToast(message, "info"),
    removeToast: context.removeToast,
  };
}
