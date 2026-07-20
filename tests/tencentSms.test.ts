import assert from "node:assert/strict";
import test from "node:test";
import { createTencentSmsRequest } from "../lib/tencentSms.ts";

test("Tencent SMS request signs the exact payload without exposing the secret", () => {
  const request = createTencentSmsRequest(
    {
      secretId: "AKIDEXAMPLE",
      secretKey: "secret-value-never-in-headers",
      region: "ap-guangzhou",
      appId: "1400000000",
      signName: "测试签名",
      templateId: "123456",
    },
    "+8613800138000",
    ["123456", "5"],
    1_700_000_000
  );
  assert.match(request.headers.Authorization, /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.equal(request.headers.Authorization.includes("secret-value"), false);
  assert.deepEqual(JSON.parse(request.body).PhoneNumberSet, ["+8613800138000"]);
  assert.equal(request.headers["X-TC-Action"], "SendSms");
});
