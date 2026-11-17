import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("reads Estonian numbers typed every usual way", () => {
    expect(normalizePhone("+372 5555 0101")).toBe("+37255550101");
    expect(normalizePhone("5555 0101")).toBe("+37255550101");
    expect(normalizePhone("372 5555 0101")).toBe("+37255550101");
    expect(normalizePhone("00372-5555-0101")).toBe("+37255550101");
    expect(normalizePhone("(+372) 555 0101")).toBe("+3725550101");
  });

  it("keeps foreign numbers", () => {
    expect(normalizePhone("+358 40 123 4567")).toBe("+358401234567");
    expect(normalizePhone("+7 900 000-00-00")).toBe("+79000000000");
  });

  it("refuses what is not a phone number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("+372 ")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("+372 123")).toBeNull();
    expect(normalizePhone("+372 5555 0101 99")).toBeNull();
  });
});
