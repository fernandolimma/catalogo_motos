import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone, phoneNumberVariants } from "./phone";

test("normalizes Brazilian phone punctuation and formatting", () => {
  assert.equal(normalizePhone("(11) 98765-4321"), "11987654321");
  assert.equal(normalizePhone("+55 11 98765-4321"), "5511987654321");
});

test("rejects phone numbers without a plausible DDD and subscriber number", () => {
  assert.equal(normalizePhone("123456789"), null);
  assert.equal(normalizePhone("55119987654321"), null);
});

test("matches Brazilian mobile numbers with or without the ninth digit", () => {
  assert.deepEqual(phoneNumberVariants("5511987654321"), [
    "5511987654321",
    "11987654321",
    "1187654321",
    "551187654321",
  ]);
  assert.deepEqual(phoneNumberVariants("1187654321"), [
    "1187654321",
    "11987654321",
    "551187654321",
    "5511987654321",
  ]);
});
