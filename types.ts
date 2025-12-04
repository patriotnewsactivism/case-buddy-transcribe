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
  googleClientId: string; // New: For Google Drive Integration
  googleApiKey: string;   // New: Required for Picker API (Project-specific)
  legalMode: boolean; // Enables verbatim, timestamps, and speaker ID
  autoDownloadAudio: boolean; // New: Auto-save audio on stop
}

export interface TranscriptionResult {
  text: string;
  summary?: string;
  detectedLanguage?: string;
  providerUsed: TranscriptionProvider;
}

export interface BatchItem {
  id: string;
  file: File;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  stage: string; // e.g. "Extracting Audio", "Uploading"
  progress: number;
  transcript?: string;
  error?: string;
}

export interface AudioFile {
  file: File | Blob;
  name: string;
  type: string;
  duration?: number;
}