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
  googleClientId: string;
  googleApiKey: string;
  geminiModel: 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gemini-2.0-flash' | 'gemini-2.5-flash'; // New: Model Choice
  caseContext: string; // New: Provide context for the AI
  legalMode: boolean;
  autoDownloadAudio: boolean;
  autoDriveUpload: boolean;
  customVocabulary: string[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments?: TranscriptSegment[];
  summary?: string;
  detectedLanguage?: string;
  providerUsed: TranscriptionProvider;
}

export interface BatchItem {
  id: string;
  file: File;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  stage: string;
  progress: number;
  result?: TranscriptionResult;
  error?: string;
}

export interface AudioFile {
  file: File | Blob;
  name: string;
  type: string;
  duration?: number;
}

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}
