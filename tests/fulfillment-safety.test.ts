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


describe("Delivery failure regression", () => {
  const purchase = { id: "p1", tg_user_id: "fan-1" };
  it.each([null, false, { ok: false }])("does not mark a rejected Telegram response delivered (%j)", async (response) => {
    const db = new FakeDb({ purchases: [{ ...purchase, delivery_status: "pending" }] });
    await expect(deliverProduct(db, async () => response, 123,
      { id: "item-1", title: "Test", delivery_type: "text" }, purchase, {})).rejects.toThrow(/Zustellung/);
    expect(db.rows("purchases")[0]?.delivery_status).toBe("pending");
  });
  it("rejects an incomplete bundle before granting or sending content", async () => {
    const db = new FakeDb({
      purchases: [{ ...purchase, delivery_status: "pending" }],
      bundle_items: [{ bundle_id: "bundle", product_id: "existing" }, { bundle_id: "bundle", product_id: "missing" }],
      content_sets: [{ id: "set", product_id: "existing" }],
      content_access: [],
    });
    const tg = vi.fn(async () => ({ message_id: 1 }));
    await expect(deliverProduct(db, tg, 123, { id: "bundle", kind: "bundle" }, purchase, {})).rejects.toThrow(/nicht verfügbare Sets/);
    expect(db.rows("content_access")).toHaveLength(0);
    expect(tg).not.toHaveBeenCalled();
    expect(db.rows("purchases")[0]?.delivery_status).toBe("pending");
  });
  it("does not confirm an empty protected set", async () => {
    const db = new FakeDb({
      purchases: [{ ...purchase, delivery_status: "pending" }],
      content_sets: [{ id: "set", product_id: "item", access_mode: "permanent" }],
      content_set_items: [],
      content_access: [{ id: "access", tg_user_id: "fan-1", content_set_id: "set", status: "active", expires_at: null }],
    });
    const tg = vi.fn(async () => ({ message_id: 1 }));
    await expect(deliverProduct(db, tg, 123, { id: "item", delivery_type: "text" }, purchase, {})).rejects.toThrow(/Medien fehlen/);
    expect(tg).not.toHaveBeenCalled();
    expect(db.rows("purchases")[0]?.delivery_status).toBe("pending");
  });
});
