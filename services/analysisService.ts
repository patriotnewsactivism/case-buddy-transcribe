import { TranscriptionSettings, TranscriptionResult } from "../types";

// Post-transcription intelligence pass. Deepgram/Groq Whisper both return raw
// text only — this is what used to come from Gemini's combined
// transcribe+analyze prompt before Gemini was dropped from the pipeline
// (repeated billing/account failures in production). Runs against Groq's
// hosted Llama 3.3 70B chat model since a Groq key is already required for
// the Whisper fallback tier.
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Stays well within the model's 128k token context window even for long recordings.
const MAX_INPUT_CHARS = 60_000;
// Rewriting the full transcript costs completion tokens roughly 1:1 with input,
// so cap where we still attempt a full cleaned-copy rewrite (~15 min of speech).
const MAX_CLEANUP_CHARS = 12_000;

interface AnalysisResponse {
  summary?: string;
  keyFacts?: string[];
  actionItems?: string[];
  cleanedText?: string;
}

const buildPrompt = (text: string, includeCleanup: boolean): string => `You are a legal transcription analyst. The RAW TRANSCRIPT below came from an automated speech-to-text engine and may contain misheard words, filler words ("um", "uh"), and stutters.

Return ONLY a JSON object with this exact schema (no markdown, no commentary):
{
  "summary": string,
  "keyFacts": string[],
  "actionItems": string[]${includeCleanup ? ',\n  "cleanedText": string' : ""}
}

RULES:
- "summary": 2-3 sentence executive overview.
- "keyFacts": names, dates, locations, and events mentioned.
- "actionItems": follow-ups, open questions, or next steps implied by the conversation.
${includeCleanup ? '- "cleanedText": rewrite the transcript fixing obvious ASR errors and removing filler words, WITHOUT changing its meaning or adding/removing any substantive content. Preserve speaker labels (e.g. "[Speaker 1]") if present in the source.' : ""}

RAW TRANSCRIPT:
${text}`;

/**
 * Enriches a completed transcription with an AI-generated summary, key facts,
 * action items, and (for shorter recordings) a cleaned reading copy. Never
 * throws — a failed or unconfigured analysis pass just returns the original
 * result untouched, since the raw transcript is already a complete result on
 * its own.
 */
export const analyzeTranscript = async (
  result: TranscriptionResult,
  settings: TranscriptionSettings
): Promise<TranscriptionResult> => {
  const apiKey = settings.groqKey?.trim();
  const text = result.text?.trim();
  if (!apiKey || !text) return result;

  const includeCleanup = text.length <= MAX_CLEANUP_CHARS;
  const inputText = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;

  try {
    const res = await fetch(GROQ_CHAT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages: [{ role: "user", content: buildPrompt(inputText, includeCleanup) }],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: includeCleanup ? 8000 : 1200,
      }),
    });

    if (!res.ok) {
      console.warn("Transcript analysis failed:", res.status, await res.text().catch(() => ""));
      return result;
    }

    const data = await res.json();
    const parsed: AnalysisResponse = JSON.parse(data?.choices?.[0]?.message?.content || "{}");

    return {
      ...result,
      summary: parsed.summary || result.summary,
      keyFacts: parsed.keyFacts || result.keyFacts,
      actionItems: parsed.actionItems || result.actionItems,
      cleanedText: parsed.cleanedText,
    };
  } catch (err) {
    console.warn("Transcript analysis error:", err);
    return result;
  }
};
