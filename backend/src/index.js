import "express-async-errors";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import Busboy from "busboy";
import jwt from "jsonwebtoken";
import ldapjs from "ldapjs";
import dotenv from "dotenv";
import path from "path";
import sharp from "sharp";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const fabImageKey = "fab_image";
const fabImageFileName = "fab-image.webp";
const fabImageRelativePath = `/system/${fabImageFileName}`;
const fabImageAbsolutePath = path.join(publicDir, "system", fabImageFileName);
const omImageSettingPrefix = "om_image:";
const omSmtpSettingPrefix = "om_smtp:";
const userFieldOptionsSettingPrefix = "user_field_options:";
const MAX_FAB_IMAGE_SIZE = 8 * 1024 * 1024;
const signaturesDirName = "signatures";
const SIGNATURE_DISPLAY_HEIGHT = 150;
const SIGNATURE_OFFSET_MIN = -40;
const SIGNATURE_OFFSET_MAX = 40;
const SIGNATURE_SCALE_MIN = 0.5;
const SIGNATURE_SCALE_MAX = 2;
const SIGNATURE_SCALE_DEFAULT = 1;

async function parseImageUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FAB_IMAGE_SIZE, files: 1 },
    });

    let fileBuffer = Buffer.alloc(0);
    let fileMimeType = "";
    let sawFile = false;

    busboy.on("file", (fieldname, file, info) => {
      if (fieldname !== "image") {
        file.resume();
        return;
      }

      sawFile = true;
      fileMimeType = info?.mimeType || "";

      file.on("data", (chunk) => {
        fileBuffer = Buffer.concat([fileBuffer, chunk]);
        if (fileBuffer.length > MAX_FAB_IMAGE_SIZE) {
          reject(new ValidationError("O arquivo enviado excede o limite de 8MB"));
          file.resume();
        }
      });

      file.on("limit", () => reject(new ValidationError("O arquivo enviado excede o limite de 8MB")));
      file.on("error", reject);
    });

    busboy.on("finish", () => {
      if (!sawFile) {
        reject(new ValidationError("Selecione uma imagem para envio"));
        return;
      }

      resolve({ buffer: fileBuffer, mimeType: fileMimeType });
    });

    busboy.on("error", reject);
    req.pipe(busboy);
  });
}

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(publicDir, "favicon.png"));
});

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.status = 401;
  }
}

function validarCPF(cpf) {
  const cpfLimpo = String(cpf || "").replace(/\D/g, "");
  return cpfLimpo.length === 11;
}

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getBooleanEnv(name, fallback = false) {
  const value = String(getEnv(name, fallback ? "true" : "false"))
    .trim()
    .toLowerCase();

  return ["1", "true", "yes", "on"].includes(value);
}

function getAttrEnv(name, fallback) {
  const value = getEnv(name, fallback);
  const isValid = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value);
  return isValid ? value : fallback;
}

const LDAP_URL = getEnv("LDAP_URL");
const LDAP_BIND_DN = getEnv("LDAP_BIND_DN");
const LDAP_BIND_PASSWORD = getEnv("LDAP_BIND_PASSWORD");
const LDAP_BASE_DN = getEnv("LDAP_BASE_DN");
// Base de busca dos usuários (apenas contas reais). Evita encontrar dependentes
// ou outras entradas com o mesmo CPF fora da OU de contas.
const LDAP_USER_BASE_DN = getEnv("LDAP_USER_BASE_DN", `ou=contas,${LDAP_BASE_DN}`);
const LDAP_TIMEOUT_MS = Number(getEnv("LDAP_TIMEOUT_MS", "10000"));

const LDAP_UID_ATTRIBUTE = getAttrEnv("LDAP_UID_ATTRIBUTE", "uid");
const LDAP_SARAM_ATTRIBUTE = getAttrEnv("LDAP_SARAM_ATTRIBUTE", "FABnrodem");
const LDAP_MAIL_ATTRIBUTE = getAttrEnv("LDAP_MAIL_ATTRIBUTE", "mail");
const LDAP_NAME_ATTRIBUTE = getAttrEnv("LDAP_NAME_ATTRIBUTE", "cn");
const LDAP_OM_ATTRIBUTE = getAttrEnv("LDAP_OM_ATTRIBUTE", "FABomprest");
const LDAP_RANK_ATTRIBUTE = getAttrEnv("LDAP_RANK_ATTRIBUTE", "FABpostograd");
const LDAP_WARNAME_ATTRIBUTE = getAttrEnv("LDAP_WARNAME_ATTRIBUTE", "FABguerra");
const TEST_MODE = getBooleanEnv("TEST_MODE", false);

function firstValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  if (value === undefined || value === null) return "";
  return String(value);
}

function buildLdapAttributeMap(item) {
  const map = {};
  const object = item?.object || {};

  for (const [key, value] of Object.entries(object)) {
    if (key === "controls") continue;
    map[String(key).toLowerCase()] = value;
  }

  for (const attribute of item?.attributes || []) {
    const key = String(attribute?.type || "").toLowerCase();
    if (!key) continue;

    // ldapjs 3.x expõe os valores em `values`; `vals` é alias depreciado.
    const rawValues = attribute?.values ?? attribute?.vals;
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    map[key] = values
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value));
  }

  return map;
}

function readLdapAttribute(map, attributeName) {
  return firstValue(map?.[String(attributeName || "").toLowerCase()]);
}

function normalizeOptionalField(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function parseLdapEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(normalized) ? normalized : null;
}

function normalizeRequiredField(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new ValidationError(`${label} é obrigatório`);
  }
  return normalized;
}

function sanitizeEmail(value, label, { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw new ValidationError(`${label} é obrigatório`);
    }
    return null;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    throw new ValidationError(`${label} inválido`);
  }

  return normalized;
}

function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function sanitizeSmtpPort(value, fallback = 587) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ValidationError("Porta SMTP inválida");
  }
  return parsed;
}

function buildSmtpTransportConfig(smtp) {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.secure && smtp.allowInvalidCertificate
      ? {
          tls: {
            rejectUnauthorized: false,
          },
        }
      : {}),
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
  };
}

function buildSmtpValidationErrorMessage(error, smtpPayload) {
  const rawMessage = String(error?.message || "").trim();
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("wrong version number") || normalized.includes("ssl routines")) {
    const sugestao = smtpPayload?.port === 587
      ? "Na porta 587, desmarque 'Usar conexão segura (SSL/TLS)' e tente novamente."
      : "Use SSL/TLS na porta 465 e, para porta 587, deixe SSL/TLS desmarcado."
    return `Falha ao validar SMTP: incompatibilidade TLS/porta. ${sugestao}`;
  }

  if (normalized.includes("self signed certificate") || normalized.includes("unable to verify the first certificate")) {
    return "Falha ao validar SMTP: certificado não confiável. Se for certificado interno, marque a opção para aceitar certificado SSL autoassinado ou vencido.";
  }

  if (normalized.includes("eauth") || normalized.includes("invalid login") || normalized.includes("authentication unsuccessful")) {
    return "Falha ao validar SMTP: autenticação inválida. Verifique usuário e senha SMTP.";
  }

  if (normalized.includes("enotfound") || normalized.includes("getaddrinfo")) {
    return "Falha ao validar SMTP: servidor SMTP não encontrado. Verifique o host informado.";
  }

  if (normalized.includes("econnrefused")) {
    return "Falha ao validar SMTP: conexão recusada pelo servidor. Verifique host, porta e firewall.";
  }

  return `Falha ao validar SMTP: ${rawMessage || "Não foi possível conectar ao servidor SMTP"}`;
}

function buildOmSmtpPayloadFromRequest(body, current) {
  const enabled = sanitizeBoolean(body?.enabled, current.enabled);
  const host = String(body?.host || current.host || "").trim();
  const user = String(body?.user || current.user || "").trim();
  const senderName = String(body?.senderName || current.senderName || "").trim();
  const secure = sanitizeBoolean(body?.secure, current.secure);
  const allowInvalidCertificate = sanitizeBoolean(
    body?.allowInvalidCertificate,
    current.allowInvalidCertificate
  );
  const senderEmail = sanitizeEmail(body?.senderEmail || current.senderEmail || "", "Email do remetente");
  const recipientEmail = sanitizeEmail(
    body?.recipientEmail || current.recipientEmail || "",
    "Email destinatário",
    { required: enabled }
  );

  const passwordInput = String(body?.password || "").trim();
  const password = passwordInput || current.password || "";

  let port = current.port || 587;
  if (body?.port !== undefined || enabled || current.port) {
    port = sanitizeSmtpPort(body?.port ?? current.port ?? 587);
  }

  if (enabled) {
    if (!host) {
      throw new ValidationError("Servidor SMTP é obrigatório");
    }
    if (!user) {
      throw new ValidationError("Usuário SMTP é obrigatório");
    }
    if (!password) {
      throw new ValidationError("Senha SMTP é obrigatória");
    }
  }

  return {
    enabled,
    host,
    port,
    secure,
    allowInvalidCertificate,
    user,
    password,
    recipientEmail,
    senderEmail,
    senderName,
  };
}

function sanitizeUserFieldOptionsList(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ValidationError(`${label} deve ser uma lista`);
  }

  const uniqueByLower = new Map();
  for (const item of value) {
    const normalized = String(item || "").trim();
    if (!normalized) continue;
    if (normalized.length > 80) {
      throw new ValidationError(`${label} deve ter no máximo 80 caracteres por item`);
    }
    const key = normalized.toLocaleLowerCase("pt-BR");
    if (!uniqueByLower.has(key)) {
      uniqueByLower.set(key, normalized);
    }
  }

  const sanitized = [...uniqueByLower.values()];
  if (sanitized.length > 200) {
    throw new ValidationError(`${label} deve ter no máximo 200 opções`);
  }

  sanitized.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return sanitized;
}

async function getUserFieldOptionsByOmId(omId) {
  if (!omId) return { positions: [], corps: [] };

  const settingKey = `${userFieldOptionsSettingPrefix}${omId}`;
  const setting = await prisma.systemSetting.findUnique({ where: { settingKey } });

  if (!setting?.value) {
    return { positions: [], corps: [] };
  }

  try {
    const parsed = JSON.parse(setting.value);
    const parsedPositions = Array.isArray(parsed?.positions)
      ? parsed.positions
      : Array.isArray(parsed?.funcoes)
        ? parsed.funcoes
        : [];
    const parsedCorps = Array.isArray(parsed?.corps)
      ? parsed.corps
      : Array.isArray(parsed?.quadros)
        ? parsed.quadros
        : [];

    return {
      positions: parsedPositions
        .map((item) => String(item || "").trim())
        .filter(Boolean),
      corps: parsedCorps
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    };
  } catch {
    return { positions: [], corps: [] };
  }
}

async function getOmSmtpSettingsByOmId(omId, { includePassword = false } = {}) {
  if (!omId) {
    return {
      enabled: false,
      host: "",
      port: 587,
      secure: false,
      allowInvalidCertificate: false,
      user: "",
      password: "",
      hasPassword: false,
      recipientEmail: "",
      senderEmail: "",
      senderName: "",
    };
  }

  const settingKey = `${omSmtpSettingPrefix}${omId}`;
  const setting = await prisma.systemSetting.findUnique({ where: { settingKey } });

  if (!setting?.value) {
    return {
      enabled: false,
      host: "",
      port: 587,
      secure: false,
      allowInvalidCertificate: false,
      user: "",
      password: "",
      hasPassword: false,
      recipientEmail: "",
      senderEmail: "",
      senderName: "",
    };
  }

  try {
    const parsed = JSON.parse(setting.value);
    const password = String(parsed?.password || "");

    return {
      enabled: Boolean(parsed?.enabled),
      host: String(parsed?.host || ""),
      port: Number.parseInt(String(parsed?.port || "587"), 10) || 587,
      secure: Boolean(parsed?.secure),
      allowInvalidCertificate: Boolean(parsed?.allowInvalidCertificate),
      user: String(parsed?.user || ""),
      password: includePassword ? password : "",
      hasPassword: password.length > 0,
      recipientEmail: String(parsed?.recipientEmail || ""),
      senderEmail: String(parsed?.senderEmail || ""),
      senderName: String(parsed?.senderName || ""),
    };
  } catch {
    return {
      enabled: false,
      host: "",
      port: 587,
      secure: false,
      allowInvalidCertificate: false,
      user: "",
      password: "",
      hasPassword: false,
      recipientEmail: "",
      senderEmail: "",
      senderName: "",
    };
  }
}

function buildMailFromHeader(senderEmail, senderName) {
  if (!senderName) return senderEmail;
  return `${senderName} <${senderEmail}>`;
}

async function sendQtsApprovedEmail({ omId, qtsId, approvedByName, dateLabel }) {
  const smtp = await getOmSmtpSettingsByOmId(omId, { includePassword: true });
  if (!smtp.enabled) {
    return { attempted: false, sent: false, reason: "disabled" };
  }

  if (!smtp.host || !smtp.user || !smtp.password || !smtp.recipientEmail) {
    return { attempted: false, sent: false, reason: "incomplete-config" };
  }

  const om = await prisma.militaryOrganization.findUnique({
    where: { id: omId },
    select: { acronym: true, name: true },
  });

  const transporter = nodemailer.createTransport(buildSmtpTransportConfig(smtp));

  const link = buildPublicQtsLink(qtsId);
  const omLabel = om?.acronym || om?.name || "OM";
  const assunto = `Novo QTS Aprovado - ${omLabel}`;
  const fromEmail = smtp.senderEmail || smtp.user;
  const fromName = smtp.senderName || "Sistema QTS";

  const texto = [
    "Novo QTS Aprovado",
    "",
    `Informamos que um novo QTS foi aprovado para a OM ${omLabel}.`,
    "",
    `Período: ${dateLabel}`,
    "",
    `Visualizar o QTS Aprovado: ${link}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">Novo QTS Aprovado</h2>
      <p style="margin: 0 0 8px;">Informamos que um novo QTS foi aprovado para a OM <strong>${omLabel}</strong>.</p>
      <p style="margin: 0 0 8px;"><strong>Período:</strong> ${dateLabel}</p>
      <p style="margin: 0 0 16px;"><a href="${link}">Visualizar o QTS Aprovado</a></p>
    </div>
  `;

  await transporter.sendMail({
    from: buildMailFromHeader(fromEmail, fromName),
    to: smtp.recipientEmail,
    subject: assunto,
    text: texto,
    html,
  });

  return { attempted: true, sent: true, recipientEmail: smtp.recipientEmail };
}

function buildUserDataFromLDAP(ldapUser, militaryOrganizationId, rankId, fallbackName) {
  const ldapName = String(ldapUser?.name || "").trim();

  return {
    name: ldapName || fallbackName,
    warName: normalizeOptionalField(ldapUser?.warName),
    email: parseLdapEmail(ldapUser?.email),
    saram: normalizeOptionalField(ldapUser?.saram),
    militaryOrganizationId,
    rankId: rankId || null,
  };
}

function escapeLdapFilterValue(value) {
  return String(value)
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

function criarClienteLDAP() {
  return ldapjs.createClient({
    url: LDAP_URL,
    timeout: LDAP_TIMEOUT_MS,
    connectTimeout: LDAP_TIMEOUT_MS,
    reconnect: true,
  });
}

async function bindAsync(client, dn, password) {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function unbindSafe(client) {
  return new Promise((resolve) => {
    client.unbind(() => resolve());
  });
}

async function buscarNoLDAP(cpf) {
  const client = criarClienteLDAP();
  const filtro = `(${LDAP_UID_ATTRIBUTE}=${escapeLdapFilterValue(cpf)})`;
  const attributes = [
    LDAP_UID_ATTRIBUTE,
    LDAP_NAME_ATTRIBUTE,
    LDAP_MAIL_ATTRIBUTE,
    LDAP_RANK_ATTRIBUTE,
    LDAP_SARAM_ATTRIBUTE,
    LDAP_OM_ATTRIBUTE,
    LDAP_WARNAME_ATTRIBUTE,
  ];

  try {
    await bindAsync(client, LDAP_BIND_DN, LDAP_BIND_PASSWORD);

    const entry = await new Promise((resolve, reject) => {
      client.search(
        LDAP_USER_BASE_DN,
        {
          filter: filtro,
          attributes,
          scope: "sub",
          paged: false,
        },
        (err, res) => {
          if (err) return reject(err);

          let found = null;

          res.on("searchEntry", (item) => {
            const attrs = buildLdapAttributeMap(item);
            // ldapjs 3.x: o DN fica em item.objectName (não mais em item.dn).
            const dn =
              item.objectName?.toString?.() ||
              item.dn?.toString?.() ||
              item.pojo?.objectName ||
              readLdapAttribute(attrs, "dn") ||
              "";
            found = {
              dn,
              cpf: readLdapAttribute(attrs, LDAP_UID_ATTRIBUTE),
              name: readLdapAttribute(attrs, LDAP_NAME_ATTRIBUTE),
              email: parseLdapEmail(readLdapAttribute(attrs, LDAP_MAIL_ATTRIBUTE)),
              rank: readLdapAttribute(attrs, LDAP_RANK_ATTRIBUTE),
              saram: readLdapAttribute(attrs, LDAP_SARAM_ATTRIBUTE),
              om: readLdapAttribute(attrs, LDAP_OM_ATTRIBUTE),
              warName: readLdapAttribute(attrs, LDAP_WARNAME_ATTRIBUTE),
            };
          });

          res.on("error", (searchErr) => {
            // Com sizeLimit, o servidor pode responder SizeLimitExceeded mesmo
            // após já termos recebido a entrada desejada. Nesse caso, tratamos
            // como sucesso em vez de erro interno.
            if (searchErr?.name === "SizeLimitExceededError") {
              return resolve(found);
            }
            reject(searchErr);
          });
          res.on("end", () => resolve(found));
        }
      );
    });

    return entry;
  } finally {
    await unbindSafe(client);
  }
}

async function validarSenhaLDAP(userDn, senha) {
  const client = criarClienteLDAP();
  try {
    await bindAsync(client, userDn, senha);
    return true;
  } catch {
    return false;
  } finally {
    await unbindSafe(client);
  }
}

function gerarToken(userId, roles) {
  const secret = getEnv("NEXTAUTH_SECRET");
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET não configurado");
  }

  return jwt.sign({ userId, roles }, secret, { expiresIn: "7d" });
}

function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, getEnv("NEXTAUTH_SECRET"));
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

async function upsertOmPorSigla(acronymRaw) {
  const acronym = String(acronymRaw || "SEM OM").trim() || "SEM OM";

  return prisma.militaryOrganization.upsert({
    where: { acronym },
    update: { active: true },
    create: {
      acronym,
      active: true,
    },
  });
}

async function upsertRankByAcronym(acronymRaw) {
  const acronym = String(acronymRaw || "").trim();
  if (!acronym) return null;

  return prisma.rank.upsert({
    where: { acronym },
    update: { active: true },
    create: {
      acronym,
      active: true,
    },
  });
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Página intermediária para liberar o certificado SSL (CA interna).
// Quando uma máquina sem a CA raiz acessa o frontend, as chamadas à API são
// bloqueadas pelo navegador. Ao navegar diretamente para esta rota, o navegador
// exibe a tela de aceite de exceção do certificado. Após o aceite, redireciona
// de volta ao frontend. O destino é validado contra a origem permitida para
// evitar open redirect.
app.get("/trust", (req, res) => {
  const frontendUrl = getEnv("FRONTEND_URL", getEnv("NEXTAUTH_URL"));
  let dest = frontendUrl || "/";

  const target = req.query.return;
  if (target && frontendUrl) {
    try {
      const requested = new URL(String(target));
      const allowed = new URL(frontendUrl);
      if (requested.origin === allowed.origin) {
        dest = requested.toString();
      }
    } catch {
      // mantém o destino padrão
    }
  }

  res.redirect(302, dest);
});

app.post("/auth/login", async (req, res) => {
  const { cpf, password } = req.body;

  if (!cpf || !password) {
    throw new ValidationError("CPF e senha são obrigatórios");
  }

  if (!validarCPF(cpf)) {
    throw new ValidationError("CPF inválido");
  }

  if (!LDAP_URL || !LDAP_BIND_DN || !LDAP_BIND_PASSWORD || !LDAP_BASE_DN) {
    throw new Error("Configurações LDAP incompletas no .env");
  }

  const cpfLimpo = String(cpf).replace(/\D/g, "");

  const ldapUser = await buscarNoLDAP(cpfLimpo);
  if (!ldapUser || !ldapUser.dn) {
    throw new AuthenticationError("Credenciais inválidas");
  }

  if (!ldapUser.email) {
    throw new AuthenticationError(
      "Cadastro LDAP sem e-mail válido. Procure o suporte para regularizar seu e-mail institucional."
    );
  }

  // Em modo de teste, mantém a exigência de CPF existente no LDAP,
  // mas ignora a validação da senha para facilitar homologação.
  if (!TEST_MODE) {
    const senhaValidaLDAP = await validarSenhaLDAP(ldapUser.dn, password);
    if (!senhaValidaLDAP) {
      throw new AuthenticationError("Credenciais inválidas");
    }
  } else {
    console.warn("[AUTH] TEST_MODE ativo: senha LDAP ignorada para login");
  }

  const om = await upsertOmPorSigla(ldapUser.om);
  const rank = await upsertRankByAcronym(ldapUser.rank);

  let user = await prisma.user.findUnique({
    where: { cpf: cpfLimpo },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });

  const userDataFromLDAP = buildUserDataFromLDAP(
    ldapUser,
    om.id,
    rank?.id || null,
    user?.name || cpfLimpo
  );

  console.log("📝 Extracted LDAP data:", JSON.stringify(ldapUser, null, 2));
  console.log("🔄 Data to synchronize:", JSON.stringify(userDataFromLDAP, null, 2));

  if (!user) {
    console.log("✨ Creating new user with LDAP data");
    user = await prisma.user.create({
      data: {
        cpf: cpfLimpo,
        ...userDataFromLDAP,
        passwordHash: "",
      },
      include: {
        militaryOrganization: true,
        rank: true,
        userRoles: { include: { role: true } },
      },
    });
  } else {
    console.log("🔁 Updating existing user with LDAP data");
    console.log("Before:", {
      name: user.name,
      email: user.email,
      saram: user.saram,
      rankId: user.rankId,
    });
    user = await prisma.user.update({
      where: { id: user.id },
      data: userDataFromLDAP,
      include: {
        militaryOrganization: true,
        rank: true,
        userRoles: { include: { role: true } },
      },
    });
    console.log("After:", {
      name: user.name,
      email: user.email,
      saram: user.saram,
      rankId: user.rankId,
    });
  }

  if (!user.active) {
    throw new AuthenticationError("Usuário inativo");
  }

  await prisma.loginAudit.create({
    data: {
      userId: user.id,
      success: true,
      ipAddress: req.ip,
    },
  });

  const roles = user.userRoles.map((ur) => ({
    id: ur.role.id,
    code: ur.role.code,
    name: ur.role.name,
  }));

  const token = gerarToken(user.id, roles);

  res.json({
    token,
    user: {
      id: user.id,
      cpf: user.cpf,
      name: user.name,
      warName: user.warName,
      email: user.email,
      rank: user.rank,
      saram: user.saram,
      position: user.position,
      corps: user.corps,
      militaryOrganization: user.militaryOrganization,
      roles,
    },
  });
});

app.get("/auth/me", verificarToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });


  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  res.json({
    id: user.id,
    cpf: user.cpf,
    name: user.name,
    warName: user.warName,
    email: user.email,
    rank: user.rank,
    saram: user.saram,
    position: user.position,
    corps: user.corps,
    signatureUrl: user.signatureUrl,
    signatureOffset: user.signatureOffset,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
    militaryOrganization: user.militaryOrganization,
    roles: user.userRoles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
    })),
  });
});

app.get("/military-organizations", verificarToken, async (_req, res) => {
  const militaryOrganizations = await prisma.militaryOrganization.findMany({
    where: { active: true },
    orderBy: [{ acronym: "asc" }, { name: "asc" }],
    select: { id: true, acronym: true, name: true },
  });

  res.json({ data: militaryOrganizations });
});

// Opções de funções/quadros da OM do usuário logado (para a tela de perfil)
app.get("/me/field-options", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.json({ positions: [], corps: [] });
  }
  const options = await getUserFieldOptionsByOmId(omId);
  res.json(options);
});

// Atualização do próprio perfil: somente função (position) e quadro (corps)
app.put("/me/profile", verificarToken, async (req, res) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "position")) {
    data.position = normalizeOptionalField(req.body?.position);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "corps")) {
    data.corps = normalizeOptionalField(req.body?.corps);
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data,
    select: { id: true, position: true, corps: true },
  });

  res.json(user);
});

// Processa e armazena a assinatura de um usuário (recebe PNG/WebP com fundo
// transparente, recorta as bordas e padroniza a altura).
async function storeSignatureForUser(userId, parsedFile) {
  if (!["image/png", "image/webp"].includes(parsedFile.mimeType)) {
    throw new ValidationError("Envie a assinatura em PNG com fundo transparente");
  }

  const fileName = `${userId}.png`;
  const relativePath = `/${signaturesDirName}/${fileName}`;
  const absolutePath = path.join(publicDir, signaturesDirName, fileName);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  await sharp(parsedFile.buffer)
    .ensureAlpha()
    .trim()
    .resize({ height: SIGNATURE_DISPLAY_HEIGHT, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(absolutePath);

  return prisma.user.update({
    where: { id: userId },
    data: { signatureUrl: relativePath },
    select: { signatureUrl: true, signatureOffset: true, signatureScale: true, updatedAt: true },
  });
}

async function removeSignatureForUser(userId) {
  const absolutePath = path.join(publicDir, signaturesDirName, `${userId}.png`);
  await fs.rm(absolutePath, { force: true });
  await prisma.user.update({
    where: { id: userId },
    data: { signatureUrl: null },
  });
}

async function setSignatureOffsetForUser(userId, rawOffset, rawScale) {
  const data = {};

  if (rawOffset !== undefined) {
    const raw = Number(rawOffset);
    if (!Number.isFinite(raw)) {
      throw new ValidationError("Posição inválida");
    }
    data.signatureOffset = Math.max(
      SIGNATURE_OFFSET_MIN,
      Math.min(SIGNATURE_OFFSET_MAX, Math.round(raw))
    );
  }

  if (rawScale !== undefined) {
    const numericScale = Number(rawScale);
    if (!Number.isFinite(numericScale)) {
      throw new ValidationError("Escala inválida");
    }
    data.signatureScale = Math.max(
      SIGNATURE_SCALE_MIN,
      Math.min(SIGNATURE_SCALE_MAX, Math.round(numericScale * 100) / 100)
    );
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError("Nenhum ajuste de assinatura informado");
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: { signatureOffset: true, signatureScale: true },
  });
}

// Upload da assinatura: recebe um PNG com fundo transparente (já removido no
// navegador), recorta as bordas transparentes e padroniza a altura.
app.post("/me/signature", verificarToken, async (req, res) => {
  const parsedFile = await parseImageUpload(req);
  const user = await storeSignatureForUser(req.user.userId, parsedFile);

  res.json({
    signatureUrl: user.signatureUrl,
    signatureOffset: user.signatureOffset,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
    updatedAt: user.updatedAt.toISOString(),
  });
});

// Remove a assinatura do usuário logado
app.delete("/me/signature", verificarToken, async (req, res) => {
  await removeSignatureForUser(req.user.userId);
  res.json({ signatureUrl: null });
});

// Posicionamento vertical da assinatura sobre a linha
app.put("/me/signature-position", verificarToken, async (req, res) => {
  const user = await setSignatureOffsetForUser(
    req.user.userId,
    req.body?.offset,
    req.body?.scale
  );
  res.json({
    signatureOffset: user.signatureOffset,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
  });
});

// Gestão de assinatura pelos administradores (global em qualquer OM; local
// apenas nos militares da própria OM).
async function getUserForSignatureManagement(req, targetId) {
  const { isGlobalAdmin, isLocalAdmin } = await getAdminFlags(req.user.userId);

  if (!isGlobalAdmin && !isLocalAdmin) {
    const error = new Error("Acesso negado");
    error.status = 403;
    throw error;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, militaryOrganizationId: true },
  });

  if (!target) {
    const error = new Error("Usuário não encontrado");
    error.status = 404;
    throw error;
  }

  if (!isGlobalAdmin) {
    const omId = await getCurrentUserOmId(req.user.userId);
    if (!omId || target.militaryOrganizationId !== omId) {
      const error = new Error("Acesso negado");
      error.status = 403;
      throw error;
    }
  }

  return target;
}

app.post("/users/:id/signature", verificarToken, async (req, res) => {
  const target = await getUserForSignatureManagement(req, req.params.id);
  const parsedFile = await parseImageUpload(req);
  const user = await storeSignatureForUser(target.id, parsedFile);

  res.json({
    signatureUrl: user.signatureUrl,
    signatureOffset: user.signatureOffset,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
    updatedAt: user.updatedAt.toISOString(),
  });
});

app.delete("/users/:id/signature", verificarToken, async (req, res) => {
  const target = await getUserForSignatureManagement(req, req.params.id);
  await removeSignatureForUser(target.id);
  res.json({ signatureUrl: null });
});

app.put("/users/:id/signature-position", verificarToken, async (req, res) => {
  const target = await getUserForSignatureManagement(req, req.params.id);
  const user = await setSignatureOffsetForUser(
    target.id,
    req.body?.offset,
    req.body?.scale
  );
  res.json({
    signatureOffset: user.signatureOffset,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
  });
});

app.get(
  "/system-settings/fab-image",
  verificarToken,
  exigirAdminGlobal,
  async (req, res) => {
    const setting = await prisma.systemSetting.findUnique({
      where: { settingKey: fabImageKey },
    });

    try {
      const stats = await fs.stat(fabImageAbsolutePath);
      res.json({
        imageUrl: setting?.value || fabImageRelativePath,
        updatedAt: stats.mtime.toISOString(),
      });
    } catch {
      res.json({
        imageUrl: setting?.value || null,
        updatedAt: setting?.updatedAt?.toISOString() || null,
      });
    }
  }
);

app.post(
  "/system-settings/fab-image",
  verificarToken,
  exigirAdminGlobal,
  async (req, res) => {
    const parsedFile = await parseImageUpload(req);

    if (!["image/png", "image/webp"].includes(parsedFile.mimeType)) {
      throw new ValidationError("Envie um arquivo PNG ou WebP");
    }

    await fs.mkdir(path.dirname(fabImageAbsolutePath), { recursive: true });

    await sharp(parsedFile.buffer)
      .resize({
        height: 400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 6 })
      .toFile(fabImageAbsolutePath);

    await prisma.systemSetting.upsert({
      where: { settingKey: fabImageKey },
      update: { value: fabImageRelativePath },
      create: { settingKey: fabImageKey, value: fabImageRelativePath },
    });

    const stats = await fs.stat(fabImageAbsolutePath);

    res.json({
      imageUrl: fabImageRelativePath,
      updatedAt: stats.mtime.toISOString(),
    });
  }
);

app.get("/local-settings/om", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const settingKey = `${omImageSettingPrefix}${omId}`;
  const setting = await prisma.systemSetting.findUnique({ where: { settingKey } });

  const om = await prisma.militaryOrganization.findUnique({
    where: { id: omId },
    select: { id: true, acronym: true, name: true },
  });

  const smtp = await getOmSmtpSettingsByOmId(omId);

  res.json({
    militaryOrganization: om,
    imageUrl: setting?.value || null,
    updatedAt: setting?.updatedAt?.toISOString() || null,
    smtp: {
      enabled: smtp.enabled,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      allowInvalidCertificate: smtp.allowInvalidCertificate,
      user: smtp.user,
      recipientEmail: smtp.recipientEmail,
      senderEmail: smtp.senderEmail,
      senderName: smtp.senderName,
      hasPassword: smtp.hasPassword,
    },
  });
});

app.put("/local-settings/om-name", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const fullName = String(req.body?.name || "").trim();
  if (!fullName) {
    throw new ValidationError("Informe o nome por extenso da OM");
  }

  const om = await prisma.militaryOrganization.update({
    where: { id: omId },
    data: { name: fullName },
    select: { id: true, acronym: true, name: true },
  });

  res.json({ militaryOrganization: om });
});

app.post("/local-settings/om-image", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const parsedFile = await parseImageUpload(req);

  if (!["image/png", "image/webp"].includes(parsedFile.mimeType)) {
    throw new ValidationError("Envie um arquivo PNG ou WebP");
  }

  const fileName = `${omId}.webp`;
  const relativePath = `/oms/${fileName}`;
  const absolutePath = path.join(publicDir, "oms", fileName);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  await sharp(parsedFile.buffer)
    .resize({
      height: 400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 6 })
    .toFile(absolutePath);

  const settingKey = `${omImageSettingPrefix}${omId}`;
  await prisma.systemSetting.upsert({
    where: { settingKey },
    update: { value: relativePath },
    create: { settingKey, value: relativePath },
  });

  const stats = await fs.stat(absolutePath);

  res.json({
    imageUrl: relativePath,
    updatedAt: stats.mtime.toISOString(),
  });
});

app.put("/local-settings/smtp", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const current = await getOmSmtpSettingsByOmId(omId, { includePassword: true });
  const smtpPayload = buildOmSmtpPayloadFromRequest(req.body, current);

  const settingKey = `${omSmtpSettingPrefix}${omId}`;

  await prisma.systemSetting.upsert({
    where: { settingKey },
    update: { value: JSON.stringify(smtpPayload) },
    create: { settingKey, value: JSON.stringify(smtpPayload) },
  });

  res.json({
    smtp: {
      enabled: smtpPayload.enabled,
      host: smtpPayload.host,
      port: smtpPayload.port,
      secure: smtpPayload.secure,
      allowInvalidCertificate: smtpPayload.allowInvalidCertificate,
      user: smtpPayload.user,
      recipientEmail: smtpPayload.recipientEmail,
      senderEmail: smtpPayload.senderEmail,
      senderName: smtpPayload.senderName,
      hasPassword: Boolean(smtpPayload.password),
    },
  });
});

app.post("/local-settings/smtp/validate", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const current = await getOmSmtpSettingsByOmId(omId, { includePassword: true });
  const smtpPayload = buildOmSmtpPayloadFromRequest(req.body, current);

  if (!smtpPayload.enabled) {
    return res.json({
      valid: true,
      message: "SMTP desativado. Nada para validar.",
    });
  }

  try {
    const transporter = nodemailer.createTransport(buildSmtpTransportConfig(smtpPayload));
    await transporter.verify();

    return res.json({
      valid: true,
      message: "Conexão SMTP validada com sucesso.",
    });
  } catch (error) {
    throw new ValidationError(buildSmtpValidationErrorMessage(error, smtpPayload));
  }
});

app.get("/users", verificarToken, async (req, res) => {
  const { page = "1", limit = "10", search = "", om = "" } = req.query;
  const { isGlobalAdmin, isLocalAdmin } = await getAdminFlags(req.user.userId);

  if (!isGlobalAdmin && !isLocalAdmin) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const where = { active: true };

  if (!isGlobalAdmin) {
    const current = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { militaryOrganizationId: true },
    });
    where.militaryOrganizationId = current?.militaryOrganizationId || "";
  } else if (String(om).trim()) {
    where.militaryOrganization = { acronym: { contains: String(om).trim() } };
  }

  const term = String(search).trim();
  if (term) {
    where.OR = [
      { name: { contains: term } },
      { warName: { contains: term } },
      { cpf: { contains: term.replace(/\D/g, "") } },
      { saram: { contains: term } },
      { rank: { acronym: { contains: term } } },
      { rank: { reducedName: { contains: term } } },
      { rank: { name: { contains: term } } },
    ];
  }

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        militaryOrganization: true,
        rank: true,
        userRoles: { include: { role: true } },
      },
      skip,
      take: limitNum,
      orderBy: [{ warName: "asc" }, { name: "asc" }],
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    data: users.map((u) => ({
      id: u.id,
      cpf: u.cpf,
      name: u.name,
      warName: u.warName,
      email: u.email,
      rank: u.rank,
      saram: u.saram,
      position: u.position,
      corps: u.corps,
      signatureUrl: u.signatureUrl,
      signatureOffset: u.signatureOffset,
      signatureScale: u.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
      updatedAt: u.updatedAt,
      militaryOrganization: u.militaryOrganization,
      roles: u.userRoles.map((ur) => ur.role),
      active: u.active,
    })),
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

app.get("/users/field-options", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const options = await getUserFieldOptionsByOmId(omId);
  res.json(options);
});

app.put("/users/field-options", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const current = await getUserFieldOptionsByOmId(omId);
  const positionsInput = req.body?.positions ?? req.body?.funcoes;
  const corpsInput = req.body?.corps ?? req.body?.quadros;

  const positions = sanitizeUserFieldOptionsList(positionsInput, "Positions") ?? current.positions;
  const corps = sanitizeUserFieldOptionsList(corpsInput, "Corps") ?? current.corps;

  const settingKey = `${userFieldOptionsSettingPrefix}${omId}`;
  await prisma.systemSetting.upsert({
    where: { settingKey },
    update: { value: JSON.stringify({ positions, corps }) },
    create: { settingKey, value: JSON.stringify({ positions, corps }) },
  });

  res.json({ positions, corps });
});

// Importar usuário pelo CPF via LDAP (admin local ou global, somente da própria OM)
app.post("/users/import-by-cpf", verificarToken, exigirAdminLocalOuGlobal, async (req, res) => {
  const { cpf } = req.body;

  if (!cpf) {
    throw new ValidationError("CPF é obrigatório");
  }

  const cpfLimpo = String(cpf).replace(/\D/g, "");
  if (!validarCPF(cpfLimpo)) {
    throw new ValidationError("CPF inválido");
  }

  // Determinar a OM do admin solicitante
  const adminOmId = await getCurrentUserOmId(req.user.userId);
  if (!adminOmId) {
    return res.status(403).json({ error: "Administrador sem OM vinculada" });
  }

  const adminOm = await prisma.militaryOrganization.findUnique({
    where: { id: adminOmId },
    select: { acronym: true },
  });

  // Buscar no LDAP
  const ldapUser = await buscarNoLDAP(cpfLimpo);
  if (!ldapUser || !ldapUser.dn) {
    throw new ValidationError("CPF não encontrado no LDAP");
  }

  // Verificar se a OM do usuário encontrado é a mesma do admin
  const omLdapAcronym = String(ldapUser.om || "").trim();
  const omAdminAcronym = String(adminOm?.acronym || "").trim();
  if (!omLdapAcronym || omLdapAcronym !== omAdminAcronym) {
    return res.status(403).json({
      error: `O militar pertence à OM "${omLdapAcronym || "desconhecida"}", não à sua OM (${omAdminAcronym}). Somente usuários da própria OM podem ser importados.`,
    });
  }

  const om = await upsertOmPorSigla(ldapUser.om);
  const rank = await upsertRankByAcronym(ldapUser.rank);

  let user = await prisma.user.findUnique({
    where: { cpf: cpfLimpo },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });

  const userDataFromLDAP = buildUserDataFromLDAP(
    ldapUser,
    om.id,
    rank?.id || null,
    user?.name || cpfLimpo
  );

  if (!user) {
    user = await prisma.user.create({
      data: {
        cpf: cpfLimpo,
        ...userDataFromLDAP,
        passwordHash: "",
      },
      include: {
        militaryOrganization: true,
        rank: true,
        userRoles: { include: { role: true } },
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: userDataFromLDAP,
      include: {
        militaryOrganization: true,
        rank: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  res.json({
    id: user.id,
    cpf: user.cpf,
    name: user.name,
    warName: user.warName,
    email: user.email,
    rank: user.rank,
    saram: user.saram,
    position: user.position,
    corps: user.corps,
    signatureUrl: user.signatureUrl,
    signatureOffset: user.signatureOffset,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
    militaryOrganization: user.militaryOrganization,
    roles: user.userRoles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
    })),
    updatedAt: user.updatedAt,
  });
});

app.get("/users/:id", verificarToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  res.json({
    id: user.id,
    cpf: user.cpf,
    name: user.name,
    warName: user.warName,
    email: user.email,
    rank: user.rank,
    saram: user.saram,
    position: user.position,
    corps: user.corps,
    militaryOrganization: user.militaryOrganization,
    roles: user.userRoles.map((ur) => ur.role),
    active: user.active,
  });
});

app.put("/users/:id", verificarToken, async (req, res) => {
  const isSelf = req.user.userId === req.params.id;
  const { isGlobalAdmin } = await getAdminFlags(req.user.userId);

  if (!isSelf && !isGlobalAdmin) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const { name, warName, email, rankId, saram, position, corps, militaryOrganizationId, active } = req.body;

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(warName !== undefined && { warName }),
      ...(email !== undefined && { email }),
      ...(rankId !== undefined && { rankId }),
      ...(saram !== undefined && { saram }),
      ...(position !== undefined && { position: normalizeOptionalField(position) }),
      ...(corps !== undefined && { corps: normalizeOptionalField(corps) }),
      ...(militaryOrganizationId !== undefined && { militaryOrganizationId }),
      ...(active !== undefined && isGlobalAdmin && { active }),
    },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });

  res.json({
    id: user.id,
    cpf: user.cpf,
    name: user.name,
    warName: user.warName,
    email: user.email,
    rank: user.rank,
    saram: user.saram,
    position: user.position,
    corps: user.corps,
    militaryOrganization: user.militaryOrganization,
    roles: user.userRoles.map((ur) => ur.role),
    active: user.active,
  });
});

app.get("/roles", verificarToken, async (req, res) => {
  const { isGlobalAdmin, isLocalAdmin } = await getAdminFlags(req.user.userId);

  if (!isGlobalAdmin && !isLocalAdmin) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const roles = await prisma.role.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, code: true, name: true, description: true },
  });

  res.json({ data: roles });
});

app.put("/users/:id/roles", verificarToken, async (req, res) => {
  const { isGlobalAdmin, isLocalAdmin } = await getAdminFlags(req.user.userId);

  if (!isGlobalAdmin && !isLocalAdmin) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!target) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  // Administrador local só gerencia usuários da própria OM
  if (!isGlobalAdmin) {
    const current = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { militaryOrganizationId: true },
    });
    if (target.militaryOrganizationId !== current?.militaryOrganizationId) {
      return res.status(403).json({ error: "Acesso negado" });
    }
  }

  const requestedIds = Array.isArray(req.body?.roleIds)
    ? [...new Set(req.body.roleIds.map((id) => String(id)).filter(Boolean))]
    : [];

  const allRoles = await prisma.role.findMany({
    where: { active: true },
    select: { id: true, code: true },
  });
  const validIds = new Set(allRoles.map((r) => r.id));

  for (const id of requestedIds) {
    if (!validIds.has(id)) {
      throw new ValidationError("Um ou mais perfis selecionados são inválidos");
    }
  }

  const globalRoleId = allRoles.find((r) => r.code === "admin_global")?.id;
  const targetHadGlobal = target.userRoles.some(
    (ur) => ur.role.code === "admin_global"
  );

  let finalIds = new Set(requestedIds);

  // Somente administradores globais podem conceder/remover o perfil Admin Global
  if (!isGlobalAdmin && globalRoleId) {
    if (targetHadGlobal) {
      finalIds.add(globalRoleId); // não pode remover
    } else {
      finalIds.delete(globalRoleId); // não pode conceder
    }
  }

  const finalIdsArray = [...finalIds];
  const updateUserData = {};
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "position")) {
    updateUserData.position = normalizeOptionalField(req.body?.position);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "corps")) {
    updateUserData.corps = normalizeOptionalField(req.body?.corps);
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: target.id } });
    if (finalIdsArray.length > 0) {
      await tx.userRole.createMany({
        data: finalIdsArray.map((roleId) => ({ userId: target.id, roleId })),
      });
    }
    if (Object.keys(updateUserData).length > 0) {
      await tx.user.update({
        where: { id: target.id },
        data: updateUserData,
      });
    }
  });

  const updated = await prisma.user.findUnique({
    where: { id: target.id },
    include: {
      militaryOrganization: true,
      rank: true,
      userRoles: { include: { role: true } },
    },
  });

  res.json({
    id: updated.id,
    cpf: updated.cpf,
    name: updated.name,
    warName: updated.warName,
    email: updated.email,
    rank: updated.rank,
    saram: updated.saram,
    position: updated.position,
    corps: updated.corps,
    militaryOrganization: updated.militaryOrganization,
    roles: updated.userRoles.map((ur) => ur.role),
    active: updated.active,
  });
});

async function exigirAdminGlobal(req, res, next) {
  const { isGlobalAdmin } = await getAdminFlags(req.user.userId);
  if (!isGlobalAdmin) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  next();
}

async function exigirAdminLocalOuGlobal(req, res, next) {
  const { isGlobalAdmin, isLocalAdmin } = await getAdminFlags(req.user.userId);

  if (!isGlobalAdmin && !isLocalAdmin) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  next();
}

const AGENDA_ROLES = ["editor", "validador", "aprovador"];

function canReviewEventRequests(roleCodes) {
  return roleCodes.some((code) => AGENDA_ROLES.includes(code));
}

async function getRoleCodesByUserId(userId) {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  return rows.map((row) => row.role.code);
}

// Lê os perfis administrativos diretamente do banco para não depender dos
// perfis embutidos no JWT (que podem estar desatualizados após uma mudança
// de perfis enquanto o usuário ainda está logado).
async function getAdminFlags(userId) {
  const codes = await getRoleCodesByUserId(userId);
  return {
    isGlobalAdmin: codes.includes("admin_global"),
    isLocalAdmin: codes.includes("admin_local"),
  };
}

async function exigirAgenda(req, res, next) {
  const roleCodes = await getRoleCodesByUserId(req.user.userId);
  const podeAgenda = roleCodes.some((code) => AGENDA_ROLES.includes(code));
  if (!podeAgenda) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  next();
}

function serializeRank(rank) {
  return {
    id: rank.id,
    acronym: rank.acronym,
    reducedName: rank.reducedName,
    name: rank.name,
    active: rank.active,
    createdAt: rank.createdAt,
    updatedAt: rank.updatedAt,
  };
}

function parseUsages(value) {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ValidationError("O número de usos deve ser um número inteiro maior ou igual a zero");
  }
  return parsed;
}

function serializeUniform(uniform) {
  return {
    id: uniform.id,
    uniform: uniform.uniform,
    description: uniform.description,
    usages: uniform.usages,
    active: uniform.active,
    createdAt: uniform.createdAt,
    updatedAt: uniform.updatedAt,
  };
}

app.get("/ranks", verificarToken, exigirAdminGlobal, async (req, res) => {
  const { search = "" } = req.query;
  const term = String(search).trim();

  const where = term
    ? {
        OR: [
          { acronym: { contains: term } },
          { reducedName: { contains: term } },
          { name: { contains: term } },
        ],
      }
    : {};

  const ranks = await prisma.rank.findMany({
    where,
    orderBy: [{ acronym: "asc" }],
  });

  res.json({ data: ranks.map(serializeRank) });
});

app.post("/ranks", verificarToken, exigirAdminGlobal, async (req, res) => {
  const acronym = String(req.body?.acronym || "").trim();
  const reducedName = normalizeOptionalField(req.body?.reducedName);
  const name = normalizeOptionalField(req.body?.name);
  const active = req.body?.active === undefined ? true : Boolean(req.body.active);

  if (!acronym) {
    throw new ValidationError("A sigla do posto/graduação é obrigatória");
  }

  if (!name) {
    throw new ValidationError("O nome do posto/graduação é obrigatório");
  }

  const existing = await prisma.rank.findUnique({ where: { acronym } });
  if (existing) {
    throw new ValidationError("Já existe um posto/graduação com essa sigla");
  }

  const rank = await prisma.rank.create({
    data: { acronym, reducedName, name, active },
  });

  res.status(201).json(serializeRank(rank));
});

app.put("/ranks/:id", verificarToken, exigirAdminGlobal, async (req, res) => {
  const existing = await prisma.rank.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Posto/graduação não encontrado" });
  }

  const data = {};

  if (req.body?.acronym !== undefined) {
    const acronym = String(req.body.acronym).trim();
    if (!acronym) {
      throw new ValidationError("A sigla do posto/graduação é obrigatória");
    }
    if (acronym !== existing.acronym) {
      const conflict = await prisma.rank.findUnique({ where: { acronym } });
      if (conflict) {
        throw new ValidationError("Já existe um posto/graduação com essa sigla");
      }
    }
    data.acronym = acronym;
  }

  if (req.body?.reducedName !== undefined) {
    data.reducedName = normalizeOptionalField(req.body.reducedName);
  }

  if (req.body?.name !== undefined) {
    const name = normalizeOptionalField(req.body.name);
    if (!name) {
      throw new ValidationError("O nome do posto/graduação é obrigatório");
    }
    data.name = name;
  }

  if (req.body?.active !== undefined) {
    data.active = Boolean(req.body.active);
  }

  const rank = await prisma.rank.update({
    where: { id: req.params.id },
    data,
  });

  res.json(serializeRank(rank));
});

app.delete("/ranks/:id", verificarToken, exigirAdminGlobal, async (req, res) => {
  const rank = await prisma.rank.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!rank) {
    return res.status(404).json({ error: "Posto/graduação não encontrado" });
  }

  const linkedUsers = await prisma.user.count({ where: { rankId: rank.id } });

  if (linkedUsers > 0) {
    throw new ValidationError(
      "Não é possível excluir um posto/graduação vinculado a usuários."
    );
  }

  await prisma.rank.delete({ where: { id: req.params.id } });

  res.json({ success: true });
});

app.get("/uniforms", verificarToken, exigirAdminGlobal, async (req, res) => {
  const { search = "" } = req.query;
  const term = String(search).trim();

  const where = term
    ? {
        OR: [
          { uniform: { contains: term } },
          { description: { contains: term } },
        ],
      }
    : {};

  const uniforms = await prisma.uniform.findMany({ where });

  res.json({ data: uniforms.map(serializeUniform) });
});

app.post("/uniforms", verificarToken, exigirAdminGlobal, async (req, res) => {
  const uniformName = String(req.body?.uniform || "").trim();
  const description = normalizeOptionalField(req.body?.description);
  const active = req.body?.active === undefined ? true : Boolean(req.body.active);

  if (!uniformName) {
    throw new ValidationError("O campo uniforme é obrigatório");
  }

  const existing = await prisma.uniform.findUnique({ where: { uniform: uniformName } });
  if (existing) {
    throw new ValidationError("Já existe um uniforme com esse nome");
  }

  const uniform = await prisma.uniform.create({
    data: { uniform: uniformName, description, usages: 0, active },
  });

  res.status(201).json(serializeUniform(uniform));
});

app.put("/uniforms/:id", verificarToken, exigirAdminGlobal, async (req, res) => {
  const existing = await prisma.uniform.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Uniforme não encontrado" });
  }

  const data = {};

  if (req.body?.uniform !== undefined) {
    const uniformName = String(req.body.uniform).trim();
    if (!uniformName) {
      throw new ValidationError("O campo uniforme é obrigatório");
    }
    if (uniformName !== existing.uniform) {
      const conflict = await prisma.uniform.findUnique({ where: { uniform: uniformName } });
      if (conflict) {
        throw new ValidationError("Já existe um uniforme com esse nome");
      }
    }
    data.uniform = uniformName;
  }

  if (req.body?.description !== undefined) {
    data.description = normalizeOptionalField(req.body.description);
  }

  if (req.body?.active !== undefined) {
    data.active = Boolean(req.body.active);
  }

  const uniform = await prisma.uniform.update({
    where: { id: req.params.id },
    data,
  });

  res.json(serializeUniform(uniform));
});

app.delete("/uniforms/:id", verificarToken, exigirAdminGlobal, async (req, res) => {
  const uniform = await prisma.uniform.findUnique({ where: { id: req.params.id } });

  if (!uniform) {
    return res.status(404).json({ error: "Uniforme não encontrado" });
  }

  await prisma.uniform.delete({ where: { id: req.params.id } });

  res.json({ success: true });
});

const EVENT_TYPES = ["normal", "administrative", "no_expedient"];
const EVENT_REQUEST_STATUSES = ["pendente", "aceito", "negado"];

function serializeEvent(event) {
  return {
    id: event.id,
    type: event.type,
    eventDate: event.eventDate,
    recurring: event.recurring,
    weekdays: event.weekdays
      ? event.weekdays
          .split(",")
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value))
      : [],
    startTime: event.startTime,
    endTime: event.endTime,
    title: event.title,
    information: event.information,
    location: event.location,
    responsible: event.responsible,
    uniforms: (event.uniforms || []).map((eu) => ({
      id: eu.uniform.id,
      uniform: eu.uniform.uniform,
      description: eu.uniform.description,
    })),
    createdBy: event.createdBy
      ? {
          id: event.createdBy.id,
          name: event.createdBy.name,
          warName: event.createdBy.warName,
        }
      : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

function parseWeekdays(value) {
  if (!Array.isArray(value)) return [];
  const days = value
    .map((item) => Number.parseInt(String(item), 10))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

function validateTime(value, label) {
  const time = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new ValidationError(`${label} inválido (use o formato HH:MM)`);
  }
  return time;
}

function validateOptionalTime(value, label) {
  const time = String(value || "").trim();
  if (!time) return null;
  return validateTime(time, label);
}

function minutosDoHorarioInput(time) {
  const [h, m] = String(time || "").split(":");
  const hh = Number.parseInt(h, 10);
  const mm = Number.parseInt(m, 10);
  return hh * 60 + mm;
}

function serializeEventRequest(request) {
  return {
    id: request.id,
    status: request.status,
    eventDate: request.eventDate,
    startTime: request.startTime,
    endTime: request.endTime,
    title: request.title,
    information: request.information,
    location: request.location,
    responsible: request.responsible,
    eventId: request.eventId,
    uniforms: (request.uniforms || []).map((item) => ({
      id: item.uniform.id,
      uniform: item.uniform.uniform,
      description: item.uniform.description,
    })),
    requestedBy: request.requestedBy
      ? {
          id: request.requestedBy.id,
          name: request.requestedBy.name,
          warName: request.requestedBy.warName,
          rank: request.requestedBy.rank
            ? {
                id: request.requestedBy.rank.id,
                acronym: request.requestedBy.rank.acronym,
              }
            : null,
        }
      : null,
    reviewedBy: request.reviewedBy
      ? {
          id: request.reviewedBy.id,
          name: request.reviewedBy.name,
          warName: request.reviewedBy.warName,
          rank: request.reviewedBy.rank
            ? {
                id: request.reviewedBy.rank.id,
                acronym: request.reviewedBy.rank.acronym,
              }
            : null,
        }
      : null,
    reviewedAt: request.reviewedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

async function parseEventRequestPayload(body) {
  const eventDate = parseDateOnly(body?.eventDate, "Data do evento");
  const startTime = validateTime(body?.startTime, "Horário inicial");
  const endTime = validateOptionalTime(body?.endTime, "Horário final");

  if (endTime && minutosDoHorarioInput(endTime) < minutosDoHorarioInput(startTime)) {
    throw new ValidationError("Horário final não pode ser menor que o horário inicial");
  }

  const title = String(body?.title || "").trim();
  if (!title) {
    throw new ValidationError("Informe o evento solicitado");
  }

  const information = normalizeRequiredField(body?.information, "Participantes");
  const location = normalizeRequiredField(body?.location, "Local");
  const responsible = normalizeRequiredField(body?.responsible, "Responsável");

  const uniformIds = Array.isArray(body?.uniformIds)
    ? [...new Set(body.uniformIds.map((id) => String(id)).filter(Boolean))]
    : [];

  if (uniformIds.length === 0) {
    throw new ValidationError("Selecione ao menos um uniforme");
  }

  const foundUniforms = await prisma.uniform.findMany({
    where: { id: { in: uniformIds }, active: true },
    select: { id: true },
  });

  if (foundUniforms.length !== uniformIds.length) {
    throw new ValidationError("Um ou mais uniformes selecionados são inválidos");
  }

  return {
    eventDate,
    startTime,
    endTime,
    title,
    information,
    location,
    responsible,
    uniformIds,
  };
}

async function getCurrentUserOmId(userId) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { militaryOrganizationId: true },
  });
  return current?.militaryOrganizationId || null;
}

app.get("/events/uniforms", verificarToken, async (req, res) => {
  const uniforms = await prisma.uniform.findMany({
    where: { active: true },
  });
  res.json({ data: uniforms.map(serializeUniform) });
});

app.get("/events", verificarToken, exigirAgenda, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const pageNum = Math.max(1, parseInt(String(req.query?.page || "1"), 10) || 1);
  const limitNum = Math.max(1, Math.min(50, parseInt(String(req.query?.limit || "10"), 10) || 10));
  const skip = (pageNum - 1) * limitNum;
  const term = String(req.query?.search || "").trim();

  const where = {
    militaryOrganizationId: omId,
  };

  const recurringParam = String(req.query?.recurring || "").trim();
  if (recurringParam === "true") {
    where.recurring = true;
  } else if (recurringParam === "false") {
    where.recurring = false;
  }

  const dateFrom = String(req.query?.dateFrom || "").trim();
  const dateTo = String(req.query?.dateTo || "").trim();
  if (dateFrom || dateTo) {
    where.eventDate = {};
    if (dateFrom) {
      where.eventDate.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      where.eventDate.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  if (term) {
    where.OR = [
      { title: { contains: term } },
      { information: { contains: term } },
      { location: { contains: term } },
      { responsible: { contains: term } },
    ];
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        uniforms: { include: { uniform: true } },
        createdBy: true,
      },
      orderBy: [{ eventDate: "desc" }, { startTime: "desc" }, { createdAt: "desc" }],
      skip,
      take: limitNum,
    }),
    prisma.event.count({ where }),
  ]);

  res.json({
    data: events.map(serializeEvent),
    page: pageNum,
    limit: limitNum,
    total,
    hasMore: skip + events.length < total,
  });
});

app.post("/events", verificarToken, exigirAgenda, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const type = EVENT_TYPES.includes(req.body?.type) ? req.body.type : "normal";
  const recurring = Boolean(req.body?.recurring);

  const data = {
    type,
    recurring,
    eventDate: null,
    weekdays: null,
    startTime: null,
    endTime: null,
    title: null,
    information: "-",
    location: "-",
    responsible: "-",
    militaryOrganizationId: omId,
    createdById: req.user.userId,
  };

  if (recurring) {
    const weekdays = parseWeekdays(req.body?.weekdays);
    if (weekdays.length === 0) {
      throw new ValidationError("Selecione ao menos um dia da semana para a recorrência");
    }
    data.weekdays = weekdays.join(",");
  } else {
    const date = new Date(String(req.body?.eventDate || ""));
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("Informe uma data válida");
    }
    data.eventDate = date;
  }

  let uniformIds = [];

  if (type === "no_expedient") {
    const reason = String(req.body?.title || "").trim();
    if (!reason) {
      throw new ValidationError("Informe o motivo para sem expediente");
    }
    data.title = reason;
  } else {
    data.startTime = validateTime(req.body?.startTime, "Horário inicial");
    data.endTime = validateOptionalTime(req.body?.endTime, "Horário final");

    const title = String(req.body?.title || "").trim();
    if (!title) {
      if (type === "administrative") {
        data.title = "Expediente administrativo";
      } else {
        throw new ValidationError("O evento é obrigatório");
      }
    } else {
      data.title = title;
    }

    data.information = normalizeRequiredField(req.body?.information, "Participantes");
    data.location = normalizeRequiredField(req.body?.location, "Local");
    data.responsible = normalizeRequiredField(req.body?.responsible, "Responsável");

    uniformIds = Array.isArray(req.body?.uniformIds)
      ? [...new Set(req.body.uniformIds.map((id) => String(id)).filter(Boolean))]
      : [];

    if (uniformIds.length === 0) {
      throw new ValidationError("Selecione ao menos um uniforme");
    }

    const found = await prisma.uniform.findMany({
      where: { id: { in: uniformIds } },
      select: { id: true },
    });
    if (found.length !== uniformIds.length) {
      throw new ValidationError("Um ou mais uniformes selecionados são inválidos");
    }
  }

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        ...data,
        uniforms: {
          create: uniformIds.map((uniformId) => ({ uniformId })),
        },
      },
      include: {
        uniforms: { include: { uniform: true } },
        createdBy: true,
      },
    });

    if (uniformIds.length > 0) {
      await tx.uniform.updateMany({
        where: { id: { in: uniformIds } },
        data: { usages: { increment: 1 } },
      });
    }

    return created;
  });

  res.status(201).json(serializeEvent(event));
});

app.put("/events/:id", verificarToken, exigirAgenda, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const existing = await prisma.event.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ error: "Evento não encontrado" });
  }

  const type = EVENT_TYPES.includes(req.body?.type) ? req.body.type : "normal";
  const recurring = Boolean(req.body?.recurring);

  const data = {
    type,
    recurring,
    eventDate: null,
    weekdays: null,
    startTime: null,
    endTime: null,
    title: null,
    information: "-",
    location: "-",
    responsible: "-",
  };

  if (recurring) {
    const weekdays = parseWeekdays(req.body?.weekdays);
    if (weekdays.length === 0) {
      throw new ValidationError("Selecione ao menos um dia da semana para a recorrência");
    }
    data.weekdays = weekdays.join(",");
  } else {
    const date = new Date(String(req.body?.eventDate || ""));
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("Informe uma data válida");
    }
    data.eventDate = date;
  }

  let uniformIds = [];

  if (type === "no_expedient") {
    const reason = String(req.body?.title || "").trim();
    if (!reason) {
      throw new ValidationError("Informe o motivo para sem expediente");
    }
    data.title = reason;
  } else {
    data.startTime = validateTime(req.body?.startTime, "Horário inicial");
    data.endTime = validateOptionalTime(req.body?.endTime, "Horário final");

    const title = String(req.body?.title || "").trim();
    if (!title) {
      if (type === "administrative") {
        data.title = "Expediente administrativo";
      } else {
        throw new ValidationError("O evento é obrigatório");
      }
    } else {
      data.title = title;
    }

    data.information = normalizeRequiredField(req.body?.information, "Participantes");
    data.location = normalizeRequiredField(req.body?.location, "Local");
    data.responsible = normalizeRequiredField(req.body?.responsible, "Responsável");

    uniformIds = Array.isArray(req.body?.uniformIds)
      ? [...new Set(req.body.uniformIds.map((id) => String(id)).filter(Boolean))]
      : [];

    if (uniformIds.length === 0) {
      throw new ValidationError("Selecione ao menos um uniforme");
    }

    const found = await prisma.uniform.findMany({
      where: { id: { in: uniformIds } },
      select: { id: true },
    });
    if (found.length !== uniformIds.length) {
      throw new ValidationError("Um ou mais uniformes selecionados são inválidos");
    }
  }

  const event = await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: req.params.id },
      data: {
        ...data,
        uniforms: {
          deleteMany: {},
          create: uniformIds.map((uniformId) => ({ uniformId })),
        },
      },
    });

    if (uniformIds.length > 0) {
      await tx.uniform.updateMany({
        where: { id: { in: uniformIds } },
        data: { usages: { increment: 1 } },
      });
    }

    return tx.event.findUnique({
      where: { id: req.params.id },
      include: {
        uniforms: { include: { uniform: true } },
        createdBy: true,
      },
    });
  });

  res.json(serializeEvent(event));
});

app.delete("/events/:id", verificarToken, exigirAgenda, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const existing = await prisma.event.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ error: "Evento não encontrado" });
  }

  await prisma.event.delete({ where: { id: req.params.id } });

  res.json({ success: true });
});

app.get("/event-requests", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const roleCodes = await getRoleCodesByUserId(req.user.userId);
  const canReview = canReviewEventRequests(roleCodes);

  const pageNum = Math.max(1, parseInt(String(req.query?.page || "1"), 10) || 1);
  const limitNum = Math.max(1, Math.min(50, parseInt(String(req.query?.limit || "10"), 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const status = String(req.query?.status || "").trim();
  const term = String(req.query?.search || "").trim();

  const where = {
    militaryOrganizationId: omId,
    ...(canReview ? {} : { requestedById: req.user.userId }),
  };

  if (status) {
    if (!EVENT_REQUEST_STATUSES.includes(status)) {
      throw new ValidationError("Status de solicitação inválido");
    }
    where.status = status;
  }

  if (term) {
    where.OR = [
      { title: { contains: term } },
      { information: { contains: term } },
      { location: { contains: term } },
      { responsible: { contains: term } },
      { requestedBy: { name: { contains: term } } },
      { requestedBy: { warName: { contains: term } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.eventRequest.findMany({
      where,
      include: {
        uniforms: { include: { uniform: true } },
        requestedBy: { include: { rank: true } },
        reviewedBy: { include: { rank: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limitNum,
    }),
    prisma.eventRequest.count({ where }),
  ]);

  res.json({
    data: items.map(serializeEventRequest),
    page: pageNum,
    limit: limitNum,
    total,
    hasMore: skip + items.length < total,
    canReview,
  });
});

app.post("/event-requests", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const payload = await parseEventRequestPayload(req.body);

  const created = await prisma.eventRequest.create({
    data: {
      status: "pendente",
      eventDate: payload.eventDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      title: payload.title,
      information: payload.information,
      location: payload.location,
      responsible: payload.responsible,
      militaryOrganizationId: omId,
      requestedById: req.user.userId,
      uniforms: {
        create: payload.uniformIds.map((uniformId) => ({ uniformId })),
      },
    },
    include: {
      uniforms: { include: { uniform: true } },
      requestedBy: { include: { rank: true } },
      reviewedBy: { include: { rank: true } },
    },
  });

  res.status(201).json(serializeEventRequest(created));
});

app.put("/event-requests/:id/status", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const roleCodes = await getRoleCodesByUserId(req.user.userId);
  const canReview = canReviewEventRequests(roleCodes);
  if (!canReview) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const status = String(req.body?.status || "").trim();
  if (!EVENT_REQUEST_STATUSES.includes(status)) {
    throw new ValidationError("Status de solicitação inválido");
  }

  const existing = await prisma.eventRequest.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    include: {
      uniforms: true,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: "Solicitação não encontrada" });
  }

  const updatedId = await prisma.$transaction(async (tx) => {
    let eventId = existing.eventId || null;

    if (status === "aceito" && !eventId) {
      const createdEvent = await tx.event.create({
        data: {
          type: "normal",
          recurring: false,
          eventDate: existing.eventDate,
          startTime: existing.startTime,
          endTime: existing.endTime,
          title: existing.title,
          information: existing.information,
          location: existing.location,
          responsible: existing.responsible,
          militaryOrganizationId: existing.militaryOrganizationId,
          createdById: existing.requestedById,
          uniforms: {
            create: existing.uniforms.map((item) => ({ uniformId: item.uniformId })),
          },
        },
        select: { id: true },
      });
      eventId = createdEvent.id;
    }

    if (status !== "aceito" && eventId) {
      await tx.event.delete({ where: { id: eventId } });
      eventId = null;
    }

    const updated = await tx.eventRequest.update({
      where: { id: existing.id },
      data: {
        status,
        eventId,
        reviewedById: req.user.userId,
        reviewedAt: new Date(),
      },
      select: { id: true },
    });

    return updated.id;
  });

  const result = await prisma.eventRequest.findUnique({
    where: { id: updatedId },
    include: {
      uniforms: { include: { uniform: true } },
      requestedBy: { include: { rank: true } },
      reviewedBy: { include: { rank: true } },
    },
  });

  res.json(serializeEventRequest(result));
});

app.delete("/event-requests/:id", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const roleCodes = await getRoleCodesByUserId(req.user.userId);
  const isEditor = roleCodes.includes("editor");

  const existing = await prisma.eventRequest.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    select: {
      id: true,
      eventId: true,
      requestedById: true,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: "Solicitação não encontrada" });
  }

  if (!isEditor && existing.requestedById !== req.user.userId) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  await prisma.$transaction(async (tx) => {
    if (existing.eventId) {
      await tx.event.delete({ where: { id: existing.eventId } });
    }
    await tx.eventRequest.delete({ where: { id: existing.id } });
  });

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// QTS (Quadro de Trabalho Semanal)
// ---------------------------------------------------------------------------

const QTS_STATUSES = ["minuta", "validado", "aprovado", "invalidado"];
const QTS_ARCHIVE_STATUS = "aprovado";
const QTS_ARCHIVE_RETENTION_DAYS = 90;
const QTS_ARCHIVE_BATCH_SIZE = 100;
const FRONTEND_BASE_URL = getEnv("FRONTEND_BASE_URL", "http://localhost:3000");

const MESES_EXTENSO = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

const DIAS_CURTO = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function exigirEditor(req, res, next) {
  getRoleCodesByUserId(req.user.userId)
    .then((codes) => {
      if (!codes.includes("editor")) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      next();
    })
    .catch(next);
}

function exigirValidador(req, res, next) {
  getRoleCodesByUserId(req.user.userId)
    .then((codes) => {
      if (!codes.includes("validador")) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      next();
    })
    .catch(next);
}

function exigirHistoricoQts(req, res, next) {
  getRoleCodesByUserId(req.user.userId)
    .then((codes) => {
      if (!codes.includes("historico_qts")) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      next();
    })
    .catch(next);
}

function getQtsInclude() {
  return {
    createdBy: { include: { rank: true } },
    validatedBy: { include: { rank: true } },
    approvedBy: { include: { rank: true } },
  };
}

function getArchiveThresholdDate() {
  return new Date(Date.now() - QTS_ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeOmSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function getWeekRangeUtc(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;

  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysToMonday + offsetWeeks * 7);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

async function findMilitaryOrganizationsBySegment(segment) {
  const raw = String(segment || "").trim();
  const normalizedSegment = normalizeOmSegment(raw);
  if (!normalizedSegment) return [];

  const oms = await prisma.militaryOrganization.findMany({
    where: { active: true },
    select: { id: true, acronym: true, name: true },
  });

  const matches = oms.filter(
    (om) => normalizeOmSegment(om.acronym) === normalizedSegment
  );

  // Prioriza correspondência exata da sigla (case-insensitive) para nomeação.
  matches.sort((a, b) => {
    const aExact = a.acronym.trim().toUpperCase() === raw.toUpperCase() ? 0 : 1;
    const bExact = b.acronym.trim().toUpperCase() === raw.toUpperCase() ? 0 : 1;
    return aExact - bExact;
  });

  return matches;
}

// Leitura de QTS: liberada para editor, validador e aprovador
function exigirLeituraQts(req, res, next) {
  getRoleCodesByUserId(req.user.userId)
    .then((codes) => {
      const permitido = ["editor", "validador", "aprovador"].some((code) =>
        codes.includes(code)
      );
      if (!permitido) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      next();
    })
    .catch(next);
}

function parseDateOnly(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ValidationError(`${label} inválida (use o formato AAAA-MM-DD)`);
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} inválida`);
  }
  return date;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatHora(startTime, endTime) {
  const fmt = (time) => {
    if (!time) return "";
    const [h, m] = String(time).split(":");
    const hora = Number.parseInt(h, 10);
    const min = Number.parseInt(m, 10);
    return min === 0 ? `${hora}h` : `${hora}h${pad2(min)}`;
  };
  const inicio = fmt(startTime);
  const fim = fmt(endTime);
  if (inicio && fim) return `${inicio} às ${fim}`;
  return inicio || "-";
}

function formatDateRangeLabel(start, end) {
  const d1 = start.getUTCDate();
  const m1 = start.getUTCMonth();
  const y1 = start.getUTCFullYear();
  const d2 = end.getUTCDate();
  const m2 = end.getUTCMonth();
  const y2 = end.getUTCFullYear();

  if (m1 === m2 && y1 === y2) {
    return `${pad2(d1)} A ${pad2(d2)} DE ${MESES_EXTENSO[m1]} DE ${y1}`;
  }
  if (y1 === y2) {
    return `${pad2(d1)} DE ${MESES_EXTENSO[m1]} A ${pad2(d2)} DE ${MESES_EXTENSO[m2]} DE ${y1}`;
  }
  return `${pad2(d1)} DE ${MESES_EXTENSO[m1]} DE ${y1} A ${pad2(d2)} DE ${MESES_EXTENSO[m2]} DE ${y2}`;
}

function sameUtcDay(eventDate, day) {
  if (!eventDate) return false;
  const d = new Date(eventDate);
  return (
    d.getUTCFullYear() === day.getUTCFullYear() &&
    d.getUTCMonth() === day.getUTCMonth() &&
    d.getUTCDate() === day.getUTCDate()
  );
}

function minutosDoHorario(time) {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [h, m] = String(time).split(":");
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
}

// Para desempate por hora final: ausência de hora final conta como o maior valor,
// de modo que eventos sem término definido fiquem primeiro na ordem decrescente.
function minutosDoHorarioFim(time) {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [h, m] = String(time).split(":");
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
}

function buildQtsItemKey(eventId, date) {
  return `${eventId}:${date}`;
}

function applyExcludedQtsItems(snapshot, excludedItemKeys) {
  if (!Array.isArray(snapshot?.days) || !Array.isArray(excludedItemKeys)) {
    return snapshot;
  }

  const excluded = new Set(
    excludedItemKeys.filter(
      (value) => typeof value === "string" && value.trim().length > 0
    )
  );

  if (excluded.size === 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    days: snapshot.days.map((day) => {
      if (!Array.isArray(day.items) || day.items.length === 0) {
        return day;
      }

      const items = day.items.filter((item) => !excluded.has(item.itemKey));
      return {
        ...day,
        items,
        noExpedient: items.length === 0,
        noExpedientReason:
          items.length === 0 ? day.noExpedientReason || null : day.noExpedientReason,
      };
    }),
  };
}

async function buildQtsSnapshot(omId, start, end) {
  if (end.getTime() < start.getTime()) {
    throw new ValidationError("A data final deve ser igual ou posterior à inicial");
  }

  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (diffDays > 60) {
    throw new ValidationError("O intervalo do QTS não pode exceder 60 dias");
  }

  const endInclusive = new Date(end.getTime());
  endInclusive.setUTCHours(23, 59, 59, 999);

  const om = await prisma.militaryOrganization.findUnique({
    where: { id: omId },
    select: { id: true, acronym: true, name: true },
  });

  const events = await prisma.event.findMany({
    where: {
      militaryOrganizationId: omId,
      OR: [{ recurring: true }, { eventDate: { gte: start, lte: endInclusive } }],
    },
    include: { uniforms: { include: { uniform: true } } },
  });

  const fabSetting = await prisma.systemSetting.findUnique({
    where: { settingKey: fabImageKey },
  });
  const domSetting = await prisma.systemSetting.findUnique({
    where: { settingKey: `${omImageSettingPrefix}${omId}` },
  });

  const days = [];
  for (
    let cursor = new Date(start.getTime());
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = new Date(cursor.getTime());
    const weekday = day.getUTCDay();

    const doDia = events.filter((event) => {
      if (event.recurring) {
        const dias = (event.weekdays || "")
          .split(",")
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value));
        return dias.includes(weekday);
      }
      return sameUtcDay(event.eventDate, day);
    });

    const noExpedientEvents = doDia.filter((event) => event.type === "no_expedient");
    const expediente = doDia.filter((event) => event.type !== "no_expedient");

    expediente.sort((a, b) => {
      const inicioDiff =
        minutosDoHorario(a.startTime) - minutosDoHorario(b.startTime);
      if (inicioDiff !== 0) return inicioDiff;
      // Hora inicial igual: horários finais maiores primeiro (ordem decrescente).
      return minutosDoHorarioFim(b.endTime) - minutosDoHorarioFim(a.endTime);
    });

    const items = expediente.map((event) => ({
      itemKey: buildQtsItemKey(
        event.id,
        `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(
          day.getUTCDate()
        )}`
      ),
      hora: formatHora(event.startTime, event.endTime),
      evento: event.title || "-",
      participantes: normalizeOptionalField(event.information) || "-",
      local: normalizeOptionalField(event.location) || "-",
      responsavel: normalizeOptionalField(event.responsible) || "-",
      uniforme:
        (event.uniforms || []).map((eu) => eu.uniform.uniform).join(" / ") || "-",
    }));

    days.push({
      date: `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(
        day.getUTCDate()
      )}`,
      dayShort: DIAS_CURTO[weekday],
      dayNumber: pad2(day.getUTCDate()),
      weekday,
      noExpedient: items.length === 0,
      noExpedientReason: noExpedientEvents[0]?.title || null,
      items,
    });
  }

  return {
    header: {
      title: "QUADRO DE TRABALHO SEMANAL",
      omName: om?.name || om?.acronym || "",
      omAcronym: om?.acronym || "",
      dateLabel: formatDateRangeLabel(start, end),
      fabImageUrl: fabSetting?.value || null,
      domImageUrl: domSetting?.value || null,
    },
    days,
  };
}

// Sanitiza HTML de observação: mantém apenas tags de formatação seguras
function sanitizeObservacaoHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:/gi, "")
    .substring(0, 3000);
}

function buildProposedBy(user) {
  if (!user) return null;
  const signatureVersion = user.updatedAt
    ? new Date(user.updatedAt).getTime()
    : null;
  return {
    name: user.name,
    warName: user.warName,
    rank: user.rank?.reducedName || user.rank?.acronym || null,
    rankName: user.rank?.name || null,
    corps: user.corps || null,
    position: user.position || null,
    signatureUrl: user.signatureUrl
      ? `${user.signatureUrl}${signatureVersion ? `?v=${signatureVersion}` : ""}`
      : null,
    signatureOffset: user.signatureOffset ?? 0,
    signatureScale: user.signatureScale ?? SIGNATURE_SCALE_DEFAULT,
  };
}

function serializeQtsResumo(qts) {
  return {
    id: qts.id,
    startDate: qts.startDate,
    endDate: qts.endDate,
    status: qts.status,
    dateLabel: formatDateRangeLabel(new Date(qts.startDate), new Date(qts.endDate)),
    createdAt: qts.createdAt,
    updatedAt: qts.updatedAt,
    createdBy: buildProposedBy(qts.createdBy),
    validatedBy: buildProposedBy(qts.validatedBy),
    validatedAt: qts.validatedAt,
    approvedBy: buildProposedBy(qts.approvedBy),
    approvedAt: qts.approvedAt,
    archivedAt: qts.archivePlacedAt || qts.archivedAt || null,
  };
}

function buildPublicQtsLink(id) {
  return `${FRONTEND_BASE_URL}/qts-compartilhado/${id}`;
}

function serializeQtsCompleto(qts) {
  let content = {};
  try {
    content = JSON.parse(qts.content || "{}");
  } catch {
    content = {};
  }
  // Reflete as assinaturas atuais (relações do banco) no documento.
  // "Proposto por" fica pendente até a validação (não usa o editor).
  content.proposedBy = buildProposedBy(qts.validatedBy);
  content.validatedBy = buildProposedBy(qts.validatedBy);
  content.approvedBy = buildProposedBy(qts.approvedBy);
  return {
    ...serializeQtsResumo(qts),
    content,
  };
}

// Preview gerado dinamicamente (não persistido) — rascunho
app.get("/qts/preview", verificarToken, exigirEditor, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const start = parseDateOnly(req.query?.dateFrom, "Data inicial");
  const end = parseDateOnly(req.query?.dateTo, "Data final");

  const snapshot = await buildQtsSnapshot(omId, start, end);

  res.json({
    ...snapshot,
    proposedBy: null,
    approvedBy: null,
    status: "rascunho",
  });
});

app.get("/qts/aprovados", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const pageNum = Math.max(1, parseInt(String(req.query?.page || "1"), 10) || 1);
  const limitNum = Math.max(
    1,
    Math.min(50, parseInt(String(req.query?.limit || "20"), 10) || 20)
  );
  const skip = (pageNum - 1) * limitNum;
  const threshold = getArchiveThresholdDate();

  const where = {
    militaryOrganizationId: omId,
    status: QTS_ARCHIVE_STATUS,
    approvedAt: { gte: threshold },
  };

  const [registros, total] = await Promise.all([
    prisma.qts.findMany({
      where,
      include: getQtsInclude(),
      orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limitNum,
    }),
    prisma.qts.count({ where }),
  ]);

  res.json({
    data: registros.map(serializeQtsResumo),
    page: pageNum,
    limit: limitNum,
    total,
    hasMore: skip + registros.length < total,
  });
});

app.get("/qts/aprovados/:id", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const threshold = getArchiveThresholdDate();
  const qts = await prisma.qts.findFirst({
    where: {
      id: req.params.id,
      militaryOrganizationId: omId,
      status: QTS_ARCHIVE_STATUS,
      approvedAt: { gte: threshold },
    },
    include: getQtsInclude(),
  });

  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }

  res.json(serializeQtsCompleto(qts));
});

app.post("/qts/aprovados/:id/share", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const threshold = getArchiveThresholdDate();
  const qts = await prisma.qts.findFirst({
    where: {
      id: req.params.id,
      militaryOrganizationId: omId,
      status: QTS_ARCHIVE_STATUS,
      approvedAt: { gte: threshold },
    },
    select: { id: true },
  });

  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }

  res.json({
    id: qts.id,
    link: buildPublicQtsLink(qts.id),
  });
});

app.get("/qts/historico", verificarToken, exigirHistoricoQts, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const pageNum = Math.max(1, parseInt(String(req.query?.page || "1"), 10) || 1);
  const limitNum = Math.max(
    1,
    Math.min(50, parseInt(String(req.query?.limit || "20"), 10) || 20)
  );
  const skip = (pageNum - 1) * limitNum;

  const where = {
    militaryOrganizationId: omId,
  };

  const dateFrom = String(req.query?.dateFrom || "").trim();
  const dateTo = String(req.query?.dateTo || "").trim();
  if (dateFrom || dateTo) {
    where.approvedAt = {};
    if (dateFrom) {
      where.approvedAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      where.approvedAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  const [registros, total] = await Promise.all([
    prisma.qtsArchive.findMany({
      where,
      include: getQtsInclude(),
      orderBy: [{ approvedAt: "desc" }, { archivePlacedAt: "desc" }],
      skip,
      take: limitNum,
    }),
    prisma.qtsArchive.count({ where }),
  ]);

  res.json({
    data: registros.map(serializeQtsResumo),
    page: pageNum,
    limit: limitNum,
    total,
    hasMore: skip + registros.length < total,
  });
});

app.get("/qts/historico/:id", verificarToken, exigirHistoricoQts, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const qts = await prisma.qtsArchive.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    include: getQtsInclude(),
  });

  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }

  res.json(serializeQtsCompleto(qts));
});

app.post("/qts/historico/:id/share", verificarToken, exigirHistoricoQts, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const qts = await prisma.qtsArchive.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    select: { id: true },
  });

  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }

  res.json({
    id: qts.id,
    link: buildPublicQtsLink(qts.id),
  });
});

app.get("/qts/public/om/:om/:periodo", async (req, res) => {
  const omSegment = decodeURIComponent(String(req.params?.om || "")).trim();
  const periodo = String(req.params?.periodo || "").trim().toLowerCase();

  if (!omSegment) {
    throw new ValidationError("OM inválida");
  }

  if (periodo !== "atual" && periodo !== "proximo") {
    throw new ValidationError("Período inválido");
  }

  const oms = await findMilitaryOrganizationsBySegment(omSegment);
  if (oms.length === 0) {
    return res.status(404).json({ error: "OM não encontrada" });
  }

  const omIds = oms.map((om) => om.id);
  const range = getWeekRangeUtc(periodo === "proximo" ? 1 : 0);
  const whereByPeriod = {
    militaryOrganizationId: { in: omIds },
    status: QTS_ARCHIVE_STATUS,
    startDate: { lte: range.end },
    endDate: { gte: range.start },
  };

  const [qts, qtsArchive] = await Promise.all([
    prisma.qts.findFirst({
      where: whereByPeriod,
      include: getQtsInclude(),
      orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.qtsArchive.findFirst({
      where: whereByPeriod,
      include: getQtsInclude(),
      orderBy: [{ approvedAt: "desc" }, { archivePlacedAt: "desc" }],
    }),
  ]);

  const registro = qts || qtsArchive;
  if (!registro) {
    return res.status(404).json({ error: "Nenhum QTS aprovado para o período solicitado" });
  }

  const om =
    oms.find((item) => item.id === registro.militaryOrganizationId) || oms[0];

  const completo = serializeQtsCompleto(registro);
  res.json({
    id: completo.id,
    dateLabel: completo.dateLabel,
    status: completo.status,
    content: completo.content,
    omAcronym: om.acronym,
    omName: om.name,
    periodo,
    source: qts ? "qts" : "archive",
  });
});

app.get("/qts/public/:id", async (req, res) => {
  const id = String(req.params?.id || "").trim();
  if (!id) {
    throw new ValidationError("ID inválido");
  }

  const [qts, qtsArchive] = await Promise.all([
    prisma.qts.findFirst({
      where: { id, status: QTS_ARCHIVE_STATUS },
      include: getQtsInclude(),
    }),
    prisma.qtsArchive.findFirst({
      where: { id },
      include: getQtsInclude(),
    }),
  ]);

  const registro = qts || qtsArchive;
  if (!registro) {
    return res.status(404).json({ error: "Link de compartilhamento inválido" });
  }

  const completo = serializeQtsCompleto(registro);
  res.json({
    id: completo.id,
    dateLabel: completo.dateLabel,
    status: completo.status,
    content: completo.content,
    source: qts ? "qts" : "archive",
  });
});

// Lista de QTS salvos da OM
app.get("/qts", verificarToken, exigirLeituraQts, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const pageNum = Math.max(1, parseInt(String(req.query?.page || "1"), 10) || 1);
  const limitNum = Math.max(
    1,
    Math.min(50, parseInt(String(req.query?.limit || "10"), 10) || 10)
  );
  const skip = (pageNum - 1) * limitNum;

  const where = { militaryOrganizationId: omId };
  const statusFilter = String(req.query?.status || "").trim();
  if (QTS_STATUSES.includes(statusFilter)) {
    where.status = statusFilter;
  }

  const [registros, total] = await Promise.all([
    prisma.qts.findMany({
      where,
      include: getQtsInclude(),
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: limitNum,
    }),
    prisma.qts.count({ where }),
  ]);

  res.json({
    data: registros.map(serializeQtsResumo),
    page: pageNum,
    limit: limitNum,
    total,
    hasMore: skip + registros.length < total,
  });
});

// Detalhe de um QTS salvo
app.get("/qts/:id", verificarToken, exigirLeituraQts, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const qts = await prisma.qts.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    include: getQtsInclude(),
  });

  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }

  res.json(serializeQtsCompleto(qts));
});

// Salvar QTS gerado como minuta
app.post("/qts", verificarToken, exigirEditor, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const start = parseDateOnly(req.body?.dateFrom, "Data inicial");
  const end = parseDateOnly(req.body?.dateTo, "Data final");

  const snapshotBase = await buildQtsSnapshot(omId, start, end);
  const snapshot = applyExcludedQtsItems(
    snapshotBase,
    req.body?.excludedItemKeys
  );
  const observacao = sanitizeObservacaoHtml(req.body?.observacao);

  const content = {
    ...snapshot,
    observacao: observacao || null,
    proposedBy: null,
  };

  const qts = await prisma.qts.create({
    data: {
      startDate: start,
      endDate: end,
      status: "minuta",
      content: JSON.stringify(content),
      militaryOrganizationId: omId,
      createdById: req.user.userId,
    },
    include: getQtsInclude(),
  });

  res.status(201).json(serializeQtsCompleto(qts));
});

// Alterar estado (minuta → validado → aprovado)
app.put("/qts/:id/status", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const novoStatus = String(req.body?.status || "").trim();
  if (!QTS_STATUSES.includes(novoStatus)) {
    throw new ValidationError("Status inválido");
  }

  const qts = await prisma.qts.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
  });
  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }

  const roleCodes = await getRoleCodesByUserId(req.user.userId);

  const data = {};
  if (novoStatus === "validado") {
    if (qts.status !== "minuta") {
      throw new ValidationError("Somente uma minuta pode ser validada");
    }
    if (!roleCodes.includes("validador")) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    // Impede validar um QTS cujo intervalo sobreponha (mesmo que parcialmente)
    // outro QTS já validado/aprovado na mesma OM.
    const sobreposto = await prisma.qts.findFirst({
      where: {
        militaryOrganizationId: omId,
        id: { not: qts.id },
        status: { in: ["validado", "aprovado"] },
        startDate: { lte: qts.endDate },
        endDate: { gte: qts.startDate },
      },
      orderBy: { startDate: "asc" },
    });
    if (sobreposto) {
      throw new ValidationError(
        `Já existe um QTS validado (${formatDateRangeLabel(
          new Date(sobreposto.startDate),
          new Date(sobreposto.endDate)
        )}) compreendendo essas datas ou parte delas.`
      );
    }
    data.status = "validado";
    data.validatedById = req.user.userId;
    data.validatedAt = new Date();
  } else if (novoStatus === "invalidado") {
    if (qts.status !== "aprovado") {
      throw new ValidationError("Somente um QTS aprovado pode ser invalidado");
    }
    if (!roleCodes.includes("invalidar_qts")) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    data.status = "invalidado";
  } else if (novoStatus === "aprovado") {
    if (qts.status !== "validado") {
      throw new ValidationError("Somente um QTS validado pode ser aprovado");
    }
    if (!roleCodes.includes("aprovador")) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    data.status = "aprovado";
    data.approvedById = req.user.userId;
    data.approvedAt = new Date();
  } else {
    // Reverter para minuta: editor da própria OM
    if (!roleCodes.includes("editor")) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    data.status = "minuta";
    data.validatedById = null;
    data.validatedAt = null;
    data.approvedById = null;
    data.approvedAt = null;
  }

  const atualizado = await prisma.qts.update({
    where: { id: qts.id },
    data,
    include: getQtsInclude(),
  });

  let emailNotification = null;
  if (novoStatus === "aprovado") {
    try {
      emailNotification = await sendQtsApprovedEmail({
        omId,
        qtsId: atualizado.id,
        approvedByName: atualizado.approvedBy?.warName || atualizado.approvedBy?.name,
        dateLabel: formatDateRangeLabel(new Date(atualizado.startDate), new Date(atualizado.endDate)),
      });
    } catch (error) {
      emailNotification = {
        attempted: true,
        sent: false,
        reason: "send-failed",
      };
      console.error("Falha ao enviar email de aprovação do QTS:", error);
    }
  }

  res.json({
    ...serializeQtsCompleto(atualizado),
    emailNotification,
  });
});

async function archiveOldApprovedQts() {
  const threshold = getArchiveThresholdDate();

  while (true) {
    const oldQts = await prisma.qts.findMany({
      where: {
        status: QTS_ARCHIVE_STATUS,
        approvedAt: { lt: threshold },
      },
      include: getQtsInclude(),
      orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
      take: QTS_ARCHIVE_BATCH_SIZE,
    });

    if (oldQts.length === 0) {
      break;
    }

    await prisma.$transaction(async (tx) => {
      await tx.qtsArchive.createMany({
        data: oldQts.map((qts) => ({
          id: qts.id,
          startDate: qts.startDate,
          endDate: qts.endDate,
          status: qts.status,
          content: qts.content,
          militaryOrganizationId: qts.militaryOrganizationId,
          createdById: qts.createdById,
          validatedById: qts.validatedById,
          validatedAt: qts.validatedAt,
          approvedById: qts.approvedById,
          approvedAt: qts.approvedAt,
          archivePlacedAt: new Date(),
          createdAt: qts.createdAt,
          updatedAt: qts.updatedAt,
        })),
      });

      await tx.qts.deleteMany({
        where: { id: { in: oldQts.map((qts) => qts.id) } },
      });
    });
  }
}

function scheduleQtsArchiveJob() {
  const runJob = () => {
    archiveOldApprovedQts().catch((error) => {
      console.error("Erro no arquivamento automático de QTS:", error);
    });
  };

  const agora = new Date();
  const proximaExecucao = new Date(agora);
  proximaExecucao.setUTCHours(3, 15, 0, 0);
  if (proximaExecucao <= agora) {
    proximaExecucao.setUTCDate(proximaExecucao.getUTCDate() + 1);
  }

  const delay = proximaExecucao.getTime() - agora.getTime();
  setTimeout(() => {
    runJob();
    setInterval(runJob, 24 * 60 * 60 * 1000);
  }, delay);
}

scheduleQtsArchiveJob();

// Excluir QTS: editor pode excluir minuta/validado; aprovador pode rejeitar (excluir) validado
app.delete("/qts/:id", verificarToken, async (req, res) => {
  const omId = await getCurrentUserOmId(req.user.userId);
  if (!omId) {
    return res.status(403).json({ error: "Usuário sem OM vinculada" });
  }

  const qts = await prisma.qts.findFirst({
    where: { id: req.params.id, militaryOrganizationId: omId },
    select: { id: true, status: true },
  });
  if (!qts) {
    return res.status(404).json({ error: "QTS não encontrado" });
  }
  if (qts.status === "aprovado") {
    throw new ValidationError("Um QTS aprovado não pode ser excluído");
  }

  const roleCodes = await getRoleCodesByUserId(req.user.userId);
  const ehEditor = roleCodes.includes("editor");
  const ehAprovador = roleCodes.includes("aprovador");
  // Aprovador pode rejeitar (excluir) um QTS validado; demais exclusões exigem editor.
  const permitido =
    ehEditor || (qts.status === "validado" && ehAprovador);
  if (!permitido) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  await prisma.qts.delete({ where: { id: qts.id } });
  res.json({ success: true });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (error instanceof ValidationError || error instanceof AuthenticationError) {
    return res.status(error.status).json({ error: error.message });
  }

  return res.status(500).json({ error: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 4000;
const BIND_HOST = getEnv("BIND_HOST", "0.0.0.0");

app.listen(PORT, BIND_HOST, () => {
  console.log(`API running at http://${BIND_HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
