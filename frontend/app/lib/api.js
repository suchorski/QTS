// Serviço para chamar a API
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://qts-api.pamals.intraer";

export async function fetcher(url, options = {}) {
  const token = localStorage.getItem("token");

  const config = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro na requisição");
  }

  return response.json();
}

export async function login(cpf, password) {
  return fetcher(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ cpf, password }),
  });
}

export async function getMe() {
  return fetcher(`${API_BASE}/auth/me`);
}

export async function getMilitaryOrganizations() {
  return fetcher(`${API_BASE}/military-organizations`);
}

export async function getMyFieldOptions() {
  return fetcher(`${API_BASE}/me/field-options`);
}

export async function updateMyProfile(data) {
  return fetcher(`${API_BASE}/me/profile`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function uploadMySignature(blob) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("image", blob, "assinatura.png");

  const response = await fetch(`${API_BASE}/me/signature`, {
    method: "POST",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro na requisição");
  }

  return response.json();
}

export async function deleteMySignature() {
  return fetcher(`${API_BASE}/me/signature`, {
    method: "DELETE",
  });
}

export async function updateMySignaturePosition(offset, scale) {
  const body = { offset };
  if (scale !== undefined) {
    body.scale = scale;
  }
  return fetcher(`${API_BASE}/me/signature-position`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function uploadUserSignature(id, blob) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("image", blob, "assinatura.png");

  const response = await fetch(`${API_BASE}/users/${id}/signature`, {
    method: "POST",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro na requisição");
  }

  return response.json();
}

export async function deleteUserSignature(id) {
  return fetcher(`${API_BASE}/users/${id}/signature`, {
    method: "DELETE",
  });
}

export async function updateUserSignaturePosition(id, offset, scale) {
  const body = { offset };
  if (scale !== undefined) {
    body.scale = scale;
  }
  return fetcher(`${API_BASE}/users/${id}/signature-position`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function getUsers(page = 1, limit = 10, search = "", om = "") {
  const params = new URLSearchParams({
    page,
    limit,
    ...(search && { search }),
    ...(om && { om }),
  });

  return fetcher(
    `${API_BASE}/users?${params.toString()}`
  );
}

export async function getRoles() {
  return fetcher(`${API_BASE}/roles`);
}

export async function getFabImageSettings() {
  return fetcher(`${API_BASE}/system-settings/fab-image`);
}

export async function uploadFabImage(file) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`${API_BASE}/system-settings/fab-image`, {
    method: "POST",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro na requisição");
  }

  return response.json();
}

export async function getLocalOmSettings() {
  return fetcher(`${API_BASE}/local-settings/om`);
}

export async function updateLocalOmName(name) {
  return fetcher(`${API_BASE}/local-settings/om-name`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function uploadLocalOmImage(file) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`${API_BASE}/local-settings/om-image`, {
    method: "POST",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro na requisição");
  }

  return response.json();
}

export async function updateLocalOmSmtpSettings(data) {
  return fetcher(`${API_BASE}/local-settings/smtp`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function validateLocalOmSmtpSettings(data) {
  return fetcher(`${API_BASE}/local-settings/smtp/validate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUserRoles(id, roleIds, extraData = {}) {
  return fetcher(`${API_BASE}/users/${id}/roles`, {
    method: "PUT",
    body: JSON.stringify({ roleIds, ...extraData }),
  });
}

export async function getUserFieldOptions() {
  return fetcher(`${API_BASE}/users/field-options`);
}

export async function importUserByCpf(cpf) {
  return fetcher(`${API_BASE}/users/import-by-cpf`, {
    method: "POST",
    body: JSON.stringify({ cpf }),
  });
}

export async function updateUserFieldOptions(data) {
  return fetcher(`${API_BASE}/users/field-options`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getUsersByOM(omId, page = 1, limit = 10) {
  const params = new URLSearchParams({
    page,
    limit,
    omId,
  });

  return fetcher(
    `${API_BASE}/users?${params.toString()}`
  );
}

export async function getRanks(search = "") {
  const params = new URLSearchParams({
    ...(search && { search }),
  });

  const query = params.toString();
  return fetcher(`${API_BASE}/ranks${query ? `?${query}` : ""}`);
}

export async function createRank(data) {
  return fetcher(`${API_BASE}/ranks`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRank(id, data) {
  return fetcher(`${API_BASE}/ranks/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteRank(id) {
  return fetcher(`${API_BASE}/ranks/${id}`, {
    method: "DELETE",
  });
}

export async function getEvents({ search = "", page = 1, limit = 10, recurring, dateFrom, dateTo } = {}) {
  const params = new URLSearchParams({
    page,
    limit,
    ...(search && { search }),
    ...(recurring !== undefined && { recurring: String(recurring) }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });

  return fetcher(`${API_BASE}/events?${params.toString()}`);
}

export async function createEvent(data) {
  return fetcher(`${API_BASE}/events`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateEvent(id, data) {
  return fetcher(`${API_BASE}/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteEvent(id) {
  return fetcher(`${API_BASE}/events/${id}`, {
    method: "DELETE",
  });
}

export async function getEventRequests({
  search = "",
  page = 1,
  limit = 10,
  status = "",
} = {}) {
  const params = new URLSearchParams({
    page,
    limit,
    ...(search && { search }),
    ...(status && { status }),
  });

  return fetcher(`${API_BASE}/event-requests?${params.toString()}`);
}

export async function createEventRequest(data) {
  return fetcher(`${API_BASE}/event-requests`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateEventRequestStatus(id, status) {
  return fetcher(`${API_BASE}/event-requests/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function deleteEventRequest(id) {
  return fetcher(`${API_BASE}/event-requests/${id}`, {
    method: "DELETE",
  });
}

export async function getQtsPreview(dateFrom, dateTo) {
  const params = new URLSearchParams({ dateFrom, dateTo });
  return fetcher(`${API_BASE}/qts/preview?${params.toString()}`);
}

export async function getQtsList({ page = 1, limit = 10, status = "" } = {}) {
  const params = new URLSearchParams({
    page,
    limit,
    ...(status && { status }),
  });
  return fetcher(`${API_BASE}/qts?${params.toString()}`);
}

export async function getQts(id) {
  return fetcher(`${API_BASE}/qts/${id}`);
}

export async function getQtsApprovedList({ page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return fetcher(`${API_BASE}/qts/aprovados?${params.toString()}`);
}

export async function getQtsApproved(id) {
  return fetcher(`${API_BASE}/qts/aprovados/${id}`);
}

export async function getQtsHistoryList({
  page = 1,
  limit = 20,
  dateFrom = "",
  dateTo = "",
} = {}) {
  const params = new URLSearchParams({
    page,
    limit,
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });
  return fetcher(`${API_BASE}/qts/historico?${params.toString()}`);
}

export async function getQtsHistory(id) {
  return fetcher(`${API_BASE}/qts/historico/${id}`);
}

export async function shareQtsApproved(id) {
  return fetcher(`${API_BASE}/qts/aprovados/${id}/share`, {
    method: "POST",
  });
}

export async function shareQtsHistory(id) {
  return fetcher(`${API_BASE}/qts/historico/${id}/share`, {
    method: "POST",
  });
}

export async function getPublicSharedQts(id) {
  const response = await fetch(`${API_BASE}/qts/public/${encodeURIComponent(id)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Link de compartilhamento inválido");
  }
  return response.json();
}

export async function getPublicQtsByOmPeriod(om, periodo) {
  const response = await fetch(
    `${API_BASE}/qts/public/om/${encodeURIComponent(om)}/${encodeURIComponent(periodo)}`
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Não foi possível abrir o QTS");
  }
  return response.json();
}

export async function createQts(
  dateFrom,
  dateTo,
  observacao = "",
  excludedItemKeys = []
) {
  return fetcher(`${API_BASE}/qts`, {
    method: "POST",
    body: JSON.stringify({ dateFrom, dateTo, observacao, excludedItemKeys }),
  });
}

export async function updateQtsStatus(id, status) {
  return fetcher(`${API_BASE}/qts/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function deleteQts(id) {
  return fetcher(`${API_BASE}/qts/${id}`, {
    method: "DELETE",
  });
}

