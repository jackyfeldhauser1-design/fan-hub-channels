import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { tgSafe } from "@/lib/telegram.server";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function tg(method: string, body: Record<string, unknown>) {
  return (await tgSafe(method, body)) as Record<string, unknown> | null;
}


function code() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type Btn = { text: string; callback_data?: string; url?: string; pay?: boolean };

const mainMenu = (free: string, vip: string): Btn[][] => {
  const rows: Btn[][] = [];
  rows.push([{ text: "🎁 Gratis-Gruppe beitreten", callback_data: "join_free" }]);
  rows.push([{ text: "🛍 Shop", callback_data: "shop" }, { text: "🔓 Pay-per-View", callback_data: "ppv" }]);
  rows.push([{ text: "⭐ VIP-Zugang", callback_data: "vip" }, { text: "💛 Trinkgeld", callback_data: "tips" }]);
  rows.push([{ text: "🤝 Empfehlen & verdienen", callback_data: "ref" }]);
  rows.push([
    { text: "🚀 Early Access", callback_data: "ea" },
    { text: "📣 Werbung buchen", callback_data: "ads" },
  ]);
  rows.push([{ text: "ℹ️ Meine Käufe", callback_data: "mine" }]);
  void free;
  void vip;
  return rows;
};


export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { validWebhookSecrets } = await import("@/lib/telegram.server");
        const secrets = await validWebhookSecrets();
        if (secrets.length === 0) return new Response("not configured", { status: 500 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!secrets.some((s) => safeEqual(got, s))) return new Response("Unauthorized", { status: 401 });


        const raw = await request.text();
        if (raw.length > 200_000) return new Response("payload too large", { status: 413 });
        let update: any;
        try {
          update = JSON.parse(raw);
        } catch {
          return new Response("bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          guardAction,
          flagRepeatPayment,
          deliverProduct,
          logOrderEvent,
        } = await import("@/lib/fulfillment.server");
        const { acceptTelegramUpdate, rateLimit } = await import("@/lib/security.server");
        const db = supabaseAdmin as any;

        const msg = update.message ?? update.edited_message;

        // Replay-Schutz: doppelte oder veraltete Updates werden verworfen.
        const replay = await acceptTelegramUpdate(db, update);
        if (!replay.accept) {
          console.warn(`Telegram update abgewiesen: ${replay.reason}`);
          return Response.json({ ok: true, ignored: replay.reason });
        }

        const fromId = msg?.from?.id ?? update.callback_query?.from?.id ?? null;
        if (fromId) {
          const gate = await rateLimit(db, "tg_update", String(fromId), 60, 60_000);
          if (!gate.allowed) return Response.json({ ok: true, ignored: "rate limited" });
        }

        await db.from("telegram_updates").upsert(
          {
            update_id: update.update_id,
            chat_id: msg?.chat?.id ?? update.callback_query?.message?.chat?.id ?? null,
            telegram_user_id: fromId,
            text: msg?.text ?? null,
            raw: update,
          },
          { onConflict: "update_id" },
        );

        /* ---- Geführtes Setup: Bot wurde einer Gruppe/Kanal hinzugefügt ---- */
        const setupText: string = msg?.text ?? "";
        const setupMatch = /^\/start(?:@\w+)?\s+(S[A-Z0-9]{6,12})\b/i.exec(setupText.trim());
        const groupAddChat =
          update.my_chat_member?.chat ?? (msg?.new_chat_members?.length ? msg.chat : null);
        const memberStatus = update.my_chat_member?.new_chat_member?.status;

        if (setupMatch && msg?.chat) {
          const { redeemSetupCode } = await import("@/lib/setup.server");
          const res = await redeemSetupCode(db, setupMatch[1]!, msg.chat);
          if (res.ok) return Response.json({ ok: true, setup: (res as any).target });
        } else if (groupAddChat && (!memberStatus || ["member", "administrator", "creator"].includes(memberStatus))) {
          const { claimPendingForChat } = await import("@/lib/setup.server");
          const res = await claimPendingForChat(
            db,
            String(groupAddChat.id),
            groupAddChat.title ?? "",
            groupAddChat.type ?? "",
          );
          if (res.ok) return Response.json({ ok: true, setup: (res as any).target });
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

        async function deliver(chatId: number, product: any, purchase: any) {
          await deliverProduct(db, tg, chatId, product, purchase, settings);
        }

        // ---- callback queries ----
        const cq = update.callback_query;
        if (cq) {
          const chatId = cq.message?.chat?.id;
          const user = await ensureUser(cq.from);
          await tg("answerCallbackQuery", { callback_query_id: cq.id });
          const d: string = cq.data ?? "";

          if (user?.blocked) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: "🚫 Dein Zugang ist zur Prüfung gesperrt. Bitte melde dich beim Support.",
            });
            return Response.json({ ok: true });
          }
          if (d.startsWith("buy_") || d.startsWith("ton_") || d.startsWith("tip_")) {
            const reason = await guardAction(db, user, settings, "buy");
            if (reason) {
              await tg("sendMessage", { chat_id: chatId, text: `⚠️ ${reason}` });
              return Response.json({ ok: true });
            }
          }
          if (d === "ref") {
            const reason = await guardAction(db, user, settings, "referral");
            if (reason) {
              await tg("sendMessage", { chat_id: chatId, text: `⚠️ ${reason}` });
              return Response.json({ ok: true });
            }
          }

          if (d === "join_free") {
            const { personalInvite } = await import("@/lib/vip.server");
            const label = cq.from.username ? `@${cq.from.username}` : (cq.from.first_name ?? "Fan");
            const invite = await personalInvite(settings, "community", `Fan ${label}`);
            if (invite.url) {
              await db.from("tg_users").update({ joined_free: true }).eq("id", user.id);
              await logOrderEvent(db, null, user.id, "free_invite", invite.personal ? "persönlich" : "fallback");
              await tg("sendMessage", {
                chat_id: chatId,
                text: "🎁 <b>Willkommen!</b>\nHier ist dein Zugang zur kostenlosen Fan-Gruppe.",
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "Gratis-Gruppe öffnen", url: invite.url }]] },
              });
            } else {
              await tg("sendMessage", { chat_id: chatId, text: "Die Gratis-Gruppe wird gerade eingerichtet." });
            }
          } else if (d === "shop") await listProducts(chatId, ["single", "bundle"], "🛍 Digitale Inhalte & Bundles");
          else if (d === "ppv") await listProducts(chatId, ["ppv"], "🔓 Pay-per-View");
          else if (d === "vip") {
            const { hasVipAccess, grantVipAccess } = await import("@/lib/vip.server");
            if (await hasVipAccess(db, user.id)) {
              await grantVipAccess(db, tg as any, chatId, user, settings, null);
            } else {
              const price = Math.max(1, Number(settings.vip_price_stars ?? 450));
              await tg("sendInvoice", {
                chat_id: chatId,
                title: String(settings.vip_product_title ?? "VIP-Zugang").slice(0, 32),
                description: "Dauerhafter Zugang zum VIP-Shop-Channel mit allen Drops und Angeboten.",
                payload: "vip:access",
                currency: "XTR",
                prices: [{ label: "VIP-Zugang", amount: price }],
              });
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
          } else if (d === "ea") {
            const price = Math.max(1, Number(settings.early_access_price_stars ?? 250));
            const { data: lead } = await db
              .from("leads")
              .insert({
                name: cq.from.first_name ?? "",
                telegram_handle: cq.from.username ?? "",
                source: "telegram",
                early_access: true,
                claim_token: `tg${cq.from.id}-${Date.now().toString(36)}`,
              })
              .select("id")
              .single();
            await tg("sendInvoice", {
              chat_id: chatId,
              title: "Early-Access-Slot",
              description: "Vorabzugang zum nächsten Drop, bevor er öffentlich wird.",
              payload: `lead:${lead.id}`,
              currency: "XTR",
              prices: [{ label: "Early Access", amount: price }],
            });
          } else if (d === "ads") {
            await tg("sendMessage", {
              chat_id: chatId,
              text: `📣 <b>Werbepost buchen</b>\nPreis: <b>⭐ ${settings.sponsor_price_stars ?? 1500}</b> pro Post in unserer Community.\n\nSchicke einfach:\n<code>/werbung Dein Anzeigentext</code>\n\nDu bekommst sofort eine Rechnung in Stars. Nach Freigabe wird dein Post in der Gruppe veröffentlicht.`,
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
              await logOrderEvent(db, null, user.id, "ton_created", memo);
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

          // paid early-access slot from the waitlist form
          if (payload.startsWith("lead:")) {
            await db
              .from("leads")
              .update({ early_access_status: "paid", amount_stars: sp.total_amount })
              .eq("id", payload.slice(5));
          }
          // paid sponsored post booking
          if (payload.startsWith("sp:")) {
            await db.from("sponsored_posts").update({ status: "paid" }).eq("id", payload.slice(3));
          }

          const { data: purchase } = await db
            .from("purchases")
            .insert({
              tg_user_id: user.id,
              product_id: product?.id ?? null,
              title_snapshot:
                product?.title ??
                (payload.startsWith("vip:")
                  ? "VIP"
                  : payload.startsWith("lead:")
                    ? "Early-Access-Slot"
                    : payload.startsWith("sp:")
                      ? "Werbepost"
                      : "Trinkgeld"),
              currency: "stars",
              amount_stars: sp.total_amount,
              status: "paid",
              telegram_charge_id: sp.telegram_payment_charge_id,
              referrer_id: user.referred_by,
              commission_stars: commission,
              delivery_status: product || payload.startsWith("vip:") ? "pending" : "delivered",
              delivered_at: product || payload.startsWith("vip:") ? null : new Date().toISOString(),
            })
            .select("id, tg_user_id")
            .single();

          await logOrderEvent(db, purchase?.id ?? null, user.id, "paid", `stars:${sp.total_amount}`);
          await flagRepeatPayment(db, user, product?.id ?? null);

          if (payload.startsWith("vip:")) {
            const { grantVipAccess } = await import("@/lib/vip.server");
            await grantVipAccess(db, tg as any, chatId, user, settings, purchase?.id ?? null);
          } else if (product) await deliver(chatId, product, purchase);
          else if (payload.startsWith("lead:"))
            await tg("sendMessage", {
              chat_id: chatId,
              text: "🚀 Dein Early-Access-Slot ist gesichert! Du wirst als Erste:r benachrichtigt, sobald der Drop live geht.",
            });
          else if (payload.startsWith("sp:"))
            await tg("sendMessage", {
              chat_id: chatId,
              text: "✅ Deine Werbebuchung ist bezahlt und wird nach Freigabe veröffentlicht.",
            });
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
          // Direkter Kauf-Link aus einem Shop-/Community-Post: /start p_<id>
          if (payload?.startsWith("p_")) {
            const { data: p } = await db.from("products").select("*").eq("id", payload.slice(2)).maybeSingle();
            if (p?.active) {
              await tg("sendInvoice", {
                chat_id: chatId,
                title: String(p.title).slice(0, 32),
                description: String(p.description || p.title).slice(0, 255),
                payload: `p:${p.id}`,
                currency: "XTR",
                prices: [{ label: String(p.title).slice(0, 32), amount: Math.max(1, Number(p.price_stars)) }],
              });
              return Response.json({ ok: true });
            }
          }
          if (payload === "vip") {
            const { hasVipAccess, grantVipAccess } = await import("@/lib/vip.server");
            if (await hasVipAccess(db, user.id)) await grantVipAccess(db, tg as any, chatId, user, settings, null);
            else
              await tg("sendInvoice", {
                chat_id: chatId,
                title: String(settings.vip_product_title ?? "VIP-Zugang").slice(0, 32),
                description: "Dauerhafter Zugang zum VIP-Shop-Channel mit allen Drops und Angeboten.",
                payload: "vip:access",
                currency: "XTR",
                prices: [{ label: "VIP-Zugang", amount: Math.max(1, Number(settings.vip_price_stars ?? 450)) }],
              });
            return Response.json({ ok: true });
          }
          if (payload?.startsWith("ea_")) {

            const { data: lead } = await db
              .from("leads")
              .select("*")
              .eq("claim_token", payload.slice(3))
              .maybeSingle();
            if (lead && lead.early_access_status !== "paid") {
              await db.from("leads").update({ telegram_handle: msg.from.username ?? "" }).eq("id", lead.id);
              await tg("sendInvoice", {
                chat_id: chatId,
                title: "Early-Access-Slot",
                description: "Sichere dir vorab Zugang zum kommenden Drop.",
                payload: `lead:${lead.id}`,
                currency: "XTR",
                prices: [
                  {
                    label: "Early Access",
                    amount: Math.max(1, Number(settings.early_access_price_stars ?? 250)),
                  },
                ],
              });
              return Response.json({ ok: true });
            }
          }
          if (payload?.startsWith("spo_")) {
            const { data: post } = await db
              .from("sponsored_posts")
              .select("*")
              .eq("id", payload.slice(4))
              .maybeSingle();
            if (post && post.status !== "paid" && post.status !== "published") {
              await db.from("sponsored_posts").update({ tg_user_id: user.id }).eq("id", post.id);
              await tg("sendInvoice", {
                chat_id: chatId,
                title: "Werbepost buchen",
                description: `Bezahlter Post in der ${post.target === "vip" ? "VIP" : "Fan"}-Gruppe.`,
                payload: `sp:${post.id}`,
                currency: "XTR",
                prices: [
                  {
                    label: "Sponsored Post",
                    amount: Math.max(1, Number(post.price_stars || settings.sponsor_price_stars || 1500)),
                  },
                ],
              });
              return Response.json({ ok: true });
            }
          }
          await sendMenu(
            chatId,
            `${settings.welcome_message ?? "Willkommen!"}\n\nHallo ${user.first_name ?? ""}! 👋`,
          );
        } else if (text.startsWith("/shop")) {
          await ensureUser(msg.from);
          await listProducts(chatId, ["single", "bundle"], "🛍 Digitale Inhalte & Bundles");
        } else if (text.startsWith("/werbung")) {
          const user = await ensureUser(msg.from);
          const body = text.slice(8).trim();
          if (body.length < 10) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: "Bitte schicke deinen Anzeigentext direkt mit, z. B.:\n/werbung Entdecke unseren neuen Shop – 20% Rabatt!",
            });
          } else {
            const price = Math.max(1, Number(settings.sponsor_price_stars ?? 1500));
            const { data: post } = await db
              .from("sponsored_posts")
              .insert({
                advertiser: msg.from.username ? `@${msg.from.username}` : (msg.from.first_name ?? "Partner"),
                contact: msg.from.username ? `@${msg.from.username}` : String(msg.from.id),
                target: "free",
                content: body.slice(0, 1500),
                price_stars: price,
                status: "requested",
                tg_user_id: user.id,
              })
              .select("id")
              .single();
            await tg("sendInvoice", {
              chat_id: chatId,
              title: "Werbepost buchen",
              description: "Bezahlter Post in unserer Telegram-Community.",
              payload: `sp:${post.id}`,
              currency: "XTR",
              prices: [{ label: "Sponsored Post", amount: price }],
            });
          }
        } else if (text.startsWith("/warteliste")) {
          await ensureUser(msg.from);
          await tg("sendMessage", {
            chat_id: chatId,
            text: `🚀 <b>Warteliste & Early Access</b>\nSichere dir für <b>⭐ ${settings.early_access_price_stars ?? 250}</b> den Vorabzugang zum nächsten Drop.`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "Early Access sichern", callback_data: "ea" }]] },
          });
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
