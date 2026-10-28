import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone } from "./phone";

test("normalizes Brazilian phone punctuation and formatting", () => {
  assert.equal(normalizePhone("(11) 98765-4321"), "11987654321");
  assert.equal(normalizePhone("+55 11 98765-4321"), "5511987654321");
});

test("rejects phone numbers without a plausible DDD and subscriber number", () => {
  assert.equal(normalizePhone("123456789"), null);
  assert.equal(normalizePhone("55119987654321"), null);
});
