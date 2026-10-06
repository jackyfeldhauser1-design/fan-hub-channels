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

const mainMenu = (_free: string, _vip: string): Btn[][] => [
  [{ text: "🎁 Free", callback_data: "join_free" }, { text: "🛍 Shop", callback_data: "shop" }],
  [{ text: "🔥 Neue Drops", callback_data: "drops" }, { text: "🔓 Meine Inhalte", callback_data: "my_content" }],
  [{ text: "⭐ VIP", callback_data: "vip" }, { text: "🔓 Pay-per-View", callback_data: "ppv" }],
  [{ text: "🧾 Meine Käufe", callback_data: "mine" }, { text: "🤝 Empfehlen", callback_data: "ref" }],
  [{ text: "🚀 Early Access", callback_data: "ea" }, { text: "📣 Werbung buchen", callback_data: "ads" }],
];


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
          // Telegram wiederholt dieselbe update_id, wenn unser Handler nach der
          // Zahlungsbuchung bei der Content-Zustellung fehlgeschlagen ist. In
          // diesem Sonderfall darf der Replay-Schutz die idempotente Zustellung
          // nicht verhindern.
          const retryChargeId = msg?.successful_payment?.telegram_payment_charge_id as string | undefined;
          if (replay.reason === "duplicate update_id" && retryChargeId && msg?.chat?.id) {
            const { data: pendingPurchase } = await db
              .from("purchases")
              .select("id,tg_user_id,product_id,delivery_status")
              .eq("telegram_charge_id", retryChargeId)
              .maybeSingle();
            if (pendingPurchase?.product_id && pendingPurchase.delivery_status !== "delivered") {
              const { data: retryProduct } = await db.from("products").select("*").eq("id", pendingPurchase.product_id).maybeSingle();
              const retrySettings = (await db.from("bot_settings").select("*").eq("id", true).maybeSingle()).data ?? {};
              if (retryProduct) {
                await deliverProduct(db, tg, msg.chat.id, retryProduct, {
                  id: pendingPurchase.id,
                  tg_user_id: pendingPurchase.tg_user_id,
                }, retrySettings);
                return Response.json({ ok: true, duplicate: true, deliveryRetried: true });
              }
            }
          }
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
          // Willkommens-Sequenz für neue Fans starten
          if (inserted && settings.sequence_enabled !== false) {
            await db
              .from("fan_sequences")
              .insert({ tg_user_id: inserted.id, kind: "welcome", step: 0, next_at: new Date().toISOString() });
          }
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

        async function listNewDrops(chatId: number) {
          const { data: products } = await db
            .from("products")
            .select("*")
            .eq("active", true)
            .in("kind", ["single", "bundle", "ppv"])
            .order("created_at", { ascending: false })
            .limit(8);
          if (!products?.length) {
            await tg("sendMessage", { chat_id: chatId, text: "🔥 Noch keine neuen Drops verfügbar. Schau bald wieder vorbei!" });
            return;
          }
          await tg("sendMessage", {
            chat_id: chatId,
            text: "🔥 <b>Neue Drops</b>\n\nDie neuesten Inhalte zuerst:",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: products.map((p: any) => [
                { text: `${String(p.title).slice(0, 42)} — ⭐ ${p.price_stars}`, callback_data: `buy_${p.id}` },
              ]),
            },
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

        async function sendMyContent(chatId: number, userId: string) {
          const { listFanContent } = await import("@/lib/content.server");
          const rows = await listFanContent(db, userId);
          if (!rows.length) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: "🔒 Du hast noch keine aktiven Inhalte. Öffne den Shop und schalte dein erstes Set frei.",
              reply_markup: { inline_keyboard: [[{ text: "🛍 Shop öffnen", callback_data: "shop" }]] },
            });
            return;
          }
          await tg("sendMessage", {
            chat_id: chatId,
            text: "🔓 <b>Meine Inhalte</b>\nWähle einen freigeschalteten Inhalt:",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: rows.slice(0, 20).map((r: any) => [{
                text: `${r.content_sets.title}${r.expires_at ? ` · bis ${new Date(r.expires_at).toLocaleDateString("de-DE")}` : ""}`.slice(0, 60),
                callback_data: `content_${r.content_sets.id}`,
              }]),
            },
          });
        }

        /** Meldung in den Kontrollraum (Admin-Chat). */
        async function notifyControl(text: string) {
          const control = String(settings.control_chat_id ?? "").trim();
          if (!control) return;
          await tg("sendMessage", { chat_id: control, text, parse_mode: "HTML", disable_notification: true });
        }


        /** Rechnung senden und für die Warenkorb-Rettung merken. */
        async function invoice(
          chatId: number,
          userId: string | null,
          opts: { title: string; description: string; payload: string; label: string; amount: number },
        ) {
          const amount = Math.max(1, Math.round(opts.amount));
          const sent = await tg("sendInvoice", {
            chat_id: chatId,
            title: opts.title.slice(0, 32),
            description: opts.description.slice(0, 255),
            payload: opts.payload,
            currency: "XTR",
            prices: [{ label: opts.label.slice(0, 32), amount }],
          });
          // Nur einen offenen Warenkorb speichern, wenn Telegram die Rechnung
          // tatsächlich angenommen hat. Sonst kann der Fan den Button erneut
          // verwenden, ohne dass ein Phantom-Invoice entsteht.
          if (sent && userId) {
            const { recordInvoiceIntent } = await import("@/lib/billing.server");
            await recordInvoiceIntent(db, userId, chatId, opts.payload, opts.title, amount);
          }
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
          if (d.startsWith("buy_") || d.startsWith("buyc_") || d.startsWith("star_") || d.startsWith("ton_") || d.startsWith("trx_") || d.startsWith("tip_")) {
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
          } else if (d === "shop") await listProducts(chatId, ["single", "bundle", "ppv"], "🛍 Shop & Content");
          else if (d === "drops") await listNewDrops(chatId);
          else if (d === "ppv") await listProducts(chatId, ["ppv"], "🔓 Pay-per-View");
          else if (d === "vip") {
            const { hasVipAccess, grantVipAccess } = await import("@/lib/vip.server");
            const { activeSubscription } = await import("@/lib/billing.server");
            const periodDays = Math.max(0, Number(settings.vip_period_days ?? 0));
            const stillValid =
              periodDays > 0 ? Boolean(await activeSubscription(db, user.id)) : await hasVipAccess(db, user.id);
            if (stillValid) {
              await grantVipAccess(db, tg as any, chatId, user, settings, null);
            } else {
              const price = Math.max(1, Number(settings.vip_price_stars ?? 450));
              await invoice(chatId, user.id, {
                title: String(settings.vip_product_title ?? "VIP-Zugang"),
                description:
                  periodDays > 0
                    ? `Zugang zum VIP-Shop-Channel für ${periodDays} Tage – alle Drops inklusive.`
                    : "Dauerhafter Zugang zum VIP-Shop-Channel mit allen Drops und Angeboten.",
                payload: "vip:access",
                label: "VIP-Zugang",
                amount: price,
              });
            }
          } else if (d === "tips") {
            const tiers = String(settings.tip_amounts ?? "50,150,500")
              .split(",")
              .map((n: string) => parseInt(n.trim(), 10))
              .filter((n: number) => Number.isFinite(n) && n > 0)
              .slice(0, 4);
            await tg("sendMessage", {
              chat_id: chatId,
              text: settings.tip_message ?? "Danke für deine Unterstützung!",
              reply_markup: {
                inline_keyboard: [
                  (tiers.length ? tiers : [50, 150, 500]).map((n: number) => ({
                    text: `⭐ ${n}`,
                    callback_data: `tip_${n}`,
                  })),
                ],
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
          } else if (d === "my_content") {
            await sendMyContent(chatId, user.id);
          } else if (d.startsWith("content_")) {
            const reason = await guardAction(db, user, settings, "access");
            if (reason) {
              await tg("sendMessage", { chat_id: chatId, text: `⚠️ ${reason}` });
              return Response.json({ ok: true });
            }
            const { deliverContentSet } = await import("@/lib/content.server");
            const result = await deliverContentSet(db, tg, chatId, user.id, d.slice(8));
            if (!result.ok) {
              await tg("sendMessage", { chat_id: chatId, text: "🔒 Dieser Inhalt ist nicht freigeschaltet oder der Zugriff ist abgelaufen." });
            }
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
            await invoice(chatId, user.id, {
              title: "Trinkgeld",
              description: "Danke für deine Unterstützung 💛",
              payload: `tip:${amount}`,
              label: "Trinkgeld",
              amount,
            });
          } else if (d.startsWith("buy_") || d.startsWith("buyc_")) {
            const withCode = d.startsWith("buyc_");
            const rest = d.slice(withCode ? 5 : 4);
            const [id, codeId] = withCode ? rest.split("|") : [rest, ""];
            const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
            if (p?.active) {
              // Rabattcodes gelten aktuell nur für Stars, da TON/TRX als feste
              // On-Chain-Beträge am Produkt hinterlegt sind.
              if (withCode && codeId) {
                let amount = Number(p.price_stars);
                let payload = `p:${p.id}`;
                const { data: dc } = await db.from("discount_codes").select("code").eq("id", codeId).maybeSingle();
                if (dc) {
                  const { checkDiscount } = await import("@/lib/billing.server");
                  const res = await checkDiscount(db, dc.code, user.id, amount);
                  if (res.ok) {
                    amount = res.price;
                    payload = `p:${p.id}|c:${codeId}`;
                  }
                }
                await invoice(chatId, user.id, {
                  title: p.title,
                  description: p.description || p.title,
                  payload,
                  label: p.title,
                  amount,
                });
              } else {
                const paymentButtons: Array<Array<{ text: string; callback_data: string }>> = [];
                if (Number(p.price_stars) > 0) {
                  paymentButtons.push([{ text: `⭐ ${p.price_stars} Stars`, callback_data: `star_${p.id}` }]);
                }
                if (Number(p.price_ton) > 0 && settings.ton_wallet) {
                  paymentButtons.push([{ text: `💎 ${p.price_ton} TON`, callback_data: `ton_${p.id}` }]);
                }
                if (Number(p.price_trx) > 0 && settings.trx_wallet) {
                  paymentButtons.push([{ text: `🔺 ${p.price_trx} TRX`, callback_data: `trx_${p.id}` }]);
                }
                if (!paymentButtons.length) {
                  await tg("sendMessage", { chat_id: chatId, text: "Für dieses Angebot ist gerade keine Zahlungsart verfügbar." });
                } else {
                  await tg("sendMessage", {
                    chat_id: chatId,
                    text: `💳 <b>${p.title}</b>\n\nWähle deine Zahlungsart:`,
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: paymentButtons },
                  });
                }
              }
            }

          } else if (d.startsWith("star_")) {
            const id = d.slice(5);
            const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
            if (p?.active && Number(p.price_stars) > 0) {
              await invoice(chatId, user.id, {
                title: p.title,
                description: p.description || p.title,
                payload: `p:${p.id}`,
                label: p.title,
                amount: Number(p.price_stars),
              });
            }
          } else if (d.startsWith("ton_")) {
            const id = d.slice(4);
            const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
            if (p && Number(p.price_ton) > 0 && settings.ton_wallet) {
              const memo = `TON-${code()}`;
              const { data: purchase, error } = await db.from("purchases").insert({
                tg_user_id: user.id,
                product_id: p.id,
                title_snapshot: p.title,
                currency: "ton",
                amount_ton: p.price_ton,
                status: "pending",
                ton_memo: memo,
                referrer_id: user.referred_by,
              }).select("id").single();
              if (error) throw error;
              await logOrderEvent(db, purchase?.id ?? null, user.id, "ton_created", memo);
              const url = `ton://transfer/${settings.ton_wallet}?amount=${Math.round(Number(p.price_ton) * 1e9)}&text=${encodeURIComponent(memo)}`;
              await tg("sendMessage", {
                chat_id: chatId,
                text: `💎 <b>Zahlung in TON</b>\nBetrag: <b>${p.price_ton} TON</b>\nWallet: <code>${settings.ton_wallet}</code>\nVerwendungszweck: <code>${memo}</code>\n\nNach bestätigtem Eingang liefert der Bot den Inhalt automatisch aus.`,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "In TON-Wallet öffnen", url }]] },
              });
            }
          } else if (d.startsWith("trx_")) {
            const id = d.slice(4);
            const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
            if (p && Number(p.price_trx) > 0 && settings.trx_wallet) {
              const memo = `TRX-${code()}`;
              const { data: purchase, error } = await db.from("purchases").insert({
                tg_user_id: user.id,
                product_id: p.id,
                title_snapshot: p.title,
                currency: "trx",
                amount_trx: p.price_trx,
                status: "pending",
                trx_memo: memo,
                referrer_id: user.referred_by,
              }).select("id").single();
              if (error) throw error;
              await logOrderEvent(db, purchase?.id ?? null, user.id, "trx_created", memo);
              await tg("sendMessage", {
                chat_id: chatId,
                text: `🔺 <b>Zahlung in TRX (TRON)</b>\nBetrag: <b>${p.price_trx} TRX</b>\nTRON-Wallet: <code>${settings.trx_wallet}</code>\nReferenz: <code>${memo}</code>\n\nSende ausschließlich über das TRON-Netzwerk. Nach bestätigtem Eingang liefert der Bot den Inhalt automatisch aus.`,
                parse_mode: "HTML",
              });
            }
          }
          return Response.json({ ok: true });
        }

        // ---- pre checkout ----
        if (update.pre_checkout_query) {
          const pcq = update.pre_checkout_query;
          const payload = String(pcq.invoice_payload ?? "");
          const amount = Number(pcq.total_amount ?? 0);
          const currency = String(pcq.currency ?? "");
          let valid = currency === "XTR" && Number.isInteger(amount) && amount > 0;
          let reason = "Dieses Angebot ist nicht mehr verfügbar. Bitte öffne den Shop erneut.";

          if (valid && payload.startsWith("p:")) {
            const [productPart = "", codePart = ""] = payload.split("|");
            const productId = productPart.slice(2);
            const codeId = codePart.startsWith("c:") ? codePart.slice(2) : "";
            const { data: product } = await db.from("products").select("*").eq("id", productId).eq("active", true).maybeSingle();
            valid = Boolean(product);
            if (valid && product) {
              let expected = Math.max(1, Math.round(Number(product.price_stars)));
              if (codeId) {
                const { data: dc } = await db.from("discount_codes").select("code").eq("id", codeId).maybeSingle();
                if (!dc) valid = false;
                else {
                  const fan = await ensureUser(pcq.from);
                  const { checkDiscount } = await import("@/lib/billing.server");
                  const discounted = await checkDiscount(db, dc.code, fan.id, expected);
                  valid = discounted.ok;
                  if (discounted.ok) expected = Math.max(1, Math.round(discounted.price));
                }
              }
              if (valid) valid = amount === expected;
            }
          } else if (valid && payload === "vip:access") {
            valid = amount === Math.max(1, Math.round(Number(settings.vip_price_stars ?? 450)));
          } else if (valid && payload.startsWith("tip:")) {
            const expected = Number(payload.slice(4));
            valid = Number.isInteger(expected) && expected > 0 && amount === expected;
          } else if (valid && payload.startsWith("lead:")) {
            const { data: lead } = await db.from("leads").select("id").eq("id", payload.slice(5)).maybeSingle();
            valid = Boolean(lead) && amount === Math.max(1, Math.round(Number(settings.early_access_price_stars ?? 250)));
          } else if (valid && payload.startsWith("sp:")) {
            const { data: post } = await db.from("sponsored_posts").select("id,status").eq("id", payload.slice(3)).maybeSingle();
            valid = Boolean(post) && post.status !== "paid" && amount === Math.max(1, Math.round(Number(settings.sponsor_price_stars ?? 1500)));
          } else if (valid) {
            valid = false;
          }

          await tg("answerPreCheckoutQuery", {
            pre_checkout_query_id: pcq.id,
            ok: valid,
            ...(valid ? {} : { error_message: reason }),
          });
          return Response.json({ ok: true, precheckout: valid });
        }

        if (!msg?.chat?.id) return Response.json({ ok: true, ignored: true });
        const chatId = msg.chat.id;

        // ---- successful payment ----
        const sp = msg.successful_payment;
        if (sp) {
          const user = await ensureUser(msg.from);
          const payload: string = sp.invoice_payload ?? "";
          const billing = await import("@/lib/billing.server");
          const chargeId: string = sp.telegram_payment_charge_id;

          // Doppelzustellungen von Telegram dürfen keinen zweiten Kauf anlegen
          const { data: already } = await db
            .from("purchases")
            .select("id, tg_user_id, product_id, delivery_status")
            .eq("telegram_charge_id", chargeId)
            .maybeSingle();
          if (already) {
            if (already.product_id && already.delivery_status !== "delivered") {
              const { data: retryProduct } = await db.from("products").select("*").eq("id", already.product_id).maybeSingle();
              if (retryProduct) await deliver(chatId, retryProduct, { id: already.id, tg_user_id: already.tg_user_id });
            }
            return Response.json({ ok: true, duplicate: true, deliveryRetried: already.delivery_status !== "delivered" });
          }

          const [productPart = "", codePart = ""] = payload.split("|");
          const codeId = codePart?.startsWith("c:") ? codePart.slice(2) : "";
          let product: any = null;
          if (productPart.startsWith("p:")) {
            product = (await db.from("products").select("*").eq("id", productPart.slice(2)).maybeSingle()).data;
          }
          const percent = await billing.commissionPercent(db, user.referred_by, settings);
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

          const { data: purchase, error: purchaseError } = await db
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
              telegram_charge_id: chargeId,
              referrer_id: user.referred_by,
              commission_stars: commission,
              delivery_status: product || payload.startsWith("vip:") ? "pending" : "delivered",
              delivered_at: product || payload.startsWith("vip:") ? null : new Date().toISOString(),
            })
            .select("id, tg_user_id")
            .single();

          if (purchaseError || !purchase) {
            // Parallel eintreffende Telegram-Zahlungsupdates können beide die
            // Vorabprüfung passieren. Der eindeutige Charge-Index entscheidet;
            // in diesem Fall verwenden wir den bereits angelegten Kauf weiter.
            const { data: racedPurchase } = await db
              .from("purchases")
              .select("id,tg_user_id,product_id,delivery_status")
              .eq("telegram_charge_id", chargeId)
              .maybeSingle();
            if (racedPurchase) {
              if (racedPurchase.product_id && racedPurchase.delivery_status !== "delivered") {
                const { data: retryProduct } = await db.from("products").select("*").eq("id", racedPurchase.product_id).maybeSingle();
                if (retryProduct) await deliver(chatId, retryProduct, { id: racedPurchase.id, tg_user_id: racedPurchase.tg_user_id });
              }
              return Response.json({ ok: true, duplicate: true, deliveryRetried: racedPurchase.delivery_status !== "delivered" });
            }
            throw new Error(purchaseError?.message ?? "Zahlung konnte nicht gespeichert werden");
          }

          await logOrderEvent(db, purchase.id, user.id, "paid", `stars:${sp.total_amount}`);
          await flagRepeatPayment(db, user, product?.id ?? null);
          await billing.closeInvoiceIntents(db, user.id, payload);

          const buyerLabel = user.username ? `@${user.username}` : (user.first_name ?? `Fan ${user.telegram_id}`);
          const paidTitle = product?.title ?? (payload.startsWith("vip:") ? "VIP-Zugang" : payload.startsWith("lead:") ? "Early-Access-Slot" : payload.startsWith("sp:") ? "Werbepost" : "Trinkgeld");
          await db.from("admin_audit").insert({
            action: "payment_received",
            target: paidTitle,
            status: "ok",
            detail: `${buyerLabel} · ⭐ ${sp.total_amount}`,
            meta: {
              charge_id: chargeId,
              purchase_id: purchase?.id ?? null,
              product_id: product?.id ?? null,
              payload,
              amount_stars: sp.total_amount,
              telegram_id: user.telegram_id,
            },
          });
          await notifyControl(
            `💰 <b>Zahlung eingegangen</b>\n${paidTitle} · ⭐ ${sp.total_amount}\nKäufer: ${buyerLabel}\nBeleg: <code>${chargeId}</code>`,
          );

          if (codeId && product) {
            await billing.redeemDiscount(
              db,
              codeId,
              user.id,
              purchase?.id ?? null,
              Math.max(0, Number(product.price_stars) - sp.total_amount),
            );
          }

          if (payload.startsWith("vip:")) {
            const periodDays = Math.max(0, Number(settings.vip_period_days ?? 0));
            if (periodDays > 0) {
              const sub = await billing.startOrRenewSubscription(db, user.id, periodDays, purchase?.id ?? null);
              await tg("sendMessage", {
                chat_id: chatId,
                text: `⭐ VIP aktiv bis <b>${new Date(sub.expires_at).toLocaleDateString("de-DE")}</b>.`,
                parse_mode: "HTML",
              });
            }
            const { grantVipAccess } = await import("@/lib/vip.server");
            await grantVipAccess(db, tg as any, chatId, user, settings, purchase?.id ?? null);
          } else if (product) {
            await deliver(chatId, product, purchase);
          } else if (payload.startsWith("lead:"))
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
        if (text.startsWith("/menu")) {
          const user = await ensureUser(msg.from);
          await sendMenu(chatId, "Wähle schnell, was du öffnen möchtest:");
        } else if (text.startsWith("/start")) {
          const payload = text.split(" ")[1];
          const user = await ensureUser(msg.from, payload);
          // Content-Angebot aus Shop-/Community-Post: /start c_<content-set-id>
          if (payload?.startsWith("c_")) {
            const { offerContentSet } = await import("@/lib/content.server");
            await offerContentSet(db, tg, chatId, user, payload.slice(2));
            return Response.json({ ok: true });
          }
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
          await listProducts(chatId, ["single", "bundle", "ppv"], "🛍 Shop & Content");
        } else if (text.startsWith("/drops")) {
          await ensureUser(msg.from);
          await listNewDrops(chatId);
        } else if (text.startsWith("/code")) {
          const user = await ensureUser(msg.from);
          const entered = text.slice(5).trim();
          const { data: products } = await db
            .from("products")
            .select("id, title, price_stars")
            .eq("active", true)
            .in("kind", ["single", "bundle"])
            .order("sort_order")
            .limit(8);
          const { checkDiscount } = await import("@/lib/billing.server");
          const first = products?.[0];
          const probe = await checkDiscount(db, entered, user.id, Number(first?.price_stars ?? 100));
          if (!probe.ok || !probe.discount) {
            await tg("sendMessage", { chat_id: chatId, text: `❌ ${probe.reason}` });
          } else {
            const rows: any[] = [];
            for (const p of products ?? []) {
              const res = await checkDiscount(db, entered, user.id, Number(p.price_stars));
              rows.push([
                {
                  text: `${p.title} — ⭐ ${res.price} (statt ${p.price_stars})`.slice(0, 60),
                  callback_data: `buyc_${p.id}|${probe.discount.id}`,
                },
              ]);
            }
            await tg("sendMessage", {
              chat_id: chatId,
              text: `✅ Code <b>${probe.discount.code}</b> aktiv. Wähle deinen Inhalt zum Aktionspreis:`,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: rows },
            });
          }

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
        } else if (text.startsWith("/konto") || text.startsWith("/meineinhalte")) {
          const user = await ensureUser(msg.from);
          await sendMyContent(chatId, user.id);
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
