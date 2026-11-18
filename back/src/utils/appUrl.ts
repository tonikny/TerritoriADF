import os from "node:os";
import { config } from "./config.js";

/** Troba la primera IP IPv4 no interna del servidor (ex. 192.168.1.138). */
function lanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) {
        return i.address;
      }
    }
  }
  return null;
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const CONFIGURED_BASE = config.BASE_DOMAIN_URL.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
const CONFIGURED_HOSTNAME = hostnameOf(CONFIGURED_BASE);

/**
 * URL base per als enllaços de Telegram i d'accés.
 * Només es confia en el `Host` si és el domini configurat (`BASE_DOMAIN_URL`) o
 * un host local de desenvolupament. Qualsevol altre valor cau al domini
 * configurat, de manera que una capçalera `Host` falsificada no pot desviar
 * enllaços ni enllaços d'accés.
 */
export function appBaseUrl(req: {
  headers?: { host?: string; "x-forwarded-proto"?: string };
}): string {
  const host = req.headers?.host;
  const hostname = hostnameOf(host);

  if (!host || !hostname) {
    return `https://${CONFIGURED_BASE}`;
  }

  const isLocal = LOCAL_HOSTNAMES.has(hostname);
  const isConfigured = CONFIGURED_HOSTNAME !== null && hostname === CONFIGURED_HOSTNAME;

  if (!isLocal && !isConfigured) {
    return `https://${CONFIGURED_BASE}`;
  }

  let finalHost = host;
  if (isLocal) {
    // Telegram no renderitza els buclics: els canviem per la IP LAN del servidor.
    const port = new URL(`http://${host}`).port;
    const ip = lanIp();
    if (ip) {
      finalHost = port ? `${ip}:${port}` : ip;
    }
  }

  const protocol = req.headers?.["x-forwarded-proto"] || "https";
  return `${protocol}://${finalHost}`;
}
