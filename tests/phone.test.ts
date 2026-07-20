import assert from "node:assert/strict";
import test from "node:test";
import { maskPhone, normalizeChinesePhone } from "../lib/phone.ts";

test("normalizes mainland China mobile numbers", () => {
  assert.equal(normalizeChinesePhone("138 0013 8000"), "+8613800138000");
  assert.equal(normalizeChinesePhone("+86 13800138000"), "+8613800138000");
  assert.equal(normalizeChinesePhone("123456"), null);
  assert.equal(maskPhone("+8613800138000"), "138****8000");
});
