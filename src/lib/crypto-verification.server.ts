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
  tg_users?: { telegram_id?: number | string | null };
};

function textCandidates(value: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === "string") {
      out.add(v);
      try { out.add(Buffer.from(v, "base64").toString("utf8")); } catch {}
      try { out.add(Buffer.from(v, "hex").toString("utf8")); } catch {}
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return [...out];
}

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

function findTonPayment(txs: any[], purchase: PendingPurchase) {
  const memo = String(purchase.ton_memo || "");
  const expected = Math.round(Number(purchase.amount_ton || 0) * 1e9);
  if (!memo || expected <= 0) return null;
  for (const tx of txs) {
    const incoming = tx?.in_msg || tx?.inMessage || {};
    const value = Number(incoming?.value ?? incoming?.amount ?? 0);
    const texts = textCandidates(incoming);
    if (value === expected && texts.some((t) => t.includes(memo))) {
      return String(tx?.transaction_id?.hash || tx?.hash || tx?.id || "");
    }
  }
  return null;
}

function findTrxPayment(txs: any[], purchase: PendingPurchase) {
  const memo = String(purchase.trx_memo || "");
  const expected = Math.round(Number(purchase.amount_trx || 0) * 1_000_000);
  if (!memo || expected <= 0) return null;
  for (const tx of txs) {
    if (tx?.ret?.[0]?.contractRet && tx.ret[0].contractRet !== "SUCCESS") continue;
    const contracts = tx?.raw_data?.contract || [];
    const amount = Number(contracts?.[0]?.parameter?.value?.amount ?? 0);
    const rawMemo = String(tx?.raw_data?.data || "");
    let decoded = rawMemo;
    try { decoded = Buffer.from(rawMemo, "hex").toString("utf8"); } catch {}
    if (amount === expected && decoded.includes(memo)) return String(tx?.txID || tx?.id || "");
  }
  return null;
}

async function settle(db: any, purchase: PendingPurchase, txId: string, settings: any) {
  if (!purchase.product_id || !purchase.tg_users?.telegram_id || !txId) return false;
  const { data: claimed, error } = await db
    .from("purchases")
    .update({ status: "paid", delivery_status: "pending", crypto_tx_id: txId })
    .eq("id", purchase.id)
    .eq("status", "pending")
    .is("crypto_tx_id", null)
    .select("id")
    .maybeSingle();
  if (error || !claimed) return false;

  const { data: product } = await db.from("products").select("*").eq("id", purchase.product_id).maybeSingle();
  if (!product) return false;
  const { deliverProduct, logOrderEvent } = await import("@/lib/fulfillment.server");
  await logOrderEvent(db, purchase.id, purchase.tg_user_id, "paid", `${purchase.currency}:auto:${txId}`);
  const result = await deliverProduct(
    db,
    async (method, body) => (await tgSafe(method, body)) as any,
    Number(purchase.tg_users.telegram_id),
    product,
    { id: purchase.id, tg_user_id: purchase.tg_user_id },
    settings,
  );
  return Boolean(result.ok);
}

export async function verifyPendingCrypto(db: any, settings: any) {
  const { data } = await db
    .from("purchases")
    .select("id,tg_user_id,product_id,currency,amount_ton,amount_trx,ton_memo,trx_memo,created_at,crypto_tx_id,tg_users!purchases_tg_user_id_fkey(telegram_id)")
    .eq("status", "pending")
    .in("currency", ["ton", "trx"])
    .is("crypto_tx_id", null)
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = (data ?? []) as PendingPurchase[];
  let checked = 0, matched = 0, delivered = 0, failed = 0;

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
