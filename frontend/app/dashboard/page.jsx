"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Check, ChevronDown, Link2 } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { getMilitaryOrganizations } from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://qts-api.pamals.intraer";

export default function DashboardPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [ranksSemNome, setRanksSemNome] = useState([]);
  const [militaryOrganizations, setMilitaryOrganizations] = useState([]);
  const [omSelecionada, setOmSelecionada] = useState(null);
  const [omDropdownAberto, setOmDropdownAberto] = useState(false);
  const [omFiltro, setOmFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const omDropdownRef = useRef(null);

  const ehAdminGlobal = usuario?.roles?.some((r) => r.code === "admin_global");
  const postoGraduacao =
    String(usuario?.rank?.name || "").trim() ||
    usuario?.rank?.acronym ||
    "N/A";

  const omSegment = String(omSelecionada?.acronym || "")
    .trim()
    .replace(/\s+/g, "-");

  const linkAtual =
    omSegment && typeof window !== "undefined"
      ? `${window.location.origin}/${encodeURIComponent(omSegment)}/atual`
      : "";

  const linkProximo =
    omSegment && typeof window !== "undefined"
      ? `${window.location.origin}/${encodeURIComponent(omSegment)}/proximo`
      : "";

  const militaryOrganizationsFiltradas = useMemo(() => {
    const termo = omFiltro.trim().toLowerCase();
    if (!termo) return militaryOrganizations;

    return militaryOrganizations.filter((om) => {
      const acronym = String(om.acronym || "").toLowerCase();
      const name = String(om.name || "").toLowerCase();
      return acronym.includes(termo) || name.includes(termo);
    });
  }, [militaryOrganizations, omFiltro]);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }

        const response = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const dadosUsuario = response.data;
        setUsuario(dadosUsuario);
        try {
          const militaryOrganizationsResponse = await getMilitaryOrganizations();
          const lista = militaryOrganizationsResponse?.data || [];
          setMilitaryOrganizations(lista);

          const omUsuarioId = dadosUsuario?.militaryOrganization?.id;
          const omUsuario = lista.find((om) => om.id === omUsuarioId);
          setOmSelecionada(omUsuario || dadosUsuario?.militaryOrganization || null);
        } catch (militaryOrganizationsError) {
          console.error("Erro ao carregar OMs:", militaryOrganizationsError);
          setOmSelecionada(dadosUsuario?.militaryOrganization || null);
        }

        const isAdminGlobal = dadosUsuario?.roles?.some(
          (r) => r.code === "admin_global"
        );

        if (isAdminGlobal) {
          try {
            const ranksResponse = await axios.get(`${API_BASE}/ranks`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            const ranks = ranksResponse.data?.data || [];
            const semNome = ranks.filter((rank) => !String(rank.name || "").trim());
            setRanksSemNome(semNome);
          } catch (ranksError) {
            console.error("Erro ao carregar ranks para validação:", ranksError);
          }
        }
      } catch (error) {
        setErro("Erro ao carregar dados do usuário");
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [router]);

  useEffect(() => {
    const handleClickFora = (event) => {
      if (!omDropdownRef.current) return;
      if (!omDropdownRef.current.contains(event.target)) {
        setOmDropdownAberto(false);
      }
    };

    document.addEventListener("mousedown", handleClickFora);
    return () => {
      document.removeEventListener("mousedown", handleClickFora);
    };
  }, []);

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-slate-900">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{erro}</p>
          <button onClick={() => router.push("/")} className="btn-primary">
            Voltar ao Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <Sidebar usuario={usuario} />

      <div className="md:pl-64">
        <main className="max-w-5xl mx-auto px-4 py-8 pt-16 md:pt-8">
        <div className="card mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold text-blue-900 mb-2">
                Bem-vindo, {usuario?.warName || usuario?.name}!
              </h2>
              <p className="text-gray-600">
                {usuario?.rank?.acronym && `${usuario.rank.acronym} - `}
                {usuario?.militaryOrganization?.acronym}
              </p>
            </div>
          </div>
        </div>

        <div className="card mb-8">
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-2">OM para links públicos</p>
            <div className="relative" ref={omDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setOmDropdownAberto((atual) => !atual);
                  setOmFiltro("");
                }}
                className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:border-blue-300"
              >
                <span className="truncate">
                  {omSelecionada
                    ? `${omSelecionada.acronym}${omSelecionada.name ? ` - ${omSelecionada.name}` : ""}`
                    : "Selecione uma OM"}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-500" />
              </button>

              {omDropdownAberto && (
                <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  <div className="border-b border-gray-100 p-2">
                    <input
                      type="text"
                      value={omFiltro}
                      onChange={(event) => setOmFiltro(event.target.value)}
                      placeholder="Filtrar OM..."
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <ul className="max-h-60 overflow-auto py-1">
                    {militaryOrganizationsFiltradas.length > 0 ? (
                      militaryOrganizationsFiltradas.map((om) => (
                        <li key={om.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setOmSelecionada(om);
                              setOmDropdownAberto(false);
                              setOmFiltro("");
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50"
                          >
                            <span className="truncate">
                              {om.acronym}
                              {om.name ? ` - ${om.name}` : ""}
                            </span>
                            {omSelecionada?.id === om.id && (
                              <Check className="ml-2 h-4 w-4 shrink-0 text-blue-700" />
                            )}
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2 text-sm text-gray-500">Nenhuma OM encontrada.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <a
              href={linkAtual || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-left transition-colors ${
                linkAtual
                  ? "border-blue-200 bg-blue-100/80 text-blue-950 hover:bg-blue-200/70"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
              }`}
              onClick={(event) => {
                if (!linkAtual) event.preventDefault();
              }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                <Link2 className="h-4 w-4" />
                QTS Atual
              </span>
            </a>

            <a
              href={linkProximo || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-left transition-colors ${
                linkProximo
                  ? "border-blue-200 bg-blue-100/80 text-blue-950 hover:bg-blue-200/70"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
              }`}
              onClick={(event) => {
                if (!linkProximo) event.preventDefault();
              }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                <Link2 className="h-4 w-4" />
                Próximo QTS
              </span>
            </a>
          </div>
        </div>

        {ehAdminGlobal && ranksSemNome.length > 0 && (
          <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h3 className="text-lg font-semibold text-amber-900 mb-1">
              Atenção: existem postos/graduações sem nome
            </h3>
            <p className="text-amber-800">
              Foram encontrados postos/graduações sem nome: {" "}
              {ranksSemNome.map((rank) => rank.acronym).join(", ")}. Acesse a
              tela de Postos e Graduações para corrigir.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Informações Pessoais</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Nome Completo</p>
                <p className="font-semibold text-gray-900">{usuario?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">CPF</p>
                <p className="font-semibold text-gray-900">{usuario?.cpf}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Posto/Graduação</p>
                <p className="font-semibold text-gray-900">{postoGraduacao}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Acesso e OM</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Organização Militar</p>
                <p className="font-semibold text-gray-900">{usuario?.militaryOrganization?.acronym || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Perfis</p>
                <div className="flex flex-wrap gap-2">
                  {usuario?.roles?.map((role) => (
                    <span key={role.id} className="bg-blue-100 text-blue-900 px-3 py-1 rounded-full text-sm font-medium">
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>


        </main>
      </div>
    </div>
  );
}
