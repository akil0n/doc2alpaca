import assert from "node:assert/strict";
import test from "node:test";
import {
  developmentOtpEnabled,
  phoneLoginEnabled,
  resolveGitHubCredentials,
} from "../lib/authProviderConfig.ts";

test("development OTP requires both development mode and explicit opt-in", () => {
  assert.equal(
    developmentOtpEnabled({ NODE_ENV: "development", ALLOW_DEV_OTP: "true" }),
    true,
  );
  assert.equal(
    developmentOtpEnabled({ NODE_ENV: "development", ALLOW_DEV_OTP: "false" }),
    false,
  );
  assert.equal(
    developmentOtpEnabled({ NODE_ENV: "staging", ALLOW_DEV_OTP: "true" }),
    false,
  );
  assert.equal(developmentOtpEnabled({ ALLOW_DEV_OTP: "true" }), false);
});

test("phone login is visible only with SMS credentials or explicit dev OTP", () => {
  assert.equal(phoneLoginEnabled({ NODE_ENV: "production" }), false);
  assert.equal(
    phoneLoginEnabled({ NODE_ENV: "development", ALLOW_DEV_OTP: "true" }),
    true,
  );
  assert.equal(
    phoneLoginEnabled({
      NODE_ENV: "production",
      TENCENTCLOUD_SECRET_ID: "id",
      TENCENTCLOUD_SECRET_KEY: "secret",
      TENCENT_SMS_SDK_APP_ID: "app",
      TENCENT_SMS_SIGN_NAME: "sign",
      TENCENT_SMS_TEMPLATE_ID: "template",
    }),
    true,
  );
});

test("GitHub credentials use the same development fallback as the login UI", () => {
  assert.deepEqual(
    resolveGitHubCredentials({
      NODE_ENV: "development",
      AUTH_GITHUB_ID: "production-id",
      AUTH_GITHUB_SECRET: "production-secret",
    }),
    { clientId: "production-id", clientSecret: "production-secret" },
  );
  assert.deepEqual(
    resolveGitHubCredentials({
      NODE_ENV: "development",
      AUTH_GITHUB_ID: "production-id",
      AUTH_GITHUB_SECRET: "production-secret",
      AUTH_GITHUB_ID_DEV: "development-id",
      AUTH_GITHUB_SECRET_DEV: "development-secret",
    }),
    { clientId: "development-id", clientSecret: "development-secret" },
  );
});
