"use client";

import { useEffect, useRef } from "react";
import { Move, ZoomIn } from "lucide-react";
import {
  clampOffset,
  clampScale,
} from "../lib/signatureProcessing";

// Pré-visualização interativa da assinatura sobre a linha.
// O usuário arrasta a imagem para posicionar (somente eixo Y; X fica centralizado)
// e usa a roda do mouse ou a alça do canto para redimensionar (escala).
export default function SignatureCanvasPreview({
  src,
  label,
  offset,
  scale,
  onChange,
  disabled = false,
}) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const estadoRef = useRef({ offset, scale });

  // Mantém os valores atuais acessíveis dentro dos handlers de ponteiro/roda.
  estadoRef.current = { offset, scale };

  const iniciarMover = (event) => {
    if (disabled) return;
    event.preventDefault();
    dragRef.current = {
      tipo: "mover",
      startY: event.clientY,
      base: estadoRef.current.offset,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const iniciarEscala = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      tipo: "escala",
      startY: event.clientY,
      base: estadoRef.current.scale,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const aoMover = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.tipo === "mover") {
      const delta = event.clientY - drag.startY;
      onChange({
        offset: clampOffset(drag.base + delta),
        scale: estadoRef.current.scale,
      });
    } else {
      // Arrastar para cima aumenta; para baixo diminui.
      const delta = (drag.startY - event.clientY) * 0.01;
      onChange({
        offset: estadoRef.current.offset,
        scale: clampScale(drag.base + delta),
      });
    }
  };

  const finalizar = (event) => {
    if (dragRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
    }
  };

  // Roda do mouse sobre a área controla a escala (listener não-passivo).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const aoRolar = (event) => {
      if (disabled) return;
      event.preventDefault();
      const delta = -event.deltaY * 0.0015;
      onChange({
        offset: estadoRef.current.offset,
        scale: clampScale(estadoRef.current.scale + delta),
      });
    };

    stage.addEventListener("wheel", aoRolar, { passive: false });
    return () => stage.removeEventListener("wheel", aoRolar);
  }, [disabled, onChange]);

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg border border-gray-200 p-4"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%, #f3f4f6), linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%, #f3f4f6)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 8px 8px",
        }}
      >
        <div className="mx-auto flex w-72 max-w-full flex-col items-center">
          <div
            ref={stageRef}
            className="relative h-40 w-full overflow-hidden"
          >
            {/* Alça de redimensionamento (canto superior direito) */}
            <button
              type="button"
              onPointerDown={iniciarEscala}
              onPointerMove={aoMover}
              onPointerUp={finalizar}
              onPointerCancel={finalizar}
              disabled={disabled}
              title="Arraste para redimensionar"
              className="absolute right-1 top-1 z-10 flex h-7 w-7 touch-none items-center justify-center rounded-full border border-blue-300 bg-white text-blue-700 shadow-sm disabled:opacity-50"
              style={{ cursor: disabled ? "default" : "ns-resize" }}
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            {/* Linha base e rótulo */}
            <div className="pointer-events-none absolute inset-x-2 bottom-10 h-px bg-slate-500" />
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm uppercase text-slate-700">
              {label}
            </p>

            {/* Assinatura arrastável */}
            {src ? (
              <img
                src={src}
                alt="Pré-visualização da assinatura"
                draggable={false}
                onPointerDown={iniciarMover}
                onPointerMove={aoMover}
                onPointerUp={finalizar}
                onPointerCancel={finalizar}
                className="absolute bottom-10 left-1/2 max-h-14 w-auto touch-none object-contain"
                style={{
                  transform: `translateX(-50%) translateY(${offset}px) scale(${scale})`,
                  transformOrigin: "bottom center",
                  cursor: disabled ? "default" : "move",
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          <Move className="h-3.5 w-3.5" />
          Arraste a assinatura para posicionar
        </span>
        <span className="inline-flex items-center gap-1">
          <ZoomIn className="h-3.5 w-3.5" />
          Roda do mouse ou alça para redimensionar ({Math.round(scale * 100)}%)
        </span>
      </div>
    </div>
  );
}
