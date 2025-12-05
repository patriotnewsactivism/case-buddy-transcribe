import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings, TranscriptionResult, TranscriptSegment } from "../types";
import { fileToBase64 } from "../utils/audioUtils";

/**
 * Polls the Gemini File API until the uploaded file is in the 'ACTIVE' state.
 */
const waitForFileActive = async (fileUri: string, apiKey: string): Promise<void> => {
    const fileId = fileUri.split('/').pop();
    if (!fileId) return;

    const maxAttempts = 120; // Wait up to 4 minutes for very large files
    let attempt = 0;

    while (attempt < maxAttempts) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`);
        if (!response.ok) throw new Error("Failed to check file status");
        
        const data = await response.json();
        
        if (data.state === 'ACTIVE') {
            return;
        } else if (data.state === 'FAILED') {
            throw new Error("File processing failed on Google servers.");
        }

        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempt++;
    }
    
    throw new Error("File processing timed out. The file might be too large or the service is busy.");
};

// --- GEMINI IMPLEMENTATION ---
const transcribeWithGemini = async (
  file: Blob | File,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
  const API_KEY =
    settings.geminiApiKey?.trim() ||
    (typeof import.meta !== 'undefined' ? import.meta.env.VITE_GEMINI_API_KEY : '') ||
    (typeof process !== 'undefined' ? process.env.API_KEY : '');
  if (!API_KEY) throw new Error("Missing Gemini API Key. Add it in Settings.");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const modelName = 'gemini-2.5-flash'; // 2.5 Flash is best for structured JSON output + speed

  // Build Vocabulary String
  const vocabList = settings.customVocabulary.length > 0 
    ? `VOCABULARY/GLOSSARY (Prioritize these spellings): ${settings.customVocabulary.join(', ')}`
    : '';

  // JSON Prompt for Interactive Transcript
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
  
  // --- HELPER: Parse JSON Response ---
  const parseGeminiResponse = (text: string): TranscriptionResult => {
      try {
          // Clean potential markdown blocks if the model ignores instructions
          const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const segments: TranscriptSegment[] = JSON.parse(cleanedText);
          
          // Reconstruct full text for fallback/export
          const fullText = segments.map(s => `[${formatTimestamp(s.start)}] [${s.speaker}] ${s.text}`).join('\n');

          return {
              text: fullText,
              segments: segments,
              providerUsed: TranscriptionProvider.GEMINI
          };
      } catch (e) {
          console.warn("Failed to parse JSON from Gemini, falling back to raw text.", e);
          return {
              text: text, // Return raw text if JSON parse fails
              providerUsed: TranscriptionProvider.GEMINI
          };
      }
  };

  const formatTimestamp = (seconds: number) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // --- LARGE FILE HANDLING (File API) ---
  const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

  let rawResponseText = "";

  if (file.size > LARGE_FILE_THRESHOLD) {
    try {
        if (onProgress) onProgress(1); // Start progress indication

        // 1. Initiate Resumable Upload
        const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': file.size.toString(),
                'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ file: { display_name: 'Audio_Evidence' } })
        });

        const uploadUrl = uploadResponse.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) throw new Error("Failed to initiate large file upload.");

        // 2. Upload Bytes
        const fileUri = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', uploadUrl);
            xhr.setRequestHeader('Content-Length', file.size.toString());
            xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
            xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const fileData = JSON.parse(xhr.responseText);
                        resolve(fileData.file.uri);
                    } catch (err) {
                        reject(new Error("Failed to parse upload response"));
                    }
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error("Network Error during upload"));
            xhr.send(file);
        });

        if (onProgress) onProgress(100);

        // 3. Wait for file active
        await waitForFileActive(fileUri, API_KEY);

        // 4. Generate
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { fileData: { fileUri: fileUri, mimeType: file.type || 'audio/wav' } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json" // Force JSON output
            }
        });
        rawResponseText = response.text || "[]";

    } catch (e) {
        console.error("Large file upload failed:", e);
        throw new Error("File processing failed. Please try a shorter clip or check your connection.");
    }
  } 
  
  // --- STANDARD SMALL FILE HANDLING ---
  else {
      const base64Audio = await fileToBase64(file);
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
            responseMimeType: "application/json"
        }
      });
      rawResponseText = response.text || "[]";
  }

  return parseGeminiResponse(rawResponseText);
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

interface AssemblyWordResponse {
    start: number;
    end: number;
    text: string;
    speaker?: string | number;
    punctuated_word?: string;
}

interface AssemblyUtteranceResponse {
    start: number;
    end: number;
    speaker?: string | number;
    text: string;
}

interface AssemblyTranscriptResponse {
    id: string;
    status: string;
    text?: string;
    language_code?: string;
    error?: string;
    utterances?: AssemblyUtteranceResponse[];
    words?: AssemblyWordResponse[];
}

const formatSpeakerLabel = (speaker: string | number | undefined, fallbackIndex: number) => {
    if (speaker === undefined || speaker === null || `${speaker}`.trim().length === 0) {
        return `Speaker ${fallbackIndex}`;
    }
    return `Speaker ${speaker}`;
};

const mapWordsToSegments = (words?: AssemblyWordResponse[]): TranscriptSegment[] | undefined => {
    if (!words || words.length === 0) return undefined;

    const segments: TranscriptSegment[] = [];
    let current: TranscriptSegment | null = null;
    let fallbackSpeakerIndex = 1;

    words.forEach((word) => {
        const speakerLabel =
            word.speaker === undefined || word.speaker === null || `${word.speaker}`.trim().length === 0
                ? current?.speaker || `Speaker ${fallbackSpeakerIndex++}`
                : formatSpeakerLabel(word.speaker, fallbackSpeakerIndex);
        const token = word.punctuated_word?.trim() || word.text.trim();
        if (!token) return;

        if (current && current.speaker === speakerLabel) {
            current.text = `${current.text} ${token}`.trim();
            current.end = word.end / 1000;
        } else {
            if (current) segments.push(current);
            current = {
                start: word.start / 1000,
                end: word.end / 1000,
                speaker: speakerLabel,
                text: token,
            };
        }
    });

    if (current) segments.push(current);
    return segments;
};

export const mapAssemblyResponseToResult = (
    transcript: AssemblyTranscriptResponse
): TranscriptionResult => {
    const isPlaceholderTranscriptText = (text?: string) =>
        Boolean(text && text.trim().toLowerCase() === "assemblyai support pending update to json schema");

    const segmentsFromUtterances = transcript.utterances?.map((utterance, index) => {
        const speakerLabel = formatSpeakerLabel(utterance.speaker, index + 1);

        return {
            start: utterance.start / 1000,
            end: utterance.end / 1000,
            speaker: speakerLabel,
            text: utterance.text,
        } as TranscriptSegment;
    });

    const segments =
        (segmentsFromUtterances && segmentsFromUtterances.length > 0
            ? segmentsFromUtterances
            : undefined) || mapWordsToSegments(transcript.words);

    const combinedTextFromSegments = segments?.map((s) => s.text).join(" ").trim();
    const resolvedText = combinedTextFromSegments && combinedTextFromSegments.length > 0
        ? combinedTextFromSegments
        : !isPlaceholderTranscriptText(transcript.text) && transcript.text
            ? transcript.text
            : "";

    return {
        text: resolvedText,
        segments: segments && segments.length > 0 ? segments : undefined,
        detectedLanguage: transcript.language_code,
        providerUsed: TranscriptionProvider.ASSEMBLYAI,
    };
};

// --- ASSEMBLYAI (Legacy support - returns string) ---
const transcribeWithAssemblyAI = async (
  audioFile: Blob | File,
  apiKey: string,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
    if (!apiKey) throw new Error("AssemblyAI API Key is missing.");

    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: {
            authorization: apiKey,
        },
        body: audioFile,
    });

    if (!uploadResponse.ok) {
        throw new Error("Failed to upload audio to AssemblyAI.");
    }

    const uploadData = await uploadResponse.json();
    const audioUrl = uploadData.upload_url as string;
    if (!audioUrl) {
        throw new Error("AssemblyAI upload URL missing in response.");
    }

    const transcriptionPayload: Record<string, unknown> = {
        audio_url: audioUrl,
        speaker_labels: true,
        format_text: !settings.legalMode,
        disfluencies: settings.legalMode,
        word_boost: settings.customVocabulary?.length ? settings.customVocabulary : undefined,
    };

    const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: {
            authorization: apiKey,
            "content-type": "application/json",
        },
        body: JSON.stringify(transcriptionPayload),
    });

    if (!transcriptResponse.ok) {
        throw new Error("Failed to start AssemblyAI transcription.");
    }

    const { id } = (await transcriptResponse.json()) as { id: string };
    if (!id) throw new Error("AssemblyAI did not return a transcript ID.");

    const maxAttempts = 120; // up to 10 minutes (5s interval)
    let attempt = 0;

    while (attempt < maxAttempts) {
        const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: { authorization: apiKey },
        });

        if (!statusResponse.ok) {
            throw new Error("Failed to poll AssemblyAI transcript status.");
        }

        const transcript = (await statusResponse.json()) as AssemblyTranscriptResponse;

        if (transcript.status === "completed") {
            return mapAssemblyResponseToResult(transcript);
        }

        if (transcript.status === "error") {
            throw new Error(transcript.error || "AssemblyAI transcription failed.");
        }

        attempt++;
        if (onProgress) {
            const percent = Math.min(99, Math.round((attempt / maxAttempts) * 100));
            onProgress(percent);
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("AssemblyAI transcription timed out. Please try again with a shorter clip.");
};

// --- MAIN EXPORT ---
export const transcribeAudio = async (
  file: File | Blob,
  base64: string,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
  const requireKey = (key: string | undefined, label: string) => {
    if (!key || key.trim().length === 0) {
      throw new Error(`${label} API key is missing. Open Settings and add it first.`);
    }
    return key.trim();
  };

  switch (settings.provider) {
    case TranscriptionProvider.OPENAI:
      return await transcribeWithOpenAI(file, requireKey(settings.openaiKey, 'OpenAI'), settings);
    case TranscriptionProvider.ASSEMBLYAI:
      return await transcribeWithAssemblyAI(file, requireKey(settings.assemblyAiKey, 'AssemblyAI'), settings, onProgress);
    case TranscriptionProvider.GEMINI:
    default:
      return await transcribeWithGemini(file, settings, onProgress);
  }
};