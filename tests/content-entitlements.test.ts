import { describe, expect, it } from "vitest";
import { FakeDb } from "./fake-db";
import { activeContentAccess, grantContentAccess } from "../src/lib/content.server";
import { deliverProduct } from "../src/lib/fulfillment.server";

describe("Content-Zugriffsrechte", () => {
  it("legt bei einem Webhook-Replay keinen zweiten Zugriff an", async () => {
    const db = new FakeDb({ content_access: [] });
    const set = { id: "set-1", access_mode: "permanent", access_hours: null };
    const first = await grantContentAccess(db as any, { tgUserId: "fan-1", contentSet: set, purchaseId: "purchase-1" });
    const replay = await grantContentAccess(db as any, { tgUserId: "fan-1", contentSet: set, purchaseId: "purchase-1" });
    expect(db.rows("content_access")).toHaveLength(1);
    expect(replay.id).toBe(first.id);
  });

  it("verlängert einen zeitlichen Zugang bei einem neuen Kauf statt zu duplizieren", async () => {
    const db = new FakeDb({ content_access: [] });
    const set = { id: "set-2", access_mode: "hours", access_hours: 24 };
    const first = await grantContentAccess(db as any, { tgUserId: "fan-2", contentSet: set, purchaseId: "purchase-1" });
    const firstExpiry = first.expires_at;
    const second = await grantContentAccess(db as any, { tgUserId: "fan-2", contentSet: set, purchaseId: "purchase-2" });
    expect(db.rows("content_access")).toHaveLength(1);
    expect(Date.parse(second.expires_at)).toBeGreaterThan(Date.parse(firstExpiry) + 23 * 3_600_000);
  });

  it("markiert abgelaufene Rechte beim nächsten Zugriff als expired", async () => {
    const db = new FakeDb({
      content_access: [{
        id: "access-1",
        tg_user_id: "fan-3",
        content_set_id: "set-3",
        status: "active",
        expires_at: new Date(Date.now() - 1_000).toISOString(),
        granted_at: new Date().toISOString(),
      }],
    });
    expect(await activeContentAccess(db as any, "fan-3", "set-3")).toBeNull();
    expect(db.rows("content_access")[0]?.status).toBe("expired");
  });
});

describe("Content-Bundles", () => {
  it("vergibt und liefert alle enthaltenen Content-Sets mit nur einem Kauf", async () => {
    const db = new FakeDb({
      bundle_items: [
        { bundle_id: "bundle-1", product_id: "product-a" },
        { bundle_id: "bundle-1", product_id: "product-b" },
      ],
      content_sets: [
        { id: "set-a", product_id: "product-a", title: "A", description: "", status: "active", access_mode: "permanent", access_hours: null },
        { id: "set-b", product_id: "product-b", title: "B", description: "", status: "active", access_mode: "permanent", access_hours: null },
      ],
      content_set_items: [
        { content_set_id: "set-a", item_role: "protected", sort_order: 0, media_files: { id: "a", storage_path: "a.jpg", display_name: "A", mime_type: "image/jpeg" } },
        { content_set_id: "set-b", item_role: "protected", sort_order: 0, media_files: { id: "b", storage_path: "b.jpg", display_name: "B", mime_type: "image/jpeg" } },
      ],
      content_access: [],
      purchases: [{ id: "purchase-1", tg_user_id: "fan-1", delivery_status: "pending" }],
      order_events: [],
      products: [],
    });
    (db as any).storage = { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }) }) };
    const sent: string[] = [];
    const tg = async (method: string) => { sent.push(method); return { message_id: sent.length }; };
    const result = await deliverProduct(
      db as any,
      tg as any,
      123,
      { id: "bundle-1", kind: "bundle", title: "Bundle", delivery_type: "text", delivery_payload: "", upsell_product_id: null },
      { id: "purchase-1", tg_user_id: "fan-1" },
      {},
    );
    expect(result.ok).toBe(true);
    expect(db.rows("content_access")).toHaveLength(2);
    expect(db.rows("purchases")[0]?.delivery_status).toBe("delivered");
    expect(sent.filter((method) => method === "sendPhoto")).toHaveLength(2);
  });
});
