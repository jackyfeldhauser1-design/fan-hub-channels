import { describe, expect, it } from "vitest";
import { findTonPayment, findTrxPayment } from "@/lib/crypto-verification.server";

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
