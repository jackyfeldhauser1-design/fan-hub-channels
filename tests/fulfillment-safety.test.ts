import { describe, expect, it, vi } from "vitest";
import { deliverProduct, guardAction } from "@/lib/fulfillment.server";
import { FakeDb } from "./fake-db";

describe("Fulfillment safety", () => {
  it("blocks purchases if the rate-limit database query fails", async () => {
    const failedQuery: any = {
      select: () => failedQuery,
      eq: () => failedQuery,
      gte: async () => ({ count: null, error: new Error("database unavailable") }),
    };
    const db = { from: () => failedQuery };
    const result = await guardAction(db, { id: "fan-1", blocked: false }, {}, "buy");
    expect(result).toMatch(/Sicherheitsprüfung/);
  });

  it("keeps a completed delivery successful when an optional upsell fails", async () => {
    const db = new FakeDb({
      purchases: [{ id: "p1", tg_user_id: "fan-1", delivery_status: "pending" }],
      products: [{ id: "upsell-1", active: true, title: "Set 2", price_stars: 100 }],
      order_events: [],
    });
    let calls = 0;
    const tg = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("Telegram promotion failed");
      return { ok: true };
    });
    const result = await deliverProduct(
      db, tg, 123, { id: "item-1", title: "Set 1", delivery_type: "text", delivery_payload: "gekauft", upsell_product_id: "upsell-1" },
      { id: "p1", tg_user_id: "fan-1" }, {},
    );
    expect(result.ok).toBe(true);
    expect(db.rows("purchases")[0]?.delivery_status).toBe("delivered");
    expect(db.rows("order_events")).toHaveLength(1);
    expect(tg).toHaveBeenCalledTimes(2);
  });
});
