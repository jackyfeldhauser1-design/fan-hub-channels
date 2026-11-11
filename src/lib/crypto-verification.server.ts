import { tgSafe } from "@/lib/telegram.server";

type PendingPurchase = {
  id: string;
  tg_user_id: string;
  product_id: string | null;
  currency: "ton" | "trx";
  amount_ton?: number | null;
  amount_trx?: number | null;
  ton_memo?: string | null;
  trx_memo?: string | null;
  created_at?: string | null;
  updated_at?: string;
  crypto_tx_id?: string | null;
  tg_users?: { telegram_id?: number | string | null };
};

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Blockchain API HTTP ${res.status}`);
  return res.json();
}

async function tonTransactions(wallet: string) {
  const base = String(process.env["TONCENTER_BASE_URL"] || "https://toncenter.com/api/v2").replace(/\/$/, "");
  const key = String(process.env["TONCENTER_API_KEY"] || "");
  const url = `${base}/getTransactions?address=${encodeURIComponent(wallet)}&limit=100&archival=true`;
  const json = await fetchJson(url, key ? { "X-API-Key": key } : {});
  if (!json?.ok) throw new Error(String(json?.description || "TON Center request failed"));
  return Array.isArray(json.result) ? json.result : [];
}

async function trxTransactions(wallet: string, minTimestamp = 0) {
  const base = String(process.env["TRONGRID_BASE_URL"] || "https://api.trongrid.io").replace(/\/$/, "");
  const key = String(process.env["TRONGRID_API_KEY"] || "");
  const qs = new URLSearchParams({
    only_confirmed: "true",
    only_to: "true",
    limit: "200",
    order_by: "block_timestamp,desc",
  });
  if (minTimestamp > 0) qs.set("min_timestamp", String(minTimestamp));
  const json = await fetchJson(`${base}/v1/accounts/${encodeURIComponent(wallet)}/transactions?${qs}`, key ? { "TRON-PRO-API-KEY": key } : {});
  return Array.isArray(json?.data) ? json.data : [];
}

export function findTonPayment(txs: any[], purchase: PendingPurchase) {
  const memo = String(purchase.ton_memo || "");
  const expected = Math.round(Number(purchase.amount_ton || 0) * 1e9);
  if (!memo || expected <= 0) return null;
  for (const tx of txs) {
    const incoming = tx?.in_msg || tx?.inMessage || {};
    const value = Number(incoming?.value ?? incoming?.amount ?? 0);
    const data = incoming.msg_data;
    const encoded = data?.["@type"] === "msg.dataText" && typeof data.text === "string" ? data.text : "";
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    if (value === expected && (incoming.message === memo || decoded === memo)) {
      return String(tx?.transaction_id?.hash || tx?.hash || tx?.id || "");
    }
  }
  return null;
}

export function findTrxPayment(txs: any[], purchase: PendingPurchase) {
  const memo = String(purchase.trx_memo || "");
  const expected = Math.round(Number(purchase.amount_trx || 0) * 1_000_000);
  if (!memo || expected <= 0) return null;
  for (const tx of txs) {
    if (tx?.ret?.[0]?.contractRet !== "SUCCESS") continue;
    const contract = tx?.raw_data?.contract?.[0];
    if (contract?.type !== "TransferContract") continue;
    const amount = Number(contract.parameter?.value?.amount ?? 0);
    const rawMemo = String(tx?.raw_data?.data || "");
    let decoded = rawMemo;
    try { decoded = Buffer.from(rawMemo, "hex").toString("utf8"); } catch {}
    if (amount === expected && decoded === memo) return String(tx?.txID || tx?.id || "");
  }
  return null;
}

async function settle(db: any, purchase: PendingPurchase, txId: string, settings: any) {
  if (!purchase.product_id || !purchase.tg_users?.telegram_id || !txId) return false;
  const { data: claimed, error } = await db
    .from("purchases")
    .update({ status: "paid", delivery_status: "pending", crypto_tx_id: txId, updated_at: new Date().toISOString() })
    .eq("id", purchase.id)
    .eq("status", "pending")
    .is("crypto_tx_id", null)
    .select("id")
    .maybeSingle();
  if (error || !claimed) return false;

  const { logOrderEvent } = await import("@/lib/fulfillment.server");
  await logOrderEvent(db, purchase.id, purchase.tg_user_id, "paid", `${purchase.currency}:auto:${txId}`);
  return deliverPaidPurchase(db, purchase, settings);
}

async function deliverPaidPurchase(db: any, purchase: PendingPurchase, settings: any) {
  try {
    const { data: product, error } = await db.from("products").select("*").eq("id", purchase.product_id).maybeSingle();
    if (error || !product) throw new Error("Produkt nicht verfügbar");
    const { deliverProduct } = await import("@/lib/fulfillment.server");
    const result = await deliverProduct(
      db,
      async (method, body) => (await tgSafe(method, body)) as any,
      Number(purchase.tg_users?.telegram_id),
      product,
      { id: purchase.id, tg_user_id: purchase.tg_user_id },
      settings,
    );
    if (result.ok) return true;
  } catch {
    // An upsell can fail after the purchased content has already been delivered.
    const { data: current } = await db.from("purchases").select("delivery_status").eq("id", purchase.id).maybeSingle();
    if (current?.delivery_status === "delivered") return true;
  }
  await db.from("purchases").update({
    delivery_status: "failed",
    delivery_note: "Automatische Zustellung fehlgeschlagen",
    updated_at: new Date().toISOString(),
  }).eq("id", purchase.id).eq("status", "paid").neq("delivery_status", "delivered");
  return false;
}

export async function verifyPendingCrypto(db: any, settings: any) {
  const { data, error } = await db
    .from("purchases")
    .select("id,tg_user_id,product_id,currency,amount_ton,amount_trx,ton_memo,trx_memo,created_at,crypto_tx_id,tg_users!purchases_tg_user_id_fkey(telegram_id)")
    .eq("status", "pending")
    .in("currency", ["ton", "trx"])
    .is("crypto_tx_id", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as PendingPurchase[];
  let checked = 0, matched = 0, delivered = 0, failed = 0;

  // The timestamp is also a lease: another worker must wait five minutes before retrying.
  const retryBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: retries, error: retryError } = await db.from("purchases")
    .select("id,tg_user_id,product_id,currency,crypto_tx_id,updated_at,tg_users!purchases_tg_user_id_fkey(telegram_id)")
    .eq("status", "paid")
    .in("currency", ["ton", "trx"])
    .in("delivery_status", ["pending", "failed"])
    .lt("updated_at", retryBefore)
    .order("updated_at", { ascending: true })
    .limit(200);
  if (retryError) throw retryError;
  for (const purchase of (retries ?? []) as PendingPurchase[]) {
    if (!purchase.crypto_tx_id || !purchase.product_id || !purchase.tg_users?.telegram_id) continue;
    const { data: claimed, error: claimError } = await db.from("purchases")
      .update({ delivery_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", purchase.id)
      .eq("status", "paid")
      .in("delivery_status", ["pending", "failed"])
      .eq("updated_at", purchase.updated_at)
      .select("id")
      .maybeSingle();
    if (claimError) { failed++; continue; }
    if (!claimed) continue;
    checked++;
    if (await deliverPaidPurchase(db, purchase, settings)) delivered++;
    else failed++;
  }

  let tonTxs: any[] = [];
  let trxTxs: any[] = [];
  try {
    if (settings?.ton_wallet && rows.some((p) => p.currency === "ton")) tonTxs = await tonTransactions(settings.ton_wallet);
  } catch { failed++; }
  try {
    const oldest = rows.filter((p) => p.currency === "trx").map((p) => new Date(p.created_at || 0).getTime()).filter(Number.isFinite);
    const min = oldest.length ? Math.max(0, Math.min(...oldest) - 60_000) : 0;
    if (settings?.trx_wallet && rows.some((p) => p.currency === "trx")) trxTxs = await trxTransactions(settings.trx_wallet, min);
  } catch { failed++; }

  for (const purchase of rows) {
    checked++;
    const txId = purchase.currency === "ton" ? findTonPayment(tonTxs, purchase) : findTrxPayment(trxTxs, purchase);
    if (!txId) continue;
    matched++;
    try { if (await settle(db, purchase, txId, settings)) delivered++; else failed++; }
    catch { failed++; }
  }
  return { checked, matched, delivered, failed };
}
