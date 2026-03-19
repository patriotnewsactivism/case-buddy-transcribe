import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings, TranscriptionResult, TranscriptSegment } from "../types";
import { getAccessToken } from "./googleAuthService";
import { fileToBase64 } from "../utils/audioUtils";

/**
 * High-intelligence transcription with automatic summarization and extraction.
 */
const transcribeWithGemini = async (file: Blob | File, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
  if (!API_KEY || API_KEY.trim() === '') {
    throw new Error("Gemini API key is not configured. Please set VITE_GEMINI_API_KEY environment variable for development or API_KEY for production.");
  }
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = ai.getGenerativeModel({ model: settings.geminiModel || 'gemini-1.5-pro' });

  const context = settings.caseContext ? `CONTEXT: ${settings.caseContext}` : '';
  const vocab = settings.customVocabulary.length > 0 ? `VOCAB: ${settings.customVocabulary.join(', ')}` : '';

  const prompt = `
  SYSTEM: You are a professional Legal Intelligence AI. Your task is to transcribe and analyze the following audio/video.
  ${context}
  ${vocab}

  TASK:
  1. Transcribe the file accurately with speaker identification.
  2. Provide a 2-3 sentence executive summary.
  3. Extract "Key Facts" (Names, Dates, Locations, Events).
  4. Identify any "Action Items" (Follow-ups, questions, next steps).

  OUTPUT FORMAT:
  You MUST return ONLY a JSON object with this schema (no markdown):
  {
    "segments": Array<{ "start": number, "end": number, "speaker": string, "text" string }>,
    "summary": string,
    "keyFacts": string[],
    "actionItems": string[]
  }

  RULES:
  1. DIARIZATION: Be aggressive about detecting new speakers. 
  2. ${settings.legalMode ? 'Include all "ums" and "ahs" (Verbatim).' : 'Clean Verbatim (No stutters).'}
  3. Respond only with the JSON object.
  `;

  try {
      const fileUri = await uploadFileToGemini(file, onProgress);
      await waitForFileActive(fileUri);
      
      const res = await model.generateContent({
          contents: [{ parts: [{ fileData: { fileUri, mimeType: file.type || 'audio/wav' } }, { text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
      });

      const parsed: any = JSON.parse(res.response.text());
      return {
          text: parsed.segments.map((s: any) => `[${s.speaker}] ${s.text}`).join('\n'),
          segments: parsed.segments,
          summary: parsed.summary,
          keyFacts: parsed.keyFacts,
          actionItems: parsed.actionItems,
          providerUsed: TranscriptionProvider.GEMINI
      };
  } catch (e) {
      // Try fallback to base64 encoding for small files if file upload fails
      if (file.size < 10 * 1024 * 1024) { // 10MB
          console.log("File upload failed, trying fallback with base64 encoding...");
          try {
              const base64Audio = await fileToBase64(file);
              const fallbackRes = await model.generateContent({
                  contents: [{ parts: [{ inlineData: { mimeType: file.type || 'audio/wav', data: base64Audio } }, { text: prompt }] }],
                  generationConfig: { responseMimeType: "application/json" }
              });
              
              const fallbackParsed: any = JSON.parse(fallbackRes.response.text());
              return {
                  text: fallbackParsed.segments.map((s: any) => `[${s.speaker}] ${s.text}`).join('\n'),
                  segments: fallbackParsed.segments,
                  summary: fallbackParsed.summary,
                  keyFacts: fallbackParsed.keyFacts,
                  actionItems: fallbackParsed.actionItems,
                  providerUsed: TranscriptionProvider.GEMINI
              };
          } catch (fallbackError) {
              console.error("Fallback transcription also failed:", fallbackError);
          }
      }
      
      throw new Error(`Gemini Intelligence Error: ${e instanceof Error ? e.message : String(e)}`);
  }
};

/**
 * Fetches remote media via proxy for URL-based transcription.
 */
export const fetchRemoteMedia = async (url: string): Promise<Blob> => {
    // Try to handle YouTube links or direct links
    // Note: In a production app, this would use a backend proxy. 
    // For now, we fetch direct links.
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not fetch media from URL.");
    return await res.blob();
};

// Re-exporting helpers needed by this service
const waitForFileActive = async (fileUri: string): Promise<void> => {
    const fileId = fileUri.split('/').pop();
    if (!fileId) return;
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error("Auth required");
    let attempt = 0;
    while (attempt < 60) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error("Status check failed");
        const data = await res.json();
        if (data.state === 'ACTIVE') return;
        if (data.state === 'FAILED') throw new Error("File processing failed");
        await new Promise(r => setTimeout(r, 1500));
        attempt++;
    }
};

const uploadFileToGemini = async (file: Blob | File, onProgress?: (pct: number) => void): Promise<string> => {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error("Sign in with Google required for Gemini File API.");
    const res = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Remote_Media' } })
    });
    if (!res.ok) throw new Error("Upload start failed: " + await res.text());
    const uploadUrl = res.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error("No upload URL");
    return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).file.uri) : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
    });
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    // For now, only Gemini supports the "Smart Intelligence" features in the prompt.
    return await transcribeWithGemini(file, settings, onProgress);
};
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Remote_Media' } })
    });
    if (!res.ok) throw new Error("Upload start failed: " + await res.text());
    const uploadUrl = res.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error("No upload URL");
    return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).file.uri) : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
    });
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    // For now, only Gemini supports the "Smart Intelligence" features in the prompt.
    return await transcribeWithGemini(file, settings, onProgress);
};
    return await transcribeWithGemini(file, settings, onProgress);
};
};

            'X-Goog-Upload-Header-Content-Length': file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Remote_Media' } })
    });
    if (!res.ok) throw new Error("Upload start failed: " + await res.text());
    const uploadUrl = res.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error("No upload URL");
    return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).file.uri) : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
    });
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    // For now, only Gemini supports the "Smart Intelligence" features in the prompt.
    return await transcribeWithGemini(file, settings, onProgress);
};
};


            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Remote_Media' } })
    });
    if (!res.ok) throw new Error("Upload start failed: " + await res.text());
    const uploadUrl = res.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error("No upload URL");
    return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).file.uri) : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
    });
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    // For now, only Gemini supports the "Smart Intelligence" features in the prompt.
    return await transcribeWithGemini(file, settings, onProgress);
};
};

            'X-Goog-Upload-Header-Content-Length': file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Remote_Media' } })
    });
    if (!res.ok) throw new Error("Upload start failed: " + await res.text());
    const uploadUrl = res.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error("No upload URL");
    return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).file.uri) : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
    });
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    // For now, only Gemini supports the "Smart Intelligence" features in the prompt.
    return await transcribeWithGemini(file, settings, onProgress);
};
};



