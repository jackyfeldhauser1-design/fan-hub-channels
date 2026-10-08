export type TelegramStartAttribution = {
  payload: string;
  source: string;
  campaign: string | null;
  variant: string | null;
};

export function parseTelegramStartPayload(raw: unknown): TelegramStartAttribution {
  const payload = String(raw ?? "").trim().slice(0, 64);
  if (!payload) return { payload: "", source: "telegram:direct", campaign: null, variant: null };

  const parts = payload.split("_");
  const campaign = parts.find((p) => /^(?:campaign|cmp|src)$/i.test(p)) ? parts.slice(1).join("_") : null;
  const variant = parts.find((p) => /^v[ab]$/i.test(p))?.toUpperCase() ?? null;

  let source = "telegram:" + payload;
  if (payload === "free" || payload.startsWith("free_")) source = "telegram:free";
  else if (payload === "vip" || payload.startsWith("vip_")) source = "telegram:vip";
  else if (payload === "story" || payload.startsWith("story_")) source = "telegram:story";
  else if (payload === "set5" || payload.startsWith("set5_")) source = "telegram:set5";
  else if (payload === "set10" || payload.startsWith("set10_")) source = "telegram:set10";
  else if (payload.startsWith("c_")) source = "telegram:content";
  else if (payload.startsWith("p_")) source = "telegram:product";
  else if (payload.startsWith("ref_")) source = "telegram:referral";
  else if (payload.startsWith("ea_")) source = "telegram:early-access";
  else if (payload.startsWith("spo_")) source = "telegram:sponsored";

  return { payload, source, campaign, variant };
}
