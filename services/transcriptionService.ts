import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings, TranscriptionResult, TranscriptSegment } from "../types";
import { fileToBase64 } from "../utils/audioUtils";

/**
 * Polls the Gemini File API until the uploaded file is in the 'ACTIVE' state.
 * Uses exponential backoff starting at 500ms for faster initial checks.
 */
const waitForFileActive = async (fileUri: string, apiKey: string): Promise<void> => {
    const fileId = fileUri.split('/').pop();
    if (!fileId) return;

    const maxAttempts = 60; // Reduced attempts since we use backoff
    let attempt = 0;
    let delay = 500; // Start with 500ms for quick initial checks

    while (attempt < maxAttempts) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`);
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

// --- GEMINI IMPLEMENTATION ---
const transcribeWithGemini = async (
  file: Blob | File,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

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

// --- ASSEMBLYAI ---
const transcribeWithAssemblyAI = async (
  audioFile: Blob | File,
  apiKey: string,
  settings: TranscriptionSettings,
  onProgress?: (percent: number) => void
): Promise<TranscriptionResult> => {
    if (!apiKey) throw new Error("AssemblyAI API Key is missing. Please check Settings.");

    // 1. Upload File
    const uploadUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://api.assemblyai.com/v2/upload');
        xhr.setRequestHeader('Authorization', apiKey);
        
        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                   const percentComplete = Math.round((event.loaded / event.total) * 30); // Upload is ~30% of perceived time
                   onProgress(percentComplete);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve(response.upload_url);
            } else {
                reject(new Error(`AssemblyAI Upload failed: ${xhr.statusText}`));
            }
        };
        xhr.onerror = () => reject(new Error("Network error during AssemblyAI upload"));
        xhr.send(audioFile);
    });

    // 2. Request Transcription
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            audio_url: uploadUrl,
            speaker_labels: true,
            word_boost: settings.customVocabulary,
            boost_param: settings.customVocabulary.length > 0 ? 'high' : undefined
        }),
    });

    if (!response.ok) {
        throw new Error(`AssemblyAI Transcription Request failed: ${response.statusText}`);
    }

    const { id } = await response.json();

    // 3. Poll for Completion
    let pollingAttempt = 0;
    while (true) {
        pollingAttempt++;
        const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: { 'Authorization': apiKey },
        });
        const result = await pollingResponse.json();

        if (result.status === 'completed') {
            if (onProgress) onProgress(100);

            // Map AssemblyAI utterances to our TranscriptSegment format
            const segments: TranscriptSegment[] = (result.utterances || []).map((u: any) => ({
                start: u.start / 1000, // Convert ms to seconds
                end: u.end / 1000,
                speaker: `Speaker ${u.speaker}`,
                text: u.text
            }));

            // Fallback for when speaker_labels aren't generated (short audio or single speaker sometimes)
            if (segments.length === 0 && result.text) {
                segments.push({
                    start: 0,
                    end: result.audio_duration || 0,
                    speaker: 'Speaker',
                    text: result.text
                });
            }

            return {
                text: result.text,
                segments: segments,
                providerUsed: TranscriptionProvider.ASSEMBLYAI,
                detectedLanguage: result.language_code
            };
        } else if (result.status === 'error') {
            throw new Error(`AssemblyAI Processing Failed: ${result.error}`);
        } else {
            // Processing...
            // Fake progress from 30% to 90%
            if (onProgress) {
                const fakeProgress = 30 + Math.min(60, pollingAttempt * 2); 
                onProgress(fakeProgress);
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
};

// --- MAIN EXPORT ---
export const transcribeAudio = async (
  file: File | Blob,
  base64: string, // Unused here, kept for interface compatibility if needed, but logic uses file directly
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