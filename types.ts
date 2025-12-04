export enum AppMode {
  UPLOAD = 'UPLOAD',
  RECORD = 'RECORD',
}

export enum TranscriptionStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum TranscriptionProvider {
  GEMINI = 'GEMINI',
  OPENAI = 'OPENAI',
  ASSEMBLYAI = 'ASSEMBLYAI',
}

export interface TranscriptionSettings {
  provider: TranscriptionProvider;
  openaiKey: string;
  assemblyAiKey: string;
  legalMode: boolean; // Enables verbatim, timestamps, and speaker ID
}

export interface TranscriptionResult {
  text: string;
  summary?: string;
  detectedLanguage?: string;
  providerUsed: TranscriptionProvider;
}

export interface AudioFile {
  file: File | Blob;
  name: string;
  type: string;
  duration?: number;
}