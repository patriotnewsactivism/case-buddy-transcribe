import { z } from "zod";

type RuntimeConfig = {
  geminiApiKey: string;
  googleDriveClientId: string;
  googleDriveApiKey: string;
  openAiApiKey: string;
  assemblyAiApiKey: string;
};

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_DRIVE_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  ASSEMBLYAI_API_KEY: z.string().optional().default(""),
});

let cachedConfig: RuntimeConfig | null = null;

const readEnv = () => {
  const metaEnv =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env
      : {};
  const nodeEnv =
    (globalThis as Record<string, any>).process?.env ??
    ({} as Record<string, string | undefined>);

  return {
    GEMINI_API_KEY: metaEnv.GEMINI_API_KEY ?? nodeEnv.GEMINI_API_KEY,
    GOOGLE_DRIVE_CLIENT_ID:
      metaEnv.GOOGLE_DRIVE_CLIENT_ID ?? nodeEnv.GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_API_KEY:
      metaEnv.GOOGLE_DRIVE_API_KEY ?? nodeEnv.GOOGLE_DRIVE_API_KEY,
    OPENAI_API_KEY: metaEnv.OPENAI_API_KEY ?? nodeEnv.OPENAI_API_KEY,
    ASSEMBLYAI_API_KEY:
      metaEnv.ASSEMBLYAI_API_KEY ?? nodeEnv.ASSEMBLYAI_API_KEY,
  };
};

export const getRuntimeConfig = (): RuntimeConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsedEnv = envSchema.safeParse(readEnv());

  if (!parsedEnv.success) {
    console.error("Environment configuration failed validation:", parsedEnv.error.format());
    throw new Error("Invalid environment configuration. Please set required environment variables.");
  }

  cachedConfig = {
    geminiApiKey: parsedEnv.data.GEMINI_API_KEY,
    googleDriveClientId: parsedEnv.data.GOOGLE_DRIVE_CLIENT_ID,
    googleDriveApiKey: parsedEnv.data.GOOGLE_DRIVE_API_KEY,
    openAiApiKey: parsedEnv.data.OPENAI_API_KEY,
    assemblyAiApiKey: parsedEnv.data.ASSEMBLYAI_API_KEY,
  };

  return cachedConfig;
};

export const resetRuntimeConfigCache = () => {
  cachedConfig = null;
};
