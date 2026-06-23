"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Underline } from "lucide-react";

const CORES = [
  { hex: "#1e293b", label: "Preto" },
  { hex: "#dc2626", label: "Vermelho" },
  { hex: "#2563eb", label: "Azul" },
  { hex: "#16a34a", label: "Verde" },
  { hex: "#d97706", label: "Laranja" },
  { hex: "#7c3aed", label: "Roxo" },
];

export default function RichTextEditor({ editorRef, placeholder = "Digite uma observação..." }) {
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (editorRef?.current) {
      editorRef.current.innerHTML = "";
    }
  }, []);

  const exec = (cmd, value = null) => {
    editorRef?.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  };

  const btnBase =
    "flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-gray-200 active:bg-gray-300 text-gray-700 select-none";

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Toolbar */}
      <div
        ref={toolbarRef}
        className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5"
        onMouseDown={(e) => e.preventDefault()} // Evita perder o foco do editor
      >
        <button type="button" onClick={() => exec("bold")} className={btnBase} title="Negrito (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("italic")} className={btnBase} title="Itálico (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("underline")} className={btnBase} title="Sublinhado (Ctrl+U)">
          <Underline className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1.5 h-4 w-px bg-gray-300" />

        {CORES.map(({ hex, label }) => (
          <button
            key={hex}
            type="button"
            title={label}
            onClick={() => exec("foreColor", hex)}
            className="h-5 w-5 rounded-full border border-white outline outline-1 outline-gray-300 transition-transform hover:scale-125"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      {/* Área de texto */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onKeyDown={handleKeyDown}
        className="min-h-[140px] px-3 py-2.5 text-sm leading-6 text-gray-800 focus:outline-none
          empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none"
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      />
    </div>
  );
}
