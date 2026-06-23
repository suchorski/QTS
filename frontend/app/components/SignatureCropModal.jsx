"use client";

import { useEffect, useRef, useState } from "react";
import { Crop as CropIcon, RefreshCcw, X } from "lucide-react";
import { cropImage } from "../lib/signatureProcessing";

const MIN_SIZE = 24;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Modal para recortar a imagem original antes da remoção do fundo.
// Mostra a imagem e um retângulo de recorte arrastável/redimensionável (mouse).
export default function SignatureCropModal({ file, onCancel, onConfirm, busy = false }) {
  const [url, setUrl] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState(null); // coordenadas na imagem exibida
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    requestAnimationFrame(() => setVisivel(true));
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const aoCarregarImagem = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    setDisplay({ w, h });
    const inset = 0.06;
    setRect({
      x: w * inset,
      y: h * inset,
      w: w * (1 - inset * 2),
      h: h * (1 - inset * 2),
    });
  };

  const iniciarArraste = (tipo) => (event) => {
    if (busy || !rect) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      tipo,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...rect },
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
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const base = drag.rect;
    let next = { ...base };

    if (drag.tipo === "move") {
      next.x = clamp(base.x + dx, 0, display.w - base.w);
      next.y = clamp(base.y + dy, 0, display.h - base.h);
    } else {
      if (drag.tipo.includes("e")) {
        next.w = clamp(base.w + dx, MIN_SIZE, display.w - base.x);
      }
      if (drag.tipo.includes("s")) {
        next.h = clamp(base.h + dy, MIN_SIZE, display.h - base.y);
      }
      if (drag.tipo.includes("w")) {
        const novoX = clamp(base.x + dx, 0, base.x + base.w - MIN_SIZE);
        next.x = novoX;
        next.w = base.w + (base.x - novoX);
      }
      if (drag.tipo.includes("n")) {
        const novoY = clamp(base.y + dy, 0, base.y + base.h - MIN_SIZE);
        next.y = novoY;
        next.h = base.h + (base.y - novoY);
      }
    }

    setRect(next);
  };

  const finalizarArraste = (event) => {
    if (dragRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
    }
  };

  const confirmar = async () => {
    if (!rect || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / (display.w || 1);
    const scaleY = img.naturalHeight / (display.h || 1);
    const natural = {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.w * scaleX,
      height: rect.h * scaleY,
    };
    const blob = await cropImage(file, natural);
    onConfirm(blob);
  };

  const cantos = [
    { tipo: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { tipo: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { tipo: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
    { tipo: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          visivel ? "opacity-100" : "opacity-0"
        }`}
        onClick={busy ? undefined : onCancel}
      />
      <div
        className={`relative z-10 w-full max-w-lg rounded-lg bg-white p-5 shadow-xl transition-all duration-200 ${
          visivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-blue-900">Recortar assinatura</h2>
          <button
            type="button"
            onClick={busy ? undefined : onCancel}
            disabled={busy}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-gray-500">
          Ajuste o retângulo sobre a assinatura. Arraste para mover e use os cantos
          para redimensionar. Depois de cortar, o fundo é removido automaticamente.
        </p>

        <div className="flex justify-center">
          <div className="relative inline-block max-w-full select-none overflow-hidden rounded">
            <img
              ref={imgRef}
              src={url}
              alt="Imagem para recorte"
              onLoad={aoCarregarImagem}
              draggable={false}
              className="block max-h-[55vh] max-w-full rounded"
            />

            {rect && (
              <div
                className="absolute border-2 border-blue-500 touch-none"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                  cursor: busy ? "default" : "move",
                }}
                onPointerDown={iniciarArraste("move")}
                onPointerMove={aoMover}
                onPointerUp={finalizarArraste}
                onPointerCancel={finalizarArraste}
              >
                {cantos.map((canto) => (
                  <div
                    key={canto.tipo}
                    className={`absolute h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-white touch-none ${canto.className}`}
                    onPointerDown={iniciarArraste(canto.tipo)}
                    onPointerMove={aoMover}
                    onPointerUp={finalizarArraste}
                    onPointerCancel={finalizarArraste}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={busy ? undefined : onCancel}
            disabled={busy}
            className="btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={busy || !rect}
            className="btn-primary flex items-center gap-2"
          >
            {busy ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <CropIcon className="h-4 w-4" />
            )}
            {busy ? "Processando..." : "Cortar e remover fundo"}
          </button>
        </div>
      </div>
    </div>
  );
}
