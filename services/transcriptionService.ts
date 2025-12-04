import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { TranscriptionProvider, TranscriptionSettings } from "../types";
import { fileToBase64 } from "../utils/audioUtils";

// --- GEMINI IMPLEMENTATION ---
const transcribeWithGemini = async (
  file: Blob | File,
  settings: TranscriptionSettings
): Promise<string> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const modelName = settings.legalMode ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';

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

  // --- LARGE FILE HANDLING ---
  // If file is > 18MB (safe margin below 20MB limit), we MUST use the File API.
  if (file.size > 18 * 1024 * 1024) {
    try {
        // 1. Upload the file to Google's temporary GenAI storage
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

        // 2. Perform the actual bytes transfer
        const bytesResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Length': file.size.toString(),
                'X-Goog-Upload-Offset': '0',
                'X-Goog-Upload-Command': 'upload, finalize'
            },
            body: file
        });
        
        const fileData = await bytesResponse.json();
        const fileUri = fileData.file.uri;

        // 3. Generate Content using the File URI
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { fileData: { fileUri: fileUri, mimeType: file.type || 'audio/wav' } },
                    { text: prompt }
                ]
            }
        });
        return response.text || "No text returned.";

    } catch (e) {
        console.error("Large file upload failed:", e);
        throw new Error("File too large for standard upload and File API failed. Please try a shorter clip.");
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
        }
      });
      return response.text || "No text returned from Gemini.";
  }
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
  
  if (settings.legalMode) {
    formData.append("prompt", "Transcribe verbatim with Speaker labels (Speaker 1, Speaker 2). Correct obvious phonetic errors.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
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

  const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { "Authorization": apiKey },
    body: audioFile,
  });

  if (!uploadResponse.ok) throw new Error("Failed to upload audio to AssemblyAI");
  const uploadData = await uploadResponse.json();
  const uploadUrl = uploadData.upload_url;

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
      speech_model: settings.legalMode ? 'best' : 'nano', 
    }),
  });

  if (!transcriptResponse.ok) throw new Error("Failed to start AssemblyAI transcription");
  const transcriptData = await transcriptResponse.json();
  const transcriptId = transcriptData.id;

  let status = "queued";
  let text = "";
  
  while (status !== "completed" && status !== "error") {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { "Authorization": apiKey },
    });
    const pollData = await pollResponse.json();
    status = pollData.status;

    if (status === "error") throw new Error(`AssemblyAI processing error: ${pollData.error}`);
    if (status === "completed") {
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
  switch (settings.provider) {
    case TranscriptionProvider.OPENAI:
      return await transcribeWithOpenAI(file, settings.openaiKey, settings);
    case TranscriptionProvider.ASSEMBLYAI:
      return await transcribeWithAssemblyAI(file, settings.assemblyAiKey, settings);
    case TranscriptionProvider.GEMINI:
    default:
      return await transcribeWithGemini(file, settings);
  }
};