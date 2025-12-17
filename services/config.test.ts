import { afterEach, describe, expect, test } from "vitest";
import { getRuntimeConfig, resetRuntimeConfigCache } from "./config";

const originalEnv = { ...process.env };

describe("getRuntimeConfig", () => {
  afterEach(() => {
    resetRuntimeConfigCache();
    process.env = { ...originalEnv };
  });

  test("throws when required variables are missing", () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => getRuntimeConfig()).toThrowError(/Invalid environment configuration/i);
  });

  test("returns parsed configuration when values are provided", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GOOGLE_DRIVE_CLIENT_ID = "client-id";
    process.env.GOOGLE_DRIVE_API_KEY = "drive-api-key";

    const config = getRuntimeConfig();

    expect(config.geminiApiKey).toBe("test-gemini-key");
    expect(config.googleDriveClientId).toBe("client-id");
    expect(config.googleDriveApiKey).toBe("drive-api-key");
    expect(config.openAiApiKey).toBe("");
    expect(config.assemblyAiApiKey).toBe("");
  });
});
