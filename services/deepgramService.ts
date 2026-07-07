import { TranscriptionSettings, TranscriptionResult, TranscriptSegment, TranscriptionProvider } from "../types";
import { prepareAudioChunks } from "./ffmpegService";

// Nova-3 is Deepgram's most accurate general model as of 2026; it also supports
// diarization + smart formatting in a single pass, which is what we want here.
const DEEPGRAM_MODEL = "nova-3";
const DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen";

interface DeepgramUtterance {
  start: number;
  end: number;
  transcript: string;
  speaker?: number;
}

interface DeepgramChunkResult {
  text: string;
  utterances: DeepgramUtterance[];
  detectedLanguage?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a single (already ffmpeg-compressed) audio blob to Deepgram's
 * prerecorded /listen endpoint and normalizes the response. Retries a
 * couple of times on network hiccups / 5xx — this frequently runs over
 * flaky mobile connections.
 */
const callDeepgram = async (blob: Blob, apiKey: string, retries = 2): Promise<DeepgramChunkResult> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callDeepgramOnce(blob, apiKey);
    } catch (err) {
      const isLastAttempt = attempt === retries;
      const message = err instanceof Error ? err.message : String(err);
      // Don't retry on clear client errors (bad key, bad request) — only network/5xx issues.
      const isRetryable = !/Deepgram error 4\d\d/.test(message);
      if (isLastAttempt || !isRetryable) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("Deepgram request failed after retries.");
};

const callDeepgramOnce = async (blob: Blob, apiKey: string): Promise<DeepgramChunkResult> => {
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
    paragraphs: "true",
    detect_language: "true",
  });

  let res: Response;
  try {
    res = await fetch(`${DEEPGRAM_ENDPOINT}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": blob.type || "audio/mpeg",
      },
      body: blob,
    });
  } catch (networkErr) {
    throw new Error(`Deepgram network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Deepgram error ${res.status}: ${errText || res.statusText}`);
  }

  const data = await res.json();
  const channel = data?.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];

  const utterances: DeepgramUtterance[] = (data?.results?.utterances || []).map((u: any) => ({
    start: u.start,
    end: u.end,
    transcript: u.transcript,
    speaker: u.speaker,
  }));

  return {
    text: alt?.transcript || "",
    utterances,
    detectedLanguage: channel?.detected_language,
  };
};

/**
 * Transcribes a file using Deepgram, always running it through FFmpeg first:
 *  1. Compress to a speech-optimised mono MP3 (fast, small — friendly to mobile uploads).
 *  2. Auto-chunk anything over 15 minutes so long recordings still complete reliably.
 *  3. Send each chunk to Deepgram and stitch the results back together with
 *     correct timestamps and speaker labels.
 */
export const transcribeWithDeepgram = async (
  file: File | Blob,
  settings: TranscriptionSettings,
  onProgress?: (pct: number, stage?: string) => void
): Promise<TranscriptionResult> => {
  const apiKey = settings.deepgramKey?.trim();
  if (!apiKey) {
    throw new Error("Deepgram API key is not configured.");
  }

  // Step 1 — FFmpeg preprocessing (compress + chunk if needed). 0-40% of overall progress.
  const chunks = await prepareAudioChunks(file, (pct, stage) => {
    onProgress?.(Math.round(pct * 0.4), stage);
  });

  const allSegments: TranscriptSegment[] = [];
  const textParts: string[] = [];
  let detectedLanguage: string | undefined;

  // Step 2 — send each chunk to Deepgram sequentially. 40-95% of overall progress.
  for (let i = 0; i < chunks.length; i++) {
    const { blob, startSec } = chunks[i];
    onProgress?.(40 + Math.round((i / chunks.length) * 55), `Transcribing chunk ${i + 1}/${chunks.length} (Deepgram)...`);

    const chunkResult = await callDeepgram(blob, apiKey);
    if (chunkResult.detectedLanguage) detectedLanguage = chunkResult.detectedLanguage;
    if (chunkResult.text) textParts.push(chunkResult.text);

    if (chunkResult.utterances.length > 0) {
      for (const u of chunkResult.utterances) {
        allSegments.push({
          start: u.start + startSec,
          end: u.end + startSec,
          speaker: u.speaker !== undefined ? `Speaker ${u.speaker + 1}` : "Speaker",
          text: u.transcript,
        });
      }
    } else if (chunkResult.text) {
      allSegments.push({ start: startSec, end: startSec, speaker: "Speaker", text: chunkResult.text });
    }
  }

  onProgress?.(98);

  const fullText = allSegments.length > 0
    ? allSegments.map((s) => `[${s.speaker}] ${s.text}`).join("\n")
    : textParts.join("\n");

  onProgress?.(100);

  return {
    text: fullText,
    segments: allSegments,
    detectedLanguage,
    providerUsed: TranscriptionProvider.DEEPGRAM,
  };
};
