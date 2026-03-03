import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings, TranscriptionResult, TranscriptSegment } from "../types";
import { getAccessToken } from "./googleAuthService";

interface AssemblyAIUtterance {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

interface AssemblyAITranscriptResult {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  utterances?: AssemblyAIUtterance[];
  error?: string;
  language_code?: string;
  audio_duration?: number;
}

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
    throw new Error("File processing timed out");
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
        body: JSON.stringify({ file: { display_name: file instanceof File ? file.name : 'Audio_Record' } })
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

const transcribeWithGemini = async (file: Blob | File, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!API_KEY) throw new Error("Missing Gemini API Key");
  const ai = new GoogleGenAI(API_KEY);
  const model = ai.getGenerativeModel({ model: settings.geminiModel || 'gemini-2.5-flash' });

  const vocab = settings.customVocabulary.length > 0 ? `KEY VOCABULARY: ${settings.customVocabulary.join(', ')}` : '';
  const context = settings.caseContext ? `CASE CONTEXT: ${settings.caseContext}` : '';

  const prompt = `
  SYSTEM: You are a professional, high-fidelity transcription specialist. Your output must be flawless.
  ${context}
  ${vocab}

  TASK:
  Transcribe the following audio/video file into a structured speaker-labeled transcript. 
  You MUST return ONLY a JSON Array of objects. No markdown.

  SCHEMA:
  Array<{
    start: number;
    end: number;
    speaker: string;
    text: string;
  }>

  PRECISION RULES:
  1. DIARIZATION: Be extremely precise about speaker identification. If a new speaker starts talking, create a new segment.
  2. VERBATIM: ${settings.legalMode ? 'Include all filler words (ums, ahs, stutters) exactly as spoken.' : 'Clean verbatim: Remove stutters but preserve every meaningful word.'}
  3. NAMES/TERMS: If you hear a word from the KEY VOCABULARY or CASE CONTEXT, prioritize that spelling/formatting.
  4. NO HALLUCINATION: If a word is unintelligible, use "[unintelligible]".
  `;

  try {
      const fileUri = await uploadFileToGemini(file, onProgress);
      await waitForFileActive(fileUri);
      const res = await model.generateContent({
          contents: [{ parts: [{ fileData: { fileUri, mimeType: file.type || 'audio/wav' } }, { text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
      });
      const segments: TranscriptSegment[] = JSON.parse(res.response.text());
      return {
          text: segments.map(s => `[${s.speaker}] ${s.text}`).join('\n'),
          segments,
          providerUsed: TranscriptionProvider.GEMINI
      };
  } catch (e) {
      throw new Error(`Gemini Transcription Error: ${e instanceof Error ? e.message : String(e)}`);
  }
};

const transcribeWithOpenAI = async (audioFile: Blob | File, apiKey: string): Promise<TranscriptionResult> => {
  if (!apiKey) throw new Error("OpenAI Key missing");
  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: formData,
  });
  if (!res.ok) throw new Error("OpenAI Error");
  const data = await res.json();
  return { text: data.text, providerUsed: TranscriptionProvider.OPENAI };
};

const transcribeWithAssemblyAI = async (audioFile: Blob | File, apiKey: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
    if (!apiKey) throw new Error("AssemblyAI Key missing");
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST', headers: { 'Authorization': apiKey }, body: audioFile
    });
    const { upload_url } = await uploadRes.json();
    const transRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST', headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url, speaker_labels: true, word_boost: settings.customVocabulary })
    });
    const { id } = await transRes.json();
    while (true) {
        const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers: { 'Authorization': apiKey } });
        const result = await poll.json() as AssemblyAITranscriptResult;
        if (result.status === 'completed') {
            const segments = (result.utterances || []).map(u => ({ start: u.start / 1000, end: u.end / 1000, speaker: `Speaker ${u.speaker}`, text: u.text }));
            return { text: result.text || '', segments, providerUsed: TranscriptionProvider.ASSEMBLYAI };
        }
        if (result.status === 'error') throw new Error(result.error);
        await new Promise(r => setTimeout(r, 3000));
    }
};

export const transcribeAudio = async (file: File | Blob, _base64: string, settings: TranscriptionSettings, onProgress?: (pct: number) => void): Promise<TranscriptionResult> => {
  switch (settings.provider) {
    case TranscriptionProvider.OPENAI: return await transcribeWithOpenAI(file, settings.openaiKey);
    case TranscriptionProvider.ASSEMBLYAI: return await transcribeWithAssemblyAI(file, settings.assemblyAiKey, settings, onProgress);
    default: return await transcribeWithGemini(file, settings, onProgress);
  }
};
