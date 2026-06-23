"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import { Lock, User, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { useToast } from "./hooks/useToast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const TRUST_FLAG = "qts_trust_attempted";

export default function LoginPage() {
  const router = useRouter();
  const { erro: showErro } = useToast();
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  // checking | online | offline
  const [backendStatus, setBackendStatus] = useState("checking");

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

  // Testa a conexao com o backend ao abrir a tela de login. Se a API estiver
  // inacessivel (tipicamente por certificado SSL nao confiavel), redireciona
  // automaticamente uma unica vez para a tela de aceite do certificado.
  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const resposta = await fetch(`${API_BASE}/health`, { cache: "no-store" });
        if (cancelado) return;
        if (resposta.ok) {
          setBackendStatus("online");
          try {
            sessionStorage.removeItem(TRUST_FLAG);
          } catch {
            // ignora
          }
        } else {
          setBackendStatus("offline");
        }
      } catch {
        if (cancelado) return;
        setBackendStatus("offline");
        let jaTentou = false;
        try {
          jaTentou = sessionStorage.getItem(TRUST_FLAG) === "1";
        } catch {
          // ignora
        }
        if (!jaTentou) {
          liberarCertificado();
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [liberarCertificado]);

  const formatarCPF = (valor) => {
    const numeros = valor.replace(/\D/g, "");
    if (numeros.length <= 3) return numeros;
    if (numeros.length <= 6)
      return `${numeros.slice(0, 3)}.${numeros.slice(3)}`;
    if (numeros.length <= 9)
      return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6)}`;
    return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6, 9)}-${numeros.slice(9, 11)}`;
  };

  const handleCPFChange = (e) => {
    setCpf(formatarCPF(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCarregando(true);

    try {
      const response = await axios.post(
        `${API_BASE}/auth/login`,
        {
          cpf: cpf.replace(/\D/g, ""),
          password: senha,
        }
      );

      // Salvar token no localStorage
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("usuario", JSON.stringify(response.data.user));

      // Redirecionar para dashboard
      router.push("/dashboard");
    } catch (error) {
      showErro(
        error.response?.data?.error || "Erro ao fazer login. Tente novamente."
      );
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      </div>

      {/* Card de Login */}
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-8 text-center">
            <div className="flex justify-center">
              <Image
                src="/images/logo-header.png"
                alt="QTS - Quadro de Trabalho Semanal"
                width={220}
                height={73}
                priority
                className="h-auto w-auto max-w-full"
              />
            </div>
          </div>

          {/* Form */}
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* CPF */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    CPF
                  </div>
                </label>
                <input
                  type="text"
                  value={cpf}
                  onChange={handleCPFChange}
                  placeholder="000.000.000-00"
                  disabled={carregando}
                  className="input-field text-lg"
                  maxLength="14"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Dados do Portal do Militar
                </p>
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Senha
                  </div>
                </label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  disabled={carregando}
                  className="input-field text-lg"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={carregando || !cpf || !senha}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-lg py-3 font-semibold"
              >
                {carregando ? "Autenticando..." : "Acessar"}
              </button>
            </form>

            {/* Rodapé */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-center text-xs text-gray-500">
                Sistema de Quadro de Trabalho Semanal
              </p>

              {/* Status de conexão com o backend */}
              <div className="mt-3 flex flex-col items-center gap-2">
                {backendStatus === "checking" && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Verificando conexão com o servidor...
                  </span>
                )}
                {backendStatus === "online" && (
                  <span className="flex items-center gap-1.5 text-xs text-green-600">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Servidor acessível
                  </span>
                )}
                {backendStatus === "offline" && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-red-600">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Servidor inacessível
                    </span>
                    <button
                      type="button"
                      onClick={liberarCertificado}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
                    >
                      Liberar acesso seguro (aceitar certificado)
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
