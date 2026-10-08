import { describe, expect, it } from "vitest";
import { parseTelegramStartPayload } from "@/lib/telegram-funnel.server";

describe("Telegram funnel attribution", () => {
  it("normalisiert direkte Starts", () => {
    expect(parseTelegramStartPayload("")).toMatchObject({ payload: "", source: "telegram:direct" });
  });
  it("ordnet die Kern-Funnelquellen zu", () => {
    expect(parseTelegramStartPayload("free_vA")).toMatchObject({ source: "telegram:free", variant: "VA" });
    expect(parseTelegramStartPayload("set5_cmp_october")).toMatchObject({ source: "telegram:set5" });
    expect(parseTelegramStartPayload("p_123")).toMatchObject({ source: "telegram:product" });
  });
  it("begrenzt Telegram-Startparameter auf 64 Zeichen", () => {
    expect(parseTelegramStartPayload("x".repeat(100)).payload).toHaveLength(64);
  });
});
