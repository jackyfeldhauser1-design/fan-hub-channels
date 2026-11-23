import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePublicBaseUrl, resolveTelegramWebhookUrl } from "../src/lib/base-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public base URL and Telegram webhook", () => {
  it("does not fall back to a retired domain in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_APP_URL", "");
    expect(resolvePublicBaseUrl()).toBe("");
    expect(resolveTelegramWebhookUrl()).toBe("");
  });

  it("uses an explicitly configured HTTPS origin", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    expect(resolvePublicBaseUrl({ app_base_url: "https://itsfelize.de/" })).toBe("https://itsfelize.de");
    expect(resolveTelegramWebhookUrl({ app_base_url: "https://itsfelize.de/" }))
      .toBe("https://itsfelize.de/api/public/telegram/webhook");
  });

  it("uses a dedicated Telegram webhook origin without changing the customer domain", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://itsfelize.de");
    vi.stubEnv("TELEGRAM_WEBHOOK_BASE_URL", "https://fan-hub-vercel2.vercel.app");
    expect(resolvePublicBaseUrl({ app_base_url: "https://itsfelize.store" })).toBe("https://itsfelize.de");
    expect(resolveTelegramWebhookUrl({ app_base_url: "https://itsfelize.de" }))
      .toBe("https://fan-hub-vercel2.vercel.app/api/public/telegram/webhook");
  });

  it("refuses an invalid dedicated webhook origin rather than falling back", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TELEGRAM_WEBHOOK_BASE_URL", "http://unsafe.example");
    expect(resolveTelegramWebhookUrl({ app_base_url: "https://itsfelize.store" })).toBe("");
  });

  it("rejects insecure or invalid production webhook URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_APP_URL", "");
    expect(resolveTelegramWebhookUrl({ app_base_url: "http://example.com" })).toBe("");
    expect(resolveTelegramWebhookUrl({ app_base_url: "not a URL" })).toBe("");
  });

  it("does not accept URL credentials or query parameters", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    expect(resolvePublicBaseUrl({ app_base_url: "https://user:pass@example.com" })).toBe("");
    expect(resolvePublicBaseUrl({ app_base_url: "https://example.com/?token=secret" })).toBe("");
  });
});
