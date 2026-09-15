import { describe, expect, it } from "vitest";
import { accessExpiry, selectPreviewFileId } from "../src/lib/content.server";

describe("Content-Commerce Kernregeln", () => {
  it("gibt Dauerzugriff ohne Ablauf zurück", () => {
    expect(accessExpiry("permanent", null, 0)).toBeNull();
  });

  it("begrenzt zeitlichen Zugriff auf 1 bis 8760 Stunden", () => {
    expect(accessExpiry("hours", 0, 0)).toBe(new Date(3600_000).toISOString());
    expect(accessExpiry("hours", 99999, 0)).toBe(new Date(8760 * 3600_000).toISOString());
  });

  it("verwendet nur ausdrücklich freigegebene Preview-Dateien", () => {
    const files = [
      { id: "paid", preview_allowed: false },
      { id: "preview", preview_allowed: true },
    ];
    expect(selectPreviewFileId(files, null)).toBe("preview");
    expect(selectPreviewFileId(files, "preview")).toBe("preview");
  });

  it("verhindert, dass geschützter Content als Preview ausgewählt wird", () => {
    const files = [
      { id: "paid", preview_allowed: false },
      { id: "preview", preview_allowed: true },
    ];
    expect(() => selectPreviewFileId(files, "paid")).toThrow(/nicht als Preview freigegeben/);
  });

  it("veröffentlicht ohne freigegebene Preview textbasiert statt geschützte Medien zu leaken", () => {
    expect(selectPreviewFileId([{ id: "paid", preview_allowed: false }], null)).toBeNull();
  });
});
