type ErrorContext = Record<string, unknown>;

export function reportAppError(error: unknown, context: ErrorContext = {}) {
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[Fan Funnel]", message, context, stack ?? "");

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fan-funnel:error", {
        detail: { message, stack, route: window.location.pathname, ...context },
      }),
    );
  }
}
