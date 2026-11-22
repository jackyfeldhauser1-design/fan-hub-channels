import { describe, expect, it, vi } from "vitest";
import { findTonPayment, findTrxPayment, verifyPendingCrypto } from "@/lib/crypto-verification.server";
import { tgSafe } from "@/lib/telegram.server";
import { FakeDb } from "./fake-db";

vi.mock("@/lib/telegram.server", () => ({ tgSafe: vi.fn() }));

const order = { id: "order", tg_user_id: "fan", product_id: "product" };

describe("Crypto payment matching", () => {
  it("matches a TON text comment exactly and checks the amount", () => {
    const purchase = { ...order, currency: "ton" as const, amount_ton: 0.01, ton_memo: "TON-ABC123" };
    const transfer = (text: string, value = 10_000_000) => ({
      transaction_id: { hash: "ton-tx" },
      in_msg: {
        value,
        msg_data: { "@type": "msg.dataText", text: Buffer.from(text).toString("base64") },
      },
    });

    expect(findTonPayment([transfer("extra TON-ABC123"), transfer("TON-ABC123", 1)], purchase)).toBeNull();
    expect(findTonPayment([transfer("TON-ABC123")], purchase)).toBe("ton-tx");
  });

  it("requires a successful native TRX transfer with the exact reference", () => {
    const purchase = { ...order, currency: "trx" as const, amount_trx: 1, trx_memo: "TRX-ABC123" };
    const transfer = (memo: string, type = "TransferContract", contractRet = "SUCCESS") => ({
      txID: "trx-tx",
      ret: [{ contractRet }],
      raw_data: {
        data: Buffer.from(memo).toString("hex"),
        contract: [{ type, parameter: { value: { amount: 1_000_000 } } }],
      },
    });

    expect(findTrxPayment([
      transfer("TRX-ABC123 extra"),
      transfer("TRX-ABC123", "TriggerSmartContract"),
      transfer("TRX-ABC123", "TransferContract", "REVERT"),
    ], purchase)).toBeNull();
    expect(findTrxPayment([transfer("TRX-ABC123")], purchase)).toBe("trx-tx");
  });
});

it.each([
  { currency: "ton", failFirstDelivery: false },
  { currency: "ton", failFirstDelivery: true },
  { currency: "trx", failFirstDelivery: false },
])("settles $currency and delivers once (temporary delivery failure: $failFirstDelivery)", async ({ currency, failFirstDelivery }) => {
  const signedUrl = "https://storage.example/test-image.png";
  const db = Object.assign(new FakeDb({
    purchases: [{
      ...order,
      currency,
      status: "pending",
      ...(currency === "ton"
        ? { amount_ton: 0.01, ton_memo: "TON-TEST" }
        : { amount_trx: 25.123456, trx_memo: "TRX-ABC123" }),
      crypto_tx_id: null,
      tg_users: { telegram_id: 42 },
    }],
    products: [{ id: "product", title: "Private crypto test", kind: "ppv", delivery_type: "text", active: false }],
    content_sets: [{ id: "set", product_id: "product", title: "Private crypto test", status: "draft", access_mode: "permanent" }],
    content_set_items: [{
      content_set_id: "set",
      item_role: "protected",
      media_files: { id: "image", storage_path: "test.png", mime_type: "image/png" },
    }],
  }), {
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl }, error: null }) }) },
  });
  const txId = "confirmed-" + currency;
  const fetchTransactions = vi.fn(async (_url: string) => Response.json(currency === "ton"
    ? { ok: true, result: [{ transaction_id: { hash: txId }, in_msg: { value: "10000000", message: "TON-TEST" } }] }
    : { data: [{
      txID: txId,
      ret: [{ contractRet: "SUCCESS" }],
      raw_data: {
        data: Buffer.from("TRX-ABC123").toString("hex"),
        contract: [{ type: "TransferContract", parameter: { value: { amount: 25_123_456 } } }],
      },
    }] },
  ));
  vi.stubGlobal("fetch", fetchTransactions);
  vi.mocked(tgSafe).mockResolvedValue({ message_id: 1 });
  if (failFirstDelivery) {
    let failed = false;
    vi.mocked(tgSafe).mockImplementation(async (method) => {
      if (method === "sendPhoto" && !failed) {
        failed = true;
        return null;
      }
      return { message_id: 1 };
    });
  }

  try {
    const settings = currency === "ton" ? { ton_wallet: "test-wallet" } : { trx_wallet: "test-wallet" };
    expect(await verifyPendingCrypto(db, settings)).toEqual({
      checked: 1, matched: 1, delivered: failFirstDelivery ? 0 : 1, failed: failFirstDelivery ? 1 : 0,
    });
    if (currency === "trx") {
      const params = new URL(fetchTransactions.mock.calls[0]![0]).searchParams;
      expect(params.get("only_confirmed")).toBe("true");
      expect(params.get("only_to")).toBe("true");
    }
    if (failFirstDelivery) {
      expect(db.rows("purchases")[0]).toMatchObject({ status: "paid", delivery_status: "failed" });
      expect(await verifyPendingCrypto(db, settings)).toEqual({ checked: 0, matched: 0, delivered: 0, failed: 0 });
      db.rows("purchases")[0]!.updated_at = new Date(Date.now() - 6 * 60_000).toISOString();
      expect(await verifyPendingCrypto(db, settings)).toEqual({ checked: 1, matched: 0, delivered: 1, failed: 0 });
    }
    expect(db.rows("purchases")[0]).toMatchObject({
      status: "paid",
      crypto_tx_id: txId,
      delivery_status: "delivered",
    });
    expect(db.rows("content_access")).toMatchObject([{ purchase_id: "order", source: "purchase", status: "active" }]);

    expect(await verifyPendingCrypto(db, settings)).toEqual({ checked: 0, matched: 0, delivered: 0, failed: 0 });
    const images = vi.mocked(tgSafe).mock.calls.filter(([method]) => method === "sendPhoto");
    expect(images).toHaveLength(failFirstDelivery ? 2 : 1);
    expect(images.at(-1)).toEqual(["sendPhoto", { chat_id: 42, photo: signedUrl, protect_content: true }]);
    expect(db.rows("content_access")).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
    vi.mocked(tgSafe).mockReset();
  }
});
