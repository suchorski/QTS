"use client";

import { useContext } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { ToastContext } from "../contexts/ToastContext";

export function ToastContainer() {
  const context = useContext(ToastContext);
  if (!context || !context.toasts.length) return null;

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 shrink-0" />;
      case "error":
        return <AlertCircle className="h-4 w-4 shrink-0" />;
      case "info":
        return <Info className="h-4 w-4 shrink-0" />;
      default:
        return null;
    }
  };

  const getStyles = (type) => {
    switch (type) {
      case "success":
        return {
          border: "border-green-200",
          bg: "bg-white",
          text: "text-green-700",
        };
      case "error":
        return {
          border: "border-red-200",
          bg: "bg-white",
          text: "text-red-700",
        };
      case "info":
        return {
          border: "border-blue-200",
          bg: "bg-white",
          text: "text-blue-700",
        };
      default:
        return {
          border: "border-gray-200",
          bg: "bg-white",
          text: "text-gray-700",
        };
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] space-y-3">
      {context.toasts.map((toast) => {
        const styles = getStyles(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-sm rounded-lg border ${styles.border} ${styles.bg} px-4 py-3 shadow-xl transition-all duration-200 animate-slide-in`}
          >
            <div className={`flex items-center gap-2 text-sm ${styles.text}`}>
              {getIcon(toast.type)}
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => context.removeToast(toast.id)}
                className="ml-2 shrink-0 opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
