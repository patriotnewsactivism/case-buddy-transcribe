import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings } from "../types";

// --- GEMINI IMPLEMENTATION ---
const transcribeWithGemini = async (
  base64Audio: string,
  mimeType: string,
  settings: TranscriptionSettings
): Promise<string> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  // Use Gemini 3 Pro for Legal Mode (Higher reasoning/accuracy), Flash for speed/standard
  const model = settings.legalMode ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';

  let prompt = "Please transcribe the following audio file accurately. Format with clear paragraph breaks.";
  
  if (settings.legalMode) {
    prompt = `You are an expert Court Reporter. Transcribe the attached audio file for a legal case.
    
    STRICT FORMATTING RULES:
    1. Identify different speakers using the format: [Speaker 1], [Speaker 2], etc.
    2. Insert timestamps [MM:SS] at the start of every speaker change.
    3. Return ONLY the transcript text. No intro/outro.

    ACCURACY & EDITING RULES:
    1. VERBATIM: Keep the sentence structure, slang, and grammar exactly as spoken.
    2. OBVIOUS ERRORS: If a word is clearly a phonetic error (e.g., "reel a state" instead of "real estate"), CORRECT IT based on context.
    3. HESITATIONS: Keep 'um' and 'ah' only if they indicate significant hesitation or are relevant to the witness's credibility. Otherwise, remove minor stutters for readability.
    `;
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Audio } },
        { text: prompt }
      ]
    }
  });

  return response.text || "No text returned from Gemini.";
};

// --- OPENAI WHISPER IMPLEMENTATION ---
const transcribeWithOpenAI = async (
  audioFile: Blob | File,
  apiKey: string,
  settings: TranscriptionSettings
): Promise<string> => {
  if (!apiKey) throw new Error("OpenAI API Key is missing. Please add it in Settings.");

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  
  // prompt parameter in Whisper is for context/style
  if (settings.legalMode) {
    formData.append("prompt", "Transcribe verbatim with Speaker labels (Speaker 1, Speaker 2). Correct obvious phonetic errors.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.text;
};

// --- ASSEMBLYAI IMPLEMENTATION ---
const transcribeWithAssemblyAI = async (
  audioFile: Blob | File,
  apiKey: string,
  settings: TranscriptionSettings
): Promise<string> => {
  if (!apiKey) throw new Error("AssemblyAI API Key is missing. Please add it in Settings.");

  // 1. Upload
  const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { "Authorization": apiKey },
    body: audioFile,
  });

  if (!uploadResponse.ok) throw new Error("Failed to upload audio to AssemblyAI");
  const uploadData = await uploadResponse.json();
  const uploadUrl = uploadData.upload_url;

  // 2. Start Transcription
  const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: uploadUrl,
      speaker_labels: settings.legalMode, 
      punctuate: true,
      format_text: true,
      // AssemblyAI specific setting to help with accuracy
      speech_model: settings.legalMode ? 'best' : 'nano', 
    }),
  });

  if (!transcriptResponse.ok) throw new Error("Failed to start AssemblyAI transcription");
  const transcriptData = await transcriptResponse.json();
  const transcriptId = transcriptData.id;

  // 3. Poll for completion
  let status = "queued";
  let text = "";
  
  while (status !== "completed" && status !== "error") {
    await new Promise((r) => setTimeout(r, 2000)); // Poll every 2s
    
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { "Authorization": apiKey },
    });
    
    const pollData = await pollResponse.json();
    status = pollData.status;

    if (status === "error") throw new Error(`AssemblyAI processing error: ${pollData.error}`);
    
    if (status === "completed") {
      // If legal mode (speaker labels), we format it to match our generic format for parsing
      if (settings.legalMode && pollData.utterances) {
        text = pollData.utterances
          .map((u: any) => `[${new Date(u.start).toISOString().substr(14, 5)}] [Speaker ${u.speaker}] ${u.text}`)
          .join("\n\n");
      } else {
        text = pollData.text;
      }
    }
  }

  return text;
};

// --- MAIN EXPORT ---
export const transcribeAudio = async (
  file: File | Blob,
  base64: string,
  settings: TranscriptionSettings
): Promise<string> => {
  // Determine mime type for Gemini
  const mimeType = file.type || 'audio/webm';

  switch (settings.provider) {
    case TranscriptionProvider.OPENAI:
      return await transcribeWithOpenAI(file, settings.openaiKey, settings);
    case TranscriptionProvider.ASSEMBLYAI:
      return await transcribeWithAssemblyAI(file, settings.assemblyAiKey, settings);
    case TranscriptionProvider.GEMINI:
    default:
      return await transcribeWithGemini(base64, mimeType, settings);
  }
};