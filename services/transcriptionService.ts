import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings, TranscriptionResult, TranscriptSegment } from "../types";
import { getAccessToken } from "./googleAuthService";
import { fileToBase64 } from "../utils/audioUtils";

// Helper function to create fetch with timeout
const fetchWithTimeout = (url: string, options: RequestInit, timeout = 30000): Promise<Response> => {
  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
    )
  ]);
};

// Helper function to retry failed requests
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
};

/**
 * High-intelligence transcription with automatic summarization and extraction.
 */
const transcribeWithGemini = async (file: Blob | File, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
  if (!API_KEY || API_KEY.trim() === '') {
    throw new Error("Gemini API key is not configured. Please set VITE_GEMINI_API_KEY environment variable for development or API_KEY for production.");
  }
  
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = ai.getGenerativeModel({ model: settings.geminiModel || 'gemini-2.5-flash' }); // Changed to cheaper model

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
  "segments": Array<{ "start": number, "end": number, "speaker": string, "text": string }>,
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
 * Fetches remote media via proxy for URL-based transcription with better error handling.
 */
export const fetchRemoteMedia = async (url: string): Promise<Blob> => {
    try {
        // Add timeout and retry logic for URL fetching
        const response = await retryOperation(async () => {
            return await fetchWithTimeout(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'video/mp4, audio/*, */*',
                }
            }, 45000); // 45 second timeout for media fetching
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
        }

        // Check if response is actually valid media
        const contentType = response.headers.get('content-type');
        if (!contentType || (!contentType.startsWith('video/') && !contentType.startsWith('audio/'))) {
            throw new Error(`Invalid content type: ${contentType}. Expected video or audio content.`);
        }

        const blob = await response.blob();
        
        // Validate blob size
        if (blob.size === 0) {
            throw new Error('Received empty media file');
        }

        return blob;
    } catch (error) {
        console.error('Error fetching remote media:', error);
        throw new Error(`Failed to fetch remote media: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Waits for file to be active with timeout and retry logic
 */
const waitForFileActive = async (fileUri: string): Promise<void> => {
    const fileId = fileUri.split('/').pop();
    if (!fileId) return;
    
    const accessToken = getAccessToken();
    if (!accessToken) {
        throw new Error("Authentication required for file processing");
    }

    return retryOperation(async () => {
        let attempt = 0;
        while (attempt < 30) { // Reduced from 60 to 30 attempts
            const res = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/files/${fileId}`,
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                },
                10000 // 10 second timeout for status checks
            );

            if (!res.ok) {
                throw new Error(`Status check failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            if (data.state === 'ACTIVE') return;
            if (data.state === 'FAILED') throw new Error("File processing failed");
            
            await new Promise(r => setTimeout(r, 2000)); // Increased delay to 2 seconds
            attempt++;
        }
        throw new Error("File processing timeout");
    }, 3, 2000);
};

/**
 * Uploads file to Gemini with timeout and progress tracking
 */
const uploadFileToGemini = async (file: Blob | File, onProgress?: (pct: number) => void): Promise<string> => {
    const accessToken = getAccessToken();
    if (!accessToken) {
        // Fallback to API key if available for direct file upload
        const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
        if (!API_KEY) {
            throw new Error("Google authentication required or API key not configured. Please sign in with Google or set API_KEY environment variable.");
        }
        
        return uploadWithApiKey(file, onProgress, API_KEY);
    }
    
    return uploadWithOAuth(file, onProgress, accessToken);
};

/**
 * Uploads file using API key (direct upload)
 */
const uploadWithApiKey = async (file: Blob | File, onProgress?: (pct: number) => void, apiKey: string): Promise<string> => {
    return retryOperation(async () => {
        const startResponse = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': file.size.toString(),
                    'X-Goog-Upload-Header-Content-Type': file.type || 'audio/wav',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Remote_Media' } })
            },
            30000 // 30 second timeout for upload initiation
        );

        if (!startResponse.ok) {
            const errorText = await startResponse.text().catch(() => '');
            throw new Error(`Upload start failed: ${startResponse.status} ${errorText}`);
        }

        const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) throw new Error("Failed to initiate Gemini upload session.");

        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 120000; // 2 minute timeout for upload
            xhr.open('POST', uploadUrl);
            xhr.setRequestHeader('Content-Length', file.size.toString());
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
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error("Network Error during upload"));
            xhr.ontimeout = () => reject(new Error("Upload timeout"));
            xhr.send(file);
        });
    }, 3, 2000);
};

/**
 * Uploads file using OAuth authentication
 */
const uploadWithOAuth = async (file: Blob | File, onProgress?: (pct: number) => void, accessToken: string): Promise<string> => {
    return retryOperation(async () => {
        const res = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/upload/v1beta/files`,
            {
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
            },
            30000 // 30 second timeout for upload initiation
        );

        if (!res.ok) throw new Error(`Upload start failed: ${res.status} ${res.statusText}`);
        
        const uploadUrl = res.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) throw new Error("No upload URL");

        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 120000; // 2 minute timeout for upload
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
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.ontimeout = () => reject(new Error("Upload timeout"));
            xhr.send(file);
        });
    }, 3, 2000);
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    // For now, only Gemini supports the "Smart Intelligence" features in the prompt.
    return await transcribeWithGemini(file, settings, onProgress);
};
