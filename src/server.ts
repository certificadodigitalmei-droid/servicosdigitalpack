import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function isBrazilRequest(request: Request): boolean {
  const country =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("x-country-code") ||
    "";
  return country.toUpperCase() === "BR";
}

function shouldBypassGeoBlock(url: URL): boolean {
  // Webhooks/cron/callbacks externos precisam continuar acessíveis globalmente.
  return url.pathname.startsWith("/api/public/") || url.pathname.startsWith("/api/internal/");
}

// Somente estas rotas são acessíveis publicamente. Qualquer outro caminho
// (incluindo a raiz "/") redireciona para o Google — o site só pode ser
// visto por quem tem o link direto de checkout / acesso.
const ALLOWED_PATH_PREFIXES = [
  "/c/",
  "/acesso/",
  "/certificado-mei/",
  "/checkout",
  "/auth",
  "/login",
  "/painel",
  "/monitor-envio",
  "/modelo",
  "/api/",
  "/_build/",
  "/_server/",
  "/assets/",
  "/lovable/",
  "/.well-known/",
];

const ALLOWED_EXACT_PATHS = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

function isPubliclyAccessible(url: URL): boolean {
  const p = url.pathname;
  if (ALLOWED_EXACT_PATHS.has(p)) return true;
  // permite qualquer arquivo estático com extensão (js, css, png, svg, ...)
  if (/\.[a-zA-Z0-9]{2,5}$/.test(p)) return true;
  return ALLOWED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
}

function withNoIndexHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (!shouldBypassGeoBlock(url) && !isBrazilRequest(request)) {
        return Response.redirect("https://www.google.com/", 302);
      }
      if (!shouldBypassGeoBlock(url) && !isPubliclyAccessible(url)) {
        return Response.redirect("https://www.google.com/", 302);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withNoIndexHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};


