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

async function healthResponse(): Promise<Response> {
  const checks = {
    app: "ok",
    timestamp: new Date().toISOString(),
    database: "unknown",
    telegram: "unknown",
  };
  let healthy = true;

  try {
    const { supabaseAdmin } = await import("./integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("bot_settings").select("id").eq("id", true).maybeSingle();
    checks.database = error ? "error" : "ok";
    if (error) healthy = false;
  } catch {
    checks.database = "error";
    healthy = false;
  }

  try {
    const { getBotToken } = await import("./lib/telegram.server");
    const { token } = await getBotToken();
    checks.telegram = token || process.env["TELEGRAM_BOT_TOKEN"] ? "configured" : "missing";
    if (checks.telegram === "missing") healthy = false;
  } catch {
    checks.telegram = "error";
    healthy = false;
  }

  return Response.json(checks, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (new URL(request.url).pathname === "/api/health") return await healthResponse();
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
