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

it("settles a confirmed TON payment, unlocks and delivers the image only once", async () => {
  const signedUrl = "https://storage.example/test-image.png";
  const db = Object.assign(new FakeDb({
    purchases: [{
      ...order,
      currency: "ton",
      status: "pending",
      amount_ton: 0.01,
      ton_memo: "TON-TEST",
      crypto_tx_id: null,
      tg_users: { telegram_id: 42 },
    }],
    products: [{ id: "product", title: "Private TON test", kind: "ppv", delivery_type: "text", active: false }],
    content_sets: [{ id: "set", product_id: "product", title: "Private TON test", status: "draft", access_mode: "permanent" }],
    content_set_items: [{
      content_set_id: "set",
      item_role: "protected",
      media_files: { id: "image", storage_path: "test.png", mime_type: "image/png" },
    }],
  }), {
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl }, error: null }) }) },
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    ok: true,
    result: [{ transaction_id: { hash: "confirmed-ton" }, in_msg: { value: "10000000", message: "TON-TEST" } }],
  })));
  vi.mocked(tgSafe).mockResolvedValue({ message_id: 1 });

  try {
    const settings = { ton_wallet: "test-wallet" };
    expect(await verifyPendingCrypto(db, settings)).toEqual({ checked: 1, matched: 1, delivered: 1, failed: 0 });
    expect(db.rows("purchases")[0]).toMatchObject({
      status: "paid",
      crypto_tx_id: "confirmed-ton",
      delivery_status: "delivered",
    });
    expect(db.rows("content_access")).toMatchObject([{ purchase_id: "order", source: "purchase", status: "active" }]);

    expect(await verifyPendingCrypto(db, settings)).toEqual({ checked: 0, matched: 0, delivered: 0, failed: 0 });
    const images = vi.mocked(tgSafe).mock.calls.filter(([method]) => method === "sendPhoto");
    expect(images).toEqual([["sendPhoto", { chat_id: 42, photo: signedUrl }]]);
  } finally {
    vi.unstubAllGlobals();
    vi.mocked(tgSafe).mockReset();
  }
});
