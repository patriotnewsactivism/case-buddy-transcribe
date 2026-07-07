import { TranscriptionSettings, TranscriptionResult, TranscriptSegment, TranscriptionProvider } from "../types";
import { prepareAudioChunks } from "./ffmpegService";

// whisper-large-v3 is the most accurate Whisper checkpoint Groq serves; it's
// the second line of defense behind Deepgram (and ahead of Gemini) since it's
// a dedicated ASR model rather than a general-purpose multimodal model.
const GROQ_MODEL = "whisper-large-v3";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

interface GroqChunkResult {
  text: string;
  segments: GroqSegment[];
  detectedLanguage?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a single (already ffmpeg-compressed) audio blob to Groq's Whisper
 * transcription endpoint and normalizes the response. Retries on network
 * hiccups / 5xx / 429 (rate limit) — not on clear 4xx client errors.
 */
const callGroq = async (blob: Blob, apiKey: string, retries = 2): Promise<GroqChunkResult> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGroqOnce(blob, apiKey);
    } catch (err) {
      const isLastAttempt = attempt === retries;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = /Groq error (429|5\d\d)/.test(message) || /network error/i.test(message);
      if (isLastAttempt || !isRetryable) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("Groq request failed after retries.");
};

const callGroqOnce = async (blob: Blob, apiKey: string): Promise<GroqChunkResult> => {
  const form = new FormData();
  form.append("file", blob, "audio.mp3");
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  let res: Response;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (networkErr) {
    throw new Error(`Groq network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${errText || res.statusText}`);
  }

  const data = await res.json();
  const segments: GroqSegment[] = (data?.segments || []).map((s: any) => ({
    start: s.start,
    end: s.end,
    text: (s.text || "").trim(),
  }));

  return {
    text: data?.text || "",
    segments,
    detectedLanguage: data?.language,
  };
};

/**
 * Transcribes a file using Groq's hosted Whisper, running it through the same
 * FFmpeg compress+chunk pipeline as Deepgram (Groq's file size limit is far
 * smaller than Deepgram's, so the ~10-minute compressed chunks fit safely).
 *
 * Groq's Whisper endpoint doesn't diarize, so every segment is attributed to
 * a single generic "Speaker" — accurate wording still beats no fallback.
 */
export const transcribeWithGroq = async (
  file: File | Blob,
  settings: TranscriptionSettings,
  onProgress?: (pct: number) => void
): Promise<TranscriptionResult> => {
  const apiKey = settings.groqKey?.trim();
  if (!apiKey) {
    throw new Error("Groq API key is not configured.");
  }

  // Step 1 — FFmpeg preprocessing (compress + chunk if needed). 0-40% of overall progress.
  const chunks = await prepareAudioChunks(file, (pct) => {
    onProgress?.(Math.round(pct * 0.4));
  });

  const allSegments: TranscriptSegment[] = [];
  const textParts: string[] = [];
  let detectedLanguage: string | undefined;

  // Step 2 — send each chunk to Groq sequentially. 40-95% of overall progress.
  for (let i = 0; i < chunks.length; i++) {
    const { blob, startSec } = chunks[i];
    onProgress?.(40 + Math.round((i / chunks.length) * 55));

    const chunkResult = await callGroq(blob, apiKey);
    if (chunkResult.detectedLanguage) detectedLanguage = chunkResult.detectedLanguage;
    if (chunkResult.text) textParts.push(chunkResult.text);

    if (chunkResult.segments.length > 0) {
      for (const s of chunkResult.segments) {
        allSegments.push({
          start: s.start + startSec,
          end: s.end + startSec,
          speaker: "Speaker",
          text: s.text,
        });
      }
    } else if (chunkResult.text) {
      allSegments.push({ start: startSec, end: startSec, speaker: "Speaker", text: chunkResult.text });
    }
  }

  onProgress?.(98);

  const fullText = allSegments.length > 0
    ? allSegments.map((s) => s.text).join(" ")
    : textParts.join(" ");

  onProgress?.(100);

  return {
    text: fullText,
    segments: allSegments,
    detectedLanguage,
    providerUsed: TranscriptionProvider.GROQ,
  };
};
