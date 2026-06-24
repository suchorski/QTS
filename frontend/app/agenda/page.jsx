"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Plus,
  X,
  Check,
  Clock,
  Calendar,
  Repeat,
  ShieldAlert,
  User as UserIcon,
  MapPin,
  Info,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  getMe,
  getEvents,
  getEventUniforms,
  createEvent,
  updateEvent,
  deleteEvent,
} from "../lib/api";
import { buildUniformSortKey } from "../lib/uniformSort";
import { useToast } from "../hooks/useToast";
import Sidebar from "../components/Sidebar";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const AGENDA_ROLES = ["editor", "validador", "aprovador"];

const TIPOS = [
  { value: "normal", label: "Evento" },
  { value: "no_expedient", label: "Sem expediente" },
];

const DIAS_SEMANA = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

const FORM_VAZIO = {
  type: "normal",
  recurring: false,
  eventDate: "",
  weekdays: [],
  startTime: "",
  endTime: "",
  title: "",
  information: "",
  location: "",
  responsible: "",
  uniformIds: [],
};

// Ordena por mais usado (usages desc) e, em empate, ordem alfabética.
function ordenarUniformes(lista) {
  return [...(lista || [])].sort((a, b) => {
    const contadorA = a.usages ?? 0;
    const contadorB = b.usages ?? 0;
    if (contadorB !== contadorA) {
      return contadorB - contadorA;
    }
    const keyA = buildUniformSortKey(a.uniform);
    const keyB = buildUniformSortKey(b.uniform);
    return keyA.localeCompare(keyB, "pt-BR", {
      sensitivity: "base",
    });
  });
}

function rotuloTipo(type) {
  return TIPOS.find((t) => t.value === type)?.label || "Evento";
}

function formatarData(valorIso) {
  if (!valorIso) return "";
  const texto = String(valorIso);

  // Para datas-only (AAAA-MM-DD ou AAAA-MM-DDTHH:mm...), evita deslocamento por fuso.
  const matchData = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchData) {
    const [, ano, mes, dia] = matchData;
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isoParaInputDate(valorIso) {
  if (!valorIso) return "";
  const data = new Date(valorIso);
  if (Number.isNaN(data.getTime())) return "";
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function semanaIntervalo(offsetSemanas = 0) {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg … 6=Sáb
  const diasAteSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - diasAteSegunda + offsetSemanas * 7);
  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);
  return { from: segunda, to: domingo };
}

function rotuloSemana(intervalo) {
  const fmt = (d) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(intervalo.from)} – ${fmt(intervalo.to)}`;
}

function rotuloRecorrencia(diasNumeros) {
  if (!Array.isArray(diasNumeros) || diasNumeros.length === 0) return "";
  return [...diasNumeros]
    .sort((a, b) => a - b)
    .map((dia) => DIAS_SEMANA.find((d) => d.value === dia)?.short || "")
    .filter(Boolean)
    .join(", ");
}

const FEED_VAZIO = {
  itens: [],
  page: 1,
  hasMore: true,
  carregando: true,
  carregandoMais: false,
};

const CONFIRMACAO_VAZIA = {
  aberto: false,
  visivel: false,
  evento: null,
  rotulo: "",
};

export default function AgendaPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [uniformes, setUniformes] = useState([]);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateFromAplicada, setDateFromAplicada] = useState("");
  const [dateToAplicada, setDateToAplicada] = useState("");

  // Aba ativa: false = eventos por data, true = recorrentes
  const [abaRecorrente, setAbaRecorrente] = useState(false);
  const [feed, setFeedState] = useState(FEED_VAZIO);

  const [erro, setErro] = useState("");
  const { sucesso: showSucesso } = useToast();

  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [confirmacao, setConfirmacao] = useState(CONFIRMACAO_VAZIA);

  const bottomRef = useRef(null);
  const debounceRef = useRef(null);
  const primeiraBuscaRef = useRef(true);
  const modalCloseTimerRef = useRef(null);
  const confirmCloseTimerRef = useRef(null);
  const [popupDataAberto, setPopupDataAberto] = useState(false);
  const popupDataRef = useRef(null);

  useEffect(() => {
    if (!popupDataAberto) return;
    const handleClickFora = (e) => {
      if (popupDataRef.current && !popupDataRef.current.contains(e.target)) {
        setPopupDataAberto(false);
      }
    };
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [popupDataAberto]);

  const aplicarSemana = (offsetSemanas) => {
    const { from, to } = semanaIntervalo(offsetSemanas);
    const dFrom = toInputDate(from);
    const dTo = toInputDate(to);
    setDateFrom(dFrom);
    setDateTo(dTo);
    setDateFromAplicada(dFrom);
    setDateToAplicada(dTo);
    setPopupDataAberto(false);
    carregarFeed({
      recurring: false,
      buscar: buscaAplicada,
      pagina: 1,
      append: false,
      dFrom,
      dTo,
    });
  };

  const podeAgenda = usuario?.roles?.some((r) => AGENDA_ROLES.includes(r.code));

  const semDados = form.type === "no_expedient";

  const uniformesOrdenados = useMemo(
    () => ordenarUniformes(uniformes),
    [uniformes]
  );

  useEffect(() => {
    const carregarUsuario = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/");
          return;
        }
        const dados = await getMe();
        setUsuario(dados);
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      } finally {
        setCarregando(false);
      }
    };
    carregarUsuario();

    return () => {
      if (modalCloseTimerRef.current) {
        clearTimeout(modalCloseTimerRef.current);
      }
      if (confirmCloseTimerRef.current) {
        clearTimeout(confirmCloseTimerRef.current);
      }
    };
  }, [router]);

  const carregarFeed = useCallback(
    async ({ recurring, buscar = "", pagina = 1, append = false, dFrom = "", dTo = "" } = {}) => {
      setFeedState((atual) => ({
        ...atual,
        carregando: append ? atual.carregando : true,
        carregandoMais: append ? true : atual.carregandoMais,
      }));
      setErro("");
      try {
        const resposta = await getEvents({
          search: buscar,
          page: pagina,
          limit: 10,
          recurring,
          ...(dFrom && { dateFrom: dFrom }),
          ...(dTo && { dateTo: dTo }),
        });
        const lista = resposta.data || [];
        setFeedState((atual) => ({
          itens: append ? [...atual.itens, ...lista] : lista,
          page: pagina,
          hasMore: Boolean(resposta.hasMore),
          carregando: false,
          carregandoMais: false,
        }));
      } catch (error) {
        setErro(error.message || "Erro ao carregar eventos");
        setFeedState((atual) => ({
          ...atual,
          carregando: false,
          carregandoMais: false,
        }));
      }
    },
    []
  );

  const carregarUniformes = useCallback(async () => {
    try {
      const resposta = await getEventUniforms();
      setUniformes(resposta.data || []);
    } catch (error) {
      setErro(error.message || "Erro ao carregar uniformes");
    }
  }, []);

  const recarregar = useCallback(
    async (buscar = buscaAplicada) => {
      await carregarFeed({
        recurring: abaRecorrente,
        buscar,
        pagina: 1,
        append: false,
        dFrom: dateFromAplicada,
        dTo: dateToAplicada,
      });
    },
    [buscaAplicada, abaRecorrente, carregarFeed, dateFromAplicada, dateToAplicada]
  );

  // Carrega o feed sempre que a aba muda (e no primeiro acesso)
  useEffect(() => {
    if (!podeAgenda) return;
    carregarFeed({
      recurring: abaRecorrente,
      buscar: buscaAplicada,
      pagina: 1,
      append: false,
      dFrom: dateFromAplicada,
      dTo: dateToAplicada,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAgenda, abaRecorrente]);

  useEffect(() => {
    if (!podeAgenda) return;
    carregarUniformes();
  }, [podeAgenda, carregarUniformes]);

  useEffect(() => {
    if (!podeAgenda) return;

    if (primeiraBuscaRef.current) {
      primeiraBuscaRef.current = false;
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const termo = busca.trim();
      setBuscaAplicada(termo);
      carregarFeed({
        recurring: abaRecorrente,
        buscar: termo,
        pagina: 1,
        append: false,
        dFrom: dateFromAplicada,
        dTo: dateToAplicada,
      });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [busca, podeAgenda, carregarFeed, dateFromAplicada, dateToAplicada]);

  // Scroll infinito
  useEffect(() => {
    if (!podeAgenda) return;
    const target = bottomRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          !first?.isIntersecting ||
          feed.carregando ||
          feed.carregandoMais ||
          !feed.hasMore
        ) {
          return;
        }
        carregarFeed({
          recurring: abaRecorrente,
          buscar: buscaAplicada,
          pagina: feed.page + 1,
          append: true,
          dFrom: dateFromAplicada,
          dTo: dateToAplicada,
        });
      },
      { root: null, rootMargin: "200px", threshold: 0.1 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [podeAgenda, feed, buscaAplicada, abaRecorrente, carregarFeed, dateFromAplicada, dateToAplicada]);

  const abrirNovo = () => {
    if (modalCloseTimerRef.current) {
      clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setErro("");
    setModalAberto(true);
    requestAnimationFrame(() => setModalVisivel(true));
  };

  const abrirEdicao = (evento) => {
    if (modalCloseTimerRef.current) {
      clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setForm({
      type: evento.type === "no_expedient" ? "no_expedient" : "normal",
      recurring: Boolean(evento.recurring),
      eventDate: isoParaInputDate(evento.eventDate),
      weekdays: Array.isArray(evento.weekdays) ? [...evento.weekdays] : [],
      startTime: evento.startTime || "",
      endTime: evento.endTime || "",
      title: evento.title || "",
      information: evento.information || "",
      location: evento.location || "",
      responsible: evento.responsible || "",
      uniformIds: (evento.uniforms || []).map((u) => u.id),
    });
    setEditandoId(evento.id);
    setErro("");
    setModalAberto(true);
    requestAnimationFrame(() => setModalVisivel(true));
  };

  const fecharModal = () => {
    setModalVisivel(false);
    modalCloseTimerRef.current = setTimeout(() => {
      setModalAberto(false);
      setForm(FORM_VAZIO);
      setEditandoId(null);
      modalCloseTimerRef.current = null;
    }, 200);
  };

  const alternarDiaSemana = (dia) => {
    setForm((atual) => {
      const existe = atual.weekdays.includes(dia);
      return {
        ...atual,
        weekdays: existe
          ? atual.weekdays.filter((d) => d !== dia)
          : [...atual.weekdays, dia],
      };
    });
  };

  const alternarUniforme = (id) => {
    setForm((atual) => {
      const existe = atual.uniformIds.includes(id);
      return {
        ...atual,
        uniformIds: existe
          ? atual.uniformIds.filter((u) => u !== id)
          : [...atual.uniformIds, id],
      };
    });
  };

  const salvar = async (e) => {
    e.preventDefault();
    setErro("");

    // Validações locais
    if (form.recurring) {
      if (form.weekdays.length === 0) {
        setErro("Selecione ao menos um dia da semana para a recorrência");
        return;
      }
    } else if (!form.eventDate) {
      setErro("Informe a data do evento");
      return;
    }

    if (!semDados) {
      if (!form.startTime) {
        setErro("Informe o horário inicial");
        return;
      }
      if (!form.title.trim()) {
        setErro("Informe o evento");
        return;
      }
      if (!form.information.trim()) {
        setErro("Informe os participantes");
        return;
      }
      if (!form.location.trim()) {
        setErro("Informe o local");
        return;
      }
      if (!form.responsible.trim()) {
        setErro("Informe o responsável");
        return;
      }
      if (form.uniformIds.length === 0) {
        setErro("Selecione ao menos um uniforme");
        return;
      }
    } else if (!form.title.trim()) {
      setErro("Informe o motivo para sem expediente");
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        type: form.type,
        recurring: form.recurring,
        ...(form.recurring
          ? { weekdays: form.weekdays }
          : { eventDate: form.eventDate }),
      };

      if (!semDados) {
        payload.startTime = form.startTime;
        payload.endTime = form.endTime || null;
        payload.information = form.information.trim();
        payload.location = form.location.trim();
        payload.responsible = form.responsible.trim();
        payload.uniformIds = form.uniformIds;
        payload.title = form.title.trim();
      } else {
        payload.title = form.title.trim();
      }

      if (editandoId) {
        await updateEvent(editandoId, payload);
        showSucesso("Evento atualizado com sucesso");
      } else {
        await createEvent(payload);
        showSucesso("Evento incluído na agenda com sucesso");
      }
      // Se o tipo de recorrência mudou, volta para a aba correspondente
      if (form.recurring !== abaRecorrente) {
        setAbaRecorrente(form.recurring);
      } else {
        await recarregar();
      }
      fecharModal();
      await carregarUniformes();
    } catch (error) {
      setErro(error.message || "Erro ao salvar evento");
    } finally {
      setSalvando(false);
    }
  };

  const abrirConfirmacaoExclusao = (evento) => {
    if (confirmCloseTimerRef.current) {
      clearTimeout(confirmCloseTimerRef.current);
      confirmCloseTimerRef.current = null;
    }
    const rotulo =
      evento.type === "no_expedient"
        ? evento.title || "Sem expediente"
        : evento.title || "este evento";

    setConfirmacao({
      aberto: true,
      visivel: false,
      evento,
      rotulo,
    });

    requestAnimationFrame(() => {
      setConfirmacao((atual) => ({ ...atual, visivel: true }));
    });
  };

  const fecharConfirmacaoExclusao = () => {
    setConfirmacao((atual) => ({ ...atual, visivel: false }));
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmacao(CONFIRMACAO_VAZIA);
      confirmCloseTimerRef.current = null;
    }, 200);
  };

  const confirmarExclusao = async () => {
    if (!confirmacao.evento) return;
    setErro("");
    setSucesso("");
    setExcluindoId(confirmacao.evento.id);
    try {
      await deleteEvent(confirmacao.evento.id);
      showSucesso("Evento excluído com sucesso");
      fecharConfirmacaoExclusao();
      await recarregar();
    } catch (error) {
      setErro(error.message || "Erro ao excluir evento");
    } finally {
      setExcluindoId(null);
    }
  };

  const renderCartao = (evento) => (
    <li
      key={evento.id}
      className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">
              {evento.type === "no_expedient"
                ? evento.title || rotuloTipo(evento.type)
                : evento.title}
            </span>
            {evento.recurring ? (
              <Info
                className="h-4 w-4 text-blue-700"
                title="Evento recorrente"
              />
            ) : evento.type !== "normal" && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                {rotuloTipo(evento.type)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              {evento.recurring ? (
                <>
                  <Repeat className="h-4 w-4" />
                  {rotuloRecorrencia(evento.weekdays)}
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  {formatarData(evento.eventDate)}
                </>
              )}
            </span>

            {evento.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {evento.startTime}
                {evento.endTime ? ` - ${evento.endTime}` : ""}
              </span>
            )}

            {evento.responsible && (
              <span className="flex items-center gap-1">
                <UserIcon className="h-4 w-4" />
                {evento.responsible}
              </span>
            )}

            {evento.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {evento.location}
              </span>
            )}
          </div>

          {evento.information && (
            <p className="mt-2 flex items-start gap-1 text-sm text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {evento.information}
            </p>
          )}

          {evento.uniforms?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {evento.uniforms.map((u) => (
                <span
                  key={u.id}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  title={u.description || ""}
                >
                  {u.uniform}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => abrirEdicao(evento)}
            className="rounded-lg p-2 text-blue-700 transition-colors hover:bg-blue-50"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => abrirConfirmacaoExclusao(evento)}
            disabled={excluindoId === evento.id}
            className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );

  const renderLista = (feed, bottomRef, vazioTexto) => {
    if (feed.carregando) {
      return <p className="py-8 text-center text-gray-500">Carregando...</p>;
    }
    if (feed.itens.length === 0) {
      return (
        <div className="py-10 text-center">
          <CalendarPlus className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">{vazioTexto}</p>
        </div>
      );
    }
    return (
      <>
        <ul className="space-y-3">{feed.itens.map(renderCartao)}</ul>
        {feed.hasMore && (
          <div ref={bottomRef} className="py-6 text-center text-sm text-gray-500">
            {feed.carregandoMais ? "Carregando mais..." : "Role para carregar mais"}
          </div>
        )}
      </>
    );
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <Sidebar usuario={usuario} />

      <div className="md:pl-64">
        <main className="mx-auto max-w-5xl px-4 py-8 pt-16 md:pt-8">
          {!podeAgenda ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Restrição de Acesso
              </h1>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Esta tela é exclusiva para usuários com os perfis{" "}
                <strong>Editor</strong>, <strong>Validador</strong> ou{" "}
                <strong>Aprovador</strong>. Seu perfil atual não possui permissão
                para incluir eventos na agenda.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="btn-primary"
              >
                Voltar ao Dashboard
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-blue-900">Agenda</h1>
                  <p className="text-sm text-gray-600">
                    Inclua eventos na agenda da{" "}
                    {usuario?.militaryOrganization?.acronym || "sua OM"}
                  </p>
                </div>
                <button
                  onClick={abrirNovo}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  Incluir evento
                </button>
              </div>

              <div className="card mb-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full rounded-lg border border-gray-200 bg-gray-50 p-1">
                    <button
                      type="button"
                      onClick={() => setAbaRecorrente(false)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        !abaRecorrente
                          ? "bg-blue-900 text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <Calendar className="h-4 w-4" />
                      Eventos por data
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbaRecorrente(true)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        abaRecorrente
                          ? "bg-blue-900 text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <Repeat className="h-4 w-4" />
                      Eventos recorrentes
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por evento, motivo, participantes, local ou responsável"
                  className="input-field"
                />

                {!abaRecorrente && (
                  <div ref={popupDataRef} className="relative mt-3 flex flex-wrap items-end gap-3">
                    <div className="flex flex-1 min-w-[130px] flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">
                        Data inicial
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        onFocus={() => setPopupDataAberto(true)}
                        className="input-field"
                      />
                    </div>
                    <div className="flex flex-1 min-w-[130px] flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">
                        Data final
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        onFocus={() => setPopupDataAberto(true)}
                        className="input-field"
                      />
                    </div>

                    {popupDataAberto && (
                      <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
                        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Seleção rápida
                        </p>
                        {[
                          { label: "Semana atual", offset: 0 },
                          { label: "Semana seguinte", offset: 1 },
                        ].map(({ label, offset }) => {
                          const intervalo = semanaIntervalo(offset);
                          return (
                            <button
                              key={label}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                aplicarSemana(offset);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900"
                            >
                              <span>{label}</span>
                              <span className="text-xs text-gray-400">
                                {rotuloSemana(intervalo)}
                              </span>
                            </button>
                          );
                        })}
                        <div className="h-1" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDateFromAplicada(dateFrom);
                        setDateToAplicada(dateTo);
                        carregarFeed({
                          recurring: false,
                          buscar: buscaAplicada,
                          pagina: 1,
                          append: false,
                          dFrom: dateFrom,
                          dTo: dateTo,
                        });
                      }}
                      className="btn-primary h-10 px-4 text-sm"
                    >
                      Filtrar
                    </button>
                    {(dateFromAplicada || dateToAplicada) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                          setDateFromAplicada("");
                          setDateToAplicada("");
                          carregarFeed({
                            recurring: false,
                            buscar: buscaAplicada,
                            pagina: 1,
                            append: false,
                            dFrom: "",
                            dTo: "",
                          });
                        }}
                        className="flex h-10 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <X className="h-4 w-4" />
                        Limpar datas
                      </button>
                    )}
                  </div>
                )}
              </div>

              {erro && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  {erro}
                </div>
              )}

              <div className="card">
                {renderLista(
                  feed,
                  bottomRef,
                  abaRecorrente
                    ? "Nenhum evento recorrente."
                    : "Nenhum evento por data."
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal de inclusão/edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              modalVisivel ? "opacity-100" : "opacity-0"
            }`}
            onClick={fecharModal}
          />
          <div
            className={`relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl transition-all duration-200 ${
              modalVisivel ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-blue-900">
                {editandoId ? "Editar evento" : "Incluir evento"}
              </h2>
              <button
                onClick={fecharModal}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {erro && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {erro}
              </div>
            )}

            <form onSubmit={salvar} className="space-y-4">
              {/* Tipo */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Tipo <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TIPOS.map((tipo) => (
                    <button
                      key={tipo.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: tipo.value })}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        form.type === tipo.value
                          ? "border-blue-900 bg-blue-900 text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {tipo.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recorrência */}
              <div className="rounded-lg border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.recurring}
                    onChange={(e) =>
                      setForm({ ...form, recurring: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900"
                  />
                  Recorrência semanal
                </label>

                {form.recurring ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-gray-500">
                      Selecione os dias da semana
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DIAS_SEMANA.map((dia) => (
                        <button
                          key={dia.value}
                          type="button"
                          onClick={() => alternarDiaSemana(dia.value)}
                          title={dia.label}
                          className={`h-9 w-12 rounded-lg border text-sm font-medium transition-colors ${
                            form.weekdays.includes(dia.value)
                              ? "border-blue-900 bg-blue-900 text-white"
                              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {dia.short}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <label className="mb-2 block text-xs text-gray-500">
                      Data <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.eventDate}
                      onChange={(e) =>
                        setForm({ ...form, eventDate: e.target.value })
                      }
                      className="input-field"
                    />
                  </div>
                )}
              </div>

              {/* Campos de dados (ocultos quando sem expediente) */}
              {!semDados && (
                <>
                  {/* Intervalo de horário */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Horário inicial <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={form.startTime}
                        onChange={(e) =>
                          setForm({ ...form, startTime: e.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Horário final{" "}
                        <span className="text-xs font-normal text-gray-400">
                          (opcional)
                        </span>
                      </label>
                      <input
                        type="time"
                        value={form.endTime}
                        onChange={(e) =>
                          setForm({ ...form, endTime: e.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Evento <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      placeholder="Ex.: Formatura geral"
                      className="input-field"
                    />
                  </div>

                  {/* Participantes */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Participantes <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.information}
                      onChange={(e) =>
                        setForm({ ...form, information: e.target.value })
                      }
                      placeholder="Ex.: Todo o efetivo"
                      className="input-field"
                      required
                    />
                  </div>

                  {/* Local */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Local <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) =>
                        setForm({ ...form, location: e.target.value })
                      }
                      placeholder="Ex.: Pátio principal"
                      className="input-field"
                      required
                    />
                  </div>

                  {/* Responsável */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Responsável <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.responsible}
                      onChange={(e) =>
                        setForm({ ...form, responsible: e.target.value })
                      }
                      placeholder="Ex.: Cap Silva"
                      className="input-field"
                      required
                    />
                  </div>

                  {/* Seletor de uniformes */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Uniformes <span className="text-red-500">*</span>
                    </label>
                    <p className="mb-2 text-xs text-gray-500">
                      Ordenados pelo mais utilizado
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                      {uniformesOrdenados.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500">
                          Nenhum uniforme cadastrado.
                        </p>
                      ) : (
                        <ul className="divide-y divide-gray-100">
                          {uniformesOrdenados.map((u) => (
                            <li key={u.id}>
                              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  checked={form.uniformIds.includes(u.id)}
                                  onChange={() => alternarUniforme(u.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900"
                                />
                                <span className="text-sm font-medium text-gray-900">
                                  {u.uniform}
                                </span>
                                {u.description && (
                                  <span className="truncate text-xs text-gray-500">
                                    {u.description}
                                  </span>
                                )}
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {form.uniformIds.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        {form.uniformIds.length} selecionado(s)
                      </p>
                    )}
                  </div>
                </>
              )}

              {semDados && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Motivo <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    rows={3}
                    placeholder="Ex.: Feriado, ponto facultativo, manutenção geral..."
                    className="input-field resize-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="btn-secondary"
                  disabled={salvando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={salvando}
                >
                  <Check className="h-4 w-4" />
                  {salvando
                    ? "Salvando..."
                    : editandoId
                    ? "Salvar"
                    : "Incluir"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        aberto={confirmacao.aberto}
        visivel={confirmacao.visivel}
        titulo="Excluir evento"
        descricao={`Tem certeza que deseja excluir "${confirmacao.rotulo}"? Esta ação não pode ser desfeita.`}
        confirmando={Boolean(confirmacao.evento && excluindoId === confirmacao.evento.id)}
        onCancelar={fecharConfirmacaoExclusao}
        onConfirmar={confirmarExclusao}
      />
    </div>
  );
}
