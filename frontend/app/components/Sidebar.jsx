"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Award,
  CalendarPlus,
  CalendarClock,
  LogOut,
  Menu,
  SlidersHorizontal,
  Settings2,
  FileSpreadsheet,
  ClipboardCheck,
  BadgeCheck,
  CheckCheck,
  Archive,
  UserCircle,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: null, // visível para todos os autenticados
  },
  {
    label: "Agenda",
    href: "/agenda",
    icon: CalendarPlus,
    roles: null, // visível para todos; controle de permissão ocorre na página/API
  },
  {
    label: "Solicitações",
    href: "/solicitacoes",
    icon: CalendarClock,
    roles: null,
  },
  {
    label: "Gerar QTS",
    href: "/qts",
    icon: FileSpreadsheet,
    roles: ["editor"],
  },
  {
    label: "Validar QTS",
    href: "/validar-qts",
    icon: ClipboardCheck,
    roles: ["validador"],
  },
  {
    label: "Aprovar QTS",
    href: "/aprovar-qts",
    icon: BadgeCheck,
    roles: ["aprovador"],
  },
  {
    label: "QTS Aprovados",
    href: "/qts-aprovados",
    icon: CheckCheck,
    roles: null, // visível para todos; controle de permissão ocorre na página/API
  },
  {
    label: "Histórico de QTS",
    href: "/historico-qts",
    icon: Archive,
    roles: null, // visível para todos; controle de permissão ocorre na página/API
  },
  {
    label: "Meu Perfil",
    href: "/perfil",
    icon: UserCircle,
    roles: null, // visível para todos os autenticados
  },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    roles: ["admin_global", "admin_local"],
  },
  {
    label: "Postos/Graduações",
    href: "/ranks",
    icon: Award,
    roles: ["admin_global"],
  },
  {
    label: "Configurações",
    href: "/configuracoes-local",
    icon: Settings2,
    roles: ["admin_global", "admin_local"],
  },
  {
    label: "Configurações Globais",
    href: "/configuracoes",
    icon: SlidersHorizontal,
    roles: ["admin_global"],
  },
];

const TRANSITION_DURATION_MS = 200;

export default function Sidebar({ usuario }) {
  const router = useRouter();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [mostrarTransicao, setMostrarTransicao] = useState(false);
  const [faseTransicao, setFaseTransicao] = useState("idle");
  const timersRef = useRef([]);

  const roles = usuario?.roles?.map((r) => r.code) || [];

  const itensVisiveis = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((code) => roles.includes(code))
  );

  useEffect(() => {
    const precisaFadeOut = sessionStorage.getItem("qts-route-transition") === "1";

    if (!precisaFadeOut) {
      return;
    }

    sessionStorage.removeItem("qts-route-transition");
    setMostrarTransicao(true);
    setFaseTransicao("fadingOut");

    const timer = setTimeout(() => {
      setMostrarTransicao(false);
      setFaseTransicao("idle");
    }, TRANSITION_DURATION_MS);

    timersRef.current.push(timer);

    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

  const navegarComTransicao = (href) => {
    if (!href || href === pathname || faseTransicao === "fadingIn") {
      return;
    }

    setMostrarTransicao(true);
    setFaseTransicao("fadingIn");

    const timer = setTimeout(() => {
      sessionStorage.setItem("qts-route-transition", "1");
      router.push(href);
    }, TRANSITION_DURATION_MS);

    timersRef.current.push(timer);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    navegarComTransicao("/");
  };

  const navegar = (href) => {
    setAberto(false);
    navegarComTransicao(href);
  };

  const conteudo = (
    <div className="flex h-full flex-col bg-blue-900 text-white">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xl font-bold">
          Q
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">QTS</p>
          <p className="text-xs text-blue-200">Trabalho Semanal</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {itensVisiveis.map((item) => {
          const Icon = item.icon;
          const ativo =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <button
              key={item.href}
              onClick={() => navegar(item.href)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                ativo
                  ? "bg-white/15 text-white"
                  : "text-blue-100 hover:bg-white/10"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Rodapé / usuário */}
      <div className="border-t border-blue-800 px-4 py-4">
          <div className="flex items-center gap-3">
            {usuario && (
              <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">
              {usuario.warName || usuario.name}
            </p>
            <p className="truncate text-xs text-blue-200">
              {usuario.rank?.acronym
                ? `${usuario.rank.acronym} - `
                : ""}
              {usuario.militaryOrganization?.acronym || ""}
            </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-blue-100 transition-colors hover:bg-white/10"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
      </div>
    </div>
  );

  return (
    <>
      {mostrarTransicao && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 transition-opacity duration-200 ease-in-out ${
            faseTransicao === "fadingIn" ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="text-white text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
            <p>Carregando...</p>
          </div>
        </div>
      )}

      {/* Botão hambúrguer (somente telas menores) */}
      <button
        onClick={() => setAberto(true)}
        className="fixed left-4 top-4 z-30 rounded-lg bg-blue-900 p-2 text-white shadow-lg md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Sidebar fixa (telas maiores) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 md:block">
        {conteudo}
      </aside>

      {/* Drawer móvel */}
      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
          />
          {/* Painel */}
          <div className="absolute inset-y-0 left-0 w-64">
            <button
              onClick={() => setAberto(false)}
              className="absolute right-3 top-3 z-50 rounded-lg p-1.5 text-white hover:bg-white/10"
              aria-label="Fechar menu"
            >
              <X className="h-6 w-6" />
            </button>
            {conteudo}
          </div>
        </div>
      )}
    </>
  );
}
