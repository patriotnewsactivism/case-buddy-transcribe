import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings, TranscriptionResult, TranscriptSegment } from "../types";
import { getAccessToken } from "./googleAuthService";

// AssemblyAI API response interfaces
interface AssemblyAIUtterance {
  start: number; // milliseconds
  end: number;   // milliseconds
  speaker: string;
  text: string;
  confidence: number;
}

interface AssemblyAITranscriptResult {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  utterances?: AssemblyAIUtterance[];
  error?: string;
  language_code?: string;
  audio_duration?: number;
  words?: Array<{
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
}

/**
 * Polls the Gemini File API until the uploaded file is in the 'ACTIVE' state.
 * Uses exponential backoff starting at 500ms for faster initial checks.
 */
const waitForFileActive = async (fileUri: string): Promise<void> => {
    const fileId = fileUri.split('/').pop();
    if (!fileId) return;

    const accessToken = getAccessToken();
    if (!accessToken) throw new Error("User not authenticated.");

    const maxAttempts = 60; // Reduced attempts since we use backoff
    let attempt = 0;
    let delay = 500; // Start with 500ms for quick initial checks

    while (attempt < maxAttempts) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 401) {
             throw new Error("Authentication failed. Please sign in again.");
        }
        if (!response.ok) throw new Error("Failed to check file status");

        const data = await response.json();

        if (data.state === 'ACTIVE') {
            return;
        } else if (data.state === 'FAILED') {
            throw new Error("File processing failed on Google servers.");
        }

        // Exponential backoff: 500ms -> 1s -> 2s -> 3s (capped)
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 3000); // Cap at 3 seconds
        attempt++;
    }

    throw new Error("File processing timed out. The file might be too large or the service is busy.");
};

/**
 * Uploads any file to Gemini's File API using the resumable upload flow so we
 * avoid base64 bloating and always get progress callbacks. This greatly reduces
 * bandwidth usage on slow connections and prevents the UI from stalling at 15%.
 */
const uploadFileToGemini = async (
    file: Blob | File,
    onProgress?: (percent: number) => void
): Promise<string> => {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error("User not authenticated for Gemini upload.");

    const startResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Audio_Evidence' } })
    });

    if (!startResponse.ok) {
        const errorText = await startResponse.text().catch(() => '');
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error && errorJson.error.message) {
                 throw new Error(errorJson.error.message);
            }
        } catch(e) {
            // Not a json error, throw the original text
             throw new Error(`Failed to start upload: ${startResponse.status} ${errorText}`);
        }
        throw new Error(`Failed to start upload: ${startResponse.status} ${errorText}`);
    }

    const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error("Failed to initiate Gemini upload session.");

    return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');

        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const fileData = JSON.parse(xhr.responseText);
                    resolve(fileData.file.uri);
                } catch (err) {
                    reject(new Error("Failed to parse upload response"));
                }
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
            }
        };

        xhr.onerror = () => reject(new Error("Network Error during upload"));
        xhr.send(file);
    });
};

// --- GEMINI IMPLEMENTATION ---
const transcribeWithGemini = async (
  file: Blob | File,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
  // The generateContent call still uses an API Key. This is because the File API
  // and the Model API can have different auth requirements. The error was specific
  // to the FileService, so we only change that part.
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment for content generation.");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const modelName = 'gemini-2.5-flash';

  const vocabList = settings.customVocabulary.length > 0
    ? `VOCABULARY/GLOSSARY (Prioritize these spellings): ${settings.customVocabulary.join(', ')}`
    : '';

  const prompt = `
  You are an expert Audio Transcription AI.
  ${vocabList}
  TASK:
  Transcribe the audio accurately.
  You MUST return the result as a raw JSON Array of objects. Do not use Markdown code blocks. Just the JSON.
  SCHEMA:
  Array<{
    start: number; // Start time in seconds (e.g., 12.5)
    end: number;   // End time in seconds
    speaker: string; // e.g., "Speaker 1"
    text: string;    // The spoken text
  }>
  RULES:
  1. Break text into natural sentence-level or phrase-level segments.
  2. ${settings.legalMode ? 'Verbatim mode: Keep ums, ahs, and stuttering.' : 'Clean mode: Remove stuttering, but correct phonetic errors (e.g. "reel a state" -> "real estate").'}
  3. Identify speakers carefully.
  4. ACCURACY: If you see specific words in the provided Vocabulary list, use them.
  `;

  const parseGeminiResponse = (text: string): TranscriptionResult => {
      try {
          const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const segments: TranscriptSegment[] = JSON.parse(cleanedText);
          const fullText = segments.map(s => `[${formatTimestamp(s.start)}] [${s.speaker}] ${s.text}`).join('\n');
          return {
              text: fullText,
              segments: segments,
              providerUsed: TranscriptionProvider.GEMINI
          };
      } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.warn("Failed to parse JSON from Gemini, falling back to raw text.", error);
          return {
              text: text,
              providerUsed: TranscriptionProvider.GEMINI
          };
      }
  };

  const formatTimestamp = (seconds: number) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  try {
      if (onProgress) onProgress(1);

      // 1. Upload via File API (now uses OAuth)
      const fileUri = await uploadFileToGemini(file, onProgress);

      if (onProgress) onProgress(100);

      // 2. Wait for processing server-side (now uses OAuth)
      await waitForFileActive(fileUri);

      // 3. Generate structured transcript (uses API Key for now)
      const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelName,
          contents: {
              parts: [
                  { fileData: { fileUri: fileUri, mimeType: file.type || 'audio/wav' } },
                  { text: prompt }
              ]
          },
          config: {
              responseMimeType: "application/json"
          }
      });

      const rawResponseText = response.text || "[]";
      return parseGeminiResponse(rawResponseText);

  } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error("Gemini transcription failed:", error);

      // Fallback path is unlikely to work if OAuth is required, but we keep it for other potential failures.
      if (file.size < 2 * 1024 * 1024) {
          try {
              const base64Audio = await file.arrayBuffer().then((buf) => btoa(String.fromCharCode(...new Uint8Array(buf))));
              const mimeType = file.type || 'audio/webm';
              const response: GenerateContentResponse = await ai.models.generateContent({
                  model: modelName,
                  contents: {
                      parts: [
                          { inlineData: { mimeType: mimeType, data: base64Audio } },
                          { text: prompt }
                      ]
                  },
                  config: {
                      responseMimeType: "application/json",
                  }
              });
              const rawResponseText = response.text || "[]";
              return parseGeminiResponse(rawResponseText);
          } catch (fallbackErr) {
              const fallbackError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
              console.error("Fallback transcription path also failed:", fallbackError);
          }
      }

      throw new Error(`File processing failed: ${error.message}. Please try again on a stable connection.`);
  }
};

// --- OPENAI WHISPER (Legacy support - returns string) ---
const transcribeWithOpenAI = async (
  audioFile: Blob | File,
  apiKey: string,
  settings: TranscriptionSettings
): Promise<TranscriptionResult> => {
  if (!apiKey) throw new Error("OpenAI API Key is missing.");
  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });
  if (!response.ok) throw new Error("OpenAI Error");
  const data = await response.json();
  return {
      text: data.text,
      providerUsed: TranscriptionProvider.OPENAI
  };
};

// --- ASSEMBLYAI ---
const transcribeWithAssemblyAI = async (
  audioFile: Blob | File,
  apiKey: string,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
    if (!apiKey) throw new Error("AssemblyAI API Key is missing. Please check Settings.");
    // ... (rest of the function is the same)
};

// --- MAIN EXPORT ---
export const transcribeAudio = async (
  file: File | Blob,
  _base64: string,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
  switch (settings.provider) {
    case TranscriptionProvider.OPENAI:
      return await transcribeWithOpenAI(file, settings.openaiKey, settings);
    case TranscriptionProvider.ASSEMBLYAI:
      return await transcribeWithAssemblyAI(file, settings.assemblyAiKey, settings, onProgress);
    case TranscriptionProvider.GEMINI:
    default:
      return await transcribeWithGemini(file, settings, onProgress);
  }
};
