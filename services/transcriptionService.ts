import { TranscriptionSettings, TranscriptionResult } from "../types";
import { transcribeWithDeepgram } from "./deepgramService";
import { transcribeWithGroq } from "./groqService";

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
 * Main transcription entry point — Deepgram first, Groq Whisper second.
 * Gemini is intentionally not part of this waterfall: its billing/service-account
 * state has repeatedly broken transcription in production, so it's no longer
 * used as an automatic fallback. If both configured engines fail (or neither
 * is configured), this throws rather than silently handing the file to Gemini.
 */
export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number, stage?: string) => void): Promise<TranscriptionResult> => {
    const deepgramKey = settings.deepgramKey?.trim();
    const groqKey = settings.groqKey?.trim();

    if (!deepgramKey && !groqKey) {
        throw new Error("No transcription engine configured. Add a Deepgram or Groq API key in Settings.");
    }

    let lastError: unknown;

    if (deepgramKey) {
        try {
            return await transcribeWithDeepgram(file, settings, onProgress);
        } catch (deepgramError) {
            console.warn("Deepgram transcription failed:", deepgramError);
            lastError = deepgramError;
        }
    }

    if (groqKey) {
        try {
            return await transcribeWithGroq(file, settings, onProgress);
        } catch (groqError) {
            console.warn("Groq Whisper transcription failed:", groqError);
            lastError = groqError;
        }
    }

    throw new Error(
        `All configured transcription engines failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
};
