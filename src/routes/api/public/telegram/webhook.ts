import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function deriveSecret(apiKey: string) {
  return createHash("sha256").update(`telegram-webhook:${apiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": `${process.env["TELEGRAM_API_KEY"]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
    return null;
  }
  const json = JSON.parse(text) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) {
    console.error(`Telegram ${method} error: ${json.description}`);
    return null;
  }
  return json.result as Record<string, unknown>;
}

function code() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type Btn = { text: string; callback_data?: string; url?: string; pay?: boolean };

const mainMenu = (free: string, vip: string): Btn[][] => {
  const rows: Btn[][] = [];
  if (free) rows.push([{ text: "🎁 Gratis-Gruppe für Fans", url: free }]);
  rows.push([{ text: "🛍 Shop", callback_data: "shop" }, { text: "🔓 Pay-per-View", callback_data: "ppv" }]);
  rows.push([{ text: "⭐ VIP-Zugang", callback_data: "vip" }, { text: "💛 Trinkgeld", callback_data: "tips" }]);
  rows.push([{ text: "🤝 Empfehlen & verdienen", callback_data: "ref" }]);
  if (vip) rows.push([{ text: "ℹ️ Meine Käufe", callback_data: "mine" }]);
  return rows;
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["TELEGRAM_API_KEY"];
        if (!apiKey) return new Response("not configured", { status: 500 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, deriveSecret(apiKey))) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json()) as any;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        const msg = update.message ?? update.edited_message;
        if (typeof update.update_id === "number") {
          await db.from("telegram_updates").upsert(
            {
              update_id: update.update_id,
              chat_id: msg?.chat?.id ?? update.callback_query?.message?.chat?.id ?? null,
              telegram_user_id: msg?.from?.id ?? update.callback_query?.from?.id ?? null,
              text: msg?.text ?? null,
              raw: update,
            },
            { onConflict: "update_id" },
          );
        }

        const settings =
          (await db.from("bot_settings").select("*").eq("id", true).maybeSingle()).data ?? {};

        async function ensureUser(from: any, startPayload?: string) {
          const existing = (
            await db.from("tg_users").select("*").eq("telegram_id", from.id).maybeSingle()
          ).data;
          if (existing) {
            await db
              .from("tg_users")
              .update({ username: from.username ?? null, last_seen_at: new Date().toISOString() })
              .eq("id", existing.id);
            return existing;
          }
          let referredBy: string | null = null;
          if (startPayload?.startsWith("ref_")) {
            const ref = (
              await db
                .from("tg_users")
                .select("id")
                .eq("referral_code", startPayload.slice(4).toUpperCase())
                .maybeSingle()
            ).data;
            if (ref) referredBy = ref.id;
          }
          const inserted = (
            await db
              .from("tg_users")
              .insert({
                telegram_id: from.id,
                username: from.username ?? null,
                first_name: from.first_name ?? null,
                referral_code: `${code()}${from.id % 97}`,
                referred_by: referredBy,
              })
              .select("*")
              .single()
          ).data;
          return inserted;
        }

        async function sendMenu(chatId: number, text: string) {
          await tg("sendMessage", {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: mainMenu(settings.free_group_url, settings.vip_group_url) },
          });
        }

        async function listProducts(chatId: number, kinds: string[], title: string) {
          const { data: products } = await db
            .from("products")
            .select("*")
            .eq("active", true)
            .in("kind", kinds)
            .order("sort_order");
          if (!products?.length) {
            await tg("sendMessage", { chat_id: chatId, text: "Hier ist gerade nichts verfügbar. Schau bald wieder rein!" });
            return;
          }
          const keyboard = products.map((p: any) => [
            { text: `${p.title} — ⭐ ${p.price_stars}`, callback_data: `buy_${p.id}` },
          ]);
          await tg("sendMessage", {
            chat_id: chatId,
            text: `<b>${title}</b>`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          });
        }

        async function deliver(chatId: number, product: any) {
          if (!product) return;
          if (product.delivery_type === "file" && product.delivery_payload) {
            await tg("sendDocument", { chat_id: chatId, document: product.delivery_payload, caption: product.title });
          } else if (product.delivery_type === "link" && product.delivery_payload) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: `✅ <b>${product.title}</b>\nDein Zugang:`,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "Jetzt öffnen", url: product.delivery_payload }]] },
            });
          } else {
            await tg("sendMessage", {
              chat_id: chatId,
              text: `✅ <b>${product.title}</b>\n\n${product.delivery_payload || "Danke für deinen Kauf!"}`,
              parse_mode: "HTML",
            });
          }
          if (product.upsell_product_id) {
            const { data: up } = await db
              .from("products")
              .select("*")
              .eq("id", product.upsell_product_id)
              .maybeSingle();
            if (up?.active) {
              await tg("sendMessage", {
                chat_id: chatId,
                text: `${settings.upsell_message ?? "Das könnte dir auch gefallen:"}\n<b>${up.title}</b>`,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [[{ text: `Jetzt sichern — ⭐ ${up.price_stars}`, callback_data: `buy_${up.id}` }]],
                },
              });
            }
          }
        }

        // ---- callback queries ----
        const cq = update.callback_query;
        if (cq) {
          const chatId = cq.message?.chat?.id;
          const user = await ensureUser(cq.from);
          await tg("answerCallbackQuery", { callback_query_id: cq.id });
          const d: string = cq.data ?? "";

          if (d === "shop") await listProducts(chatId, ["single", "bundle"], "🛍 Digitale Inhalte & Bundles");
          else if (d === "ppv") await listProducts(chatId, ["ppv"], "🔓 Pay-per-View");
          else if (d === "vip") {
            const { data: vipProducts } = await db
              .from("products")
              .select("*")
              .eq("active", true)
              .eq("delivery_type", "link")
              .order("sort_order");
            if (vipProducts?.length) {
              await tg("sendMessage", {
                chat_id: chatId,
                text: "⭐ <b>VIP-Zugang</b>\nBezahle mit Telegram Stars oder TON und du bekommst deinen Zugangslink sofort im Chat.",
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: vipProducts.map((p: any) => [
                    { text: `${p.title} — ⭐ ${p.price_stars}`, callback_data: `buy_${p.id}` },
                  ]),
                },
              });
            } else {
              await tg("sendMessage", { chat_id: chatId, text: "VIP-Zugang wird gerade vorbereitet." });
            }
          } else if (d === "tips") {
            await tg("sendMessage", {
              chat_id: chatId,
              text: settings.tip_message ?? "Danke für deine Unterstützung!",
              reply_markup: {
                inline_keyboard: [[50, 150, 500].map((n) => ({ text: `⭐ ${n}`, callback_data: `tip_${n}` }))],
              },
            });
          } else if (d === "ref") {
            const me = await tg("getMe", {});
            const link = `https://t.me/${(me as any)?.username}?start=ref_${user.referral_code}`;
            const { data: earned } = await db
              .from("purchases")
              .select("commission_stars")
              .eq("referrer_id", user.id)
              .eq("status", "paid");
            const total = (earned ?? []).reduce((s: number, r: any) => s + r.commission_stars, 0);
            await tg("sendMessage", {
              chat_id: chatId,
              text: `🤝 <b>Dein Empfehlungslink</b>\n${link}\n\nDu bekommst <b>${settings.affiliate_percent ?? 20}%</b> von jedem Kauf deiner Geworbenen.\nBisher verdient: <b>⭐ ${total}</b>`,
              parse_mode: "HTML",
            });
          } else if (d === "mine") {
            const { data: rows } = await db
              .from("purchases")
              .select("title_snapshot, amount_stars, created_at")
              .eq("tg_user_id", user.id)
              .eq("status", "paid")
              .order("created_at", { ascending: false })
              .limit(20);
            await tg("sendMessage", {
              chat_id: chatId,
              text: rows?.length
                ? `🧾 <b>Deine Käufe</b>\n${rows.map((r: any) => `• ${r.title_snapshot} — ⭐ ${r.amount_stars}`).join("\n")}`
                : "Du hast noch nichts gekauft.",
              parse_mode: "HTML",
            });
          } else if (d.startsWith("tip_")) {
            const amount = parseInt(d.slice(4), 10);
            await tg("sendInvoice", {
              chat_id: chatId,
              title: "Trinkgeld",
              description: "Danke für deine Unterstützung 💛",
              payload: `tip:${amount}`,
              currency: "XTR",
              prices: [{ label: "Trinkgeld", amount }],
            });
          } else if (d.startsWith("buy_")) {
            const id = d.slice(4);
            const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
            if (p) {
              await tg("sendInvoice", {
                chat_id: chatId,
                title: p.title.slice(0, 32),
                description: (p.description || p.title).slice(0, 255),
                payload: `p:${p.id}`,
                currency: "XTR",
                prices: [{ label: p.title.slice(0, 32), amount: p.price_stars }],
              });
              if (Number(p.price_ton) > 0 && settings.ton_wallet) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "Lieber mit Krypto zahlen?",
                  reply_markup: { inline_keyboard: [[{ text: `💎 ${p.price_ton} TON`, callback_data: `ton_${p.id}` }]] },
                });
              }
            }
          } else if (d.startsWith("ton_")) {
            const id = d.slice(4);
            const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
            if (p && settings.ton_wallet) {
              const memo = `TON-${code()}`;
              await db.from("purchases").insert({
                tg_user_id: user.id,
                product_id: p.id,
                title_snapshot: p.title,
                currency: "ton",
                amount_ton: p.price_ton,
                status: "pending",
                ton_memo: memo,
                referrer_id: user.referred_by,
              });
              const url = `ton://transfer/${settings.ton_wallet}?amount=${Math.round(Number(p.price_ton) * 1e9)}&text=${memo}`;
              await tg("sendMessage", {
                chat_id: chatId,
                text: `💎 <b>Zahlung in TON</b>\nBetrag: <b>${p.price_ton} TON</b>\nWallet: <code>${settings.ton_wallet}</code>\nVerwendungszweck: <code>${memo}</code>\n\nNach Bestätigung wird dein Inhalt freigeschaltet.`,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "In Wallet öffnen", url }]] },
              });
            }
          }
          return Response.json({ ok: true });
        }

        // ---- pre checkout ----
        if (update.pre_checkout_query) {
          await tg("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
          return Response.json({ ok: true });
        }

        if (!msg?.chat?.id) return Response.json({ ok: true, ignored: true });
        const chatId = msg.chat.id;

        // ---- successful payment ----
        const sp = msg.successful_payment;
        if (sp) {
          const user = await ensureUser(msg.from);
          const payload: string = sp.invoice_payload ?? "";
          const percent = settings.affiliate_percent ?? 20;
          let product: any = null;
          if (payload.startsWith("p:")) {
            product = (await db.from("products").select("*").eq("id", payload.slice(2)).maybeSingle()).data;
          }
          const commission = user.referred_by ? Math.floor((sp.total_amount * percent) / 100) : 0;
          await db.from("purchases").insert({
            tg_user_id: user.id,
            product_id: product?.id ?? null,
            title_snapshot: product?.title ?? "Trinkgeld",
            currency: "stars",
            amount_stars: sp.total_amount,
            status: "paid",
            telegram_charge_id: sp.telegram_payment_charge_id,
            referrer_id: user.referred_by,
            commission_stars: commission,
          });
          if (product) await deliver(chatId, product);
          else await tg("sendMessage", { chat_id: chatId, text: "💛 Danke für dein Trinkgeld!" });

          if (user.referred_by && commission > 0) {
            const { data: ref } = await db
              .from("tg_users")
              .select("telegram_id")
              .eq("id", user.referred_by)
              .maybeSingle();
            if (ref)
              await tg("sendMessage", {
                chat_id: ref.telegram_id,
                text: `🤝 Provision gutgeschrieben: ⭐ ${commission}`,
              });
          }
          return Response.json({ ok: true });
        }

        // ---- commands ----
        const text: string = msg.text ?? "";
        if (text.startsWith("/start")) {
          const payload = text.split(" ")[1];
          const user = await ensureUser(msg.from, payload);
          await sendMenu(
            chatId,
            `${settings.welcome_message ?? "Willkommen!"}\n\nHallo ${user.first_name ?? ""}! 👋`,
          );
        } else if (text.startsWith("/shop")) {
          await ensureUser(msg.from);
          await listProducts(chatId, ["single", "bundle"], "🛍 Digitale Inhalte & Bundles");
        } else if (text.startsWith("/id")) {
          await tg("sendMessage", { chat_id: chatId, text: `Chat-ID: <code>${chatId}</code>`, parse_mode: "HTML" });
        } else if (text) {
          await ensureUser(msg.from);
          await sendMenu(chatId, "Wähle aus, was du sehen möchtest:");
        }

        return Response.json({ ok: true });
      },
    },
  },
});
