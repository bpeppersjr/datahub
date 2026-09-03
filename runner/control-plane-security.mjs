import { randomBytes, timingSafeEqual } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_ORIGINS = Object.freeze(["null", "http://localhost:3000", "http://127.0.0.1:3000"]);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizedListenHost(value) {
  const host = String(value ?? "").trim().toLocaleLowerCase("en-US").replace(/^\[(.*)\]$/, "$1");
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("The Co*Tive Collector runner may bind only to a loopback host.");
  return host;
}

function normalizedPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("RUNNER_PORT must be an integer from 1 through 65535.");
  return port;
}

function normalizedOrigin(value) {
  const origin = String(value ?? "").trim();
  if (origin === "null") return origin;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid allowed control-plane origin: ${origin || "(blank)"}.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
    throw new Error(`Allowed control-plane origins must be exact HTTP(S) origins: ${origin}.`);
  }
  return parsed.origin;
}

function normalizedToken(value) {
  const token = String(value ?? "");
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("DATAHUB_CONTROL_TOKEN must contain at least 32 bytes.");
  if (Buffer.byteLength(token, "utf8") > 512) throw new Error("DATAHUB_CONTROL_TOKEN exceeds the 512-byte limit.");
  return token;
}

function authorized(expected, candidate) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");
  return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function createControlToken() {
  return randomBytes(32).toString("base64url");
}

export function configuredAllowedOrigins(value = process.env.DATAHUB_ALLOWED_ORIGINS) {
  if (value === undefined || value === null || value === "") return [...DEFAULT_ORIGINS];
  const origins = String(value).split(",").map((item) => item.trim()).filter(Boolean).map(normalizedOrigin);
  if (!origins.length) throw new Error("DATAHUB_ALLOWED_ORIGINS must contain at least one exact origin.");
  return [...new Set(origins)];
}

export function createLocalControlPlaneGuard({
  host,
  port,
  controlToken = createControlToken(),
  allowedOrigins = configuredAllowedOrigins(),
} = {}) {
  normalizedListenHost(host);
  const safePort = normalizedPort(port);
  const token = normalizedToken(controlToken);
  const origins = new Set(allowedOrigins.map(normalizedOrigin));
  if (!origins.size) throw new Error("At least one exact control-plane origin is required.");
  const allowedHosts = new Set([
    `127.0.0.1:${safePort}`,
    `localhost:${safePort}`,
    `[::1]:${safePort}`,
  ]);

  function prepare(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const requestHost = String(request.headers.host ?? "").toLocaleLowerCase("en-US");
    if (!allowedHosts.has(requestHost)) throw httpError(400, "Request Host is not allowed.");
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!origins.has(origin)) throw httpError(403, "Request Origin is not allowed.");
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.setHeader("Access-Control-Max-Age", "600");
    }
  }

  function authorize(request) {
    const header = String(request.headers.authorization ?? "");
    const match = header.match(/^Bearer ([^\s]+)$/);
    if (!match || !authorized(token, match[1])) {
      throw Object.assign(new Error("Control-plane authorization is required."), {
        statusCode: 401,
        responseHeaders: { "WWW-Authenticate": "Bearer" },
      });
    }
  }

  return { prepare, authorize };
}
