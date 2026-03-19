export enum AppMode {
  UPLOAD = 'UPLOAD',
  RECORD = 'RECORD',
  URL = 'URL',
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
  geminiModel: 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gemini-2.0-flash' | 'gemini-2.5-flash';
  caseContext: string;
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
  keyFacts?: string[];
  actionItems?: string[];
  detectedLanguage?: string;
  providerUsed: TranscriptionProvider;
}

export type ProcessingStage =
  | 'QUEUED'
  | 'FETCHING_MEDIA'
  | 'EXTRACTING_AUDIO'
  | 'UPLOADING'
  | 'PROCESSING_AI'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'ERROR';

export interface ProgressInfo {
  stage: ProcessingStage;
  stageProgress: number;
  overallProgress: number;
  message: string;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
  bytesProcessed?: number;
  bytesTotal?: number;
}

export interface BatchItem {
  id: string;
  file: File | { name: string; url: string; type: string; size?: number };
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  stage: string;
  progress: number;
  progressInfo?: ProgressInfo;
  result?: TranscriptionResult;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  retryCount?: number;
}

export interface AudioFile {
  file: File | Blob | string;
  name: string;
  type: string;
  duration?: number;
}

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string;
  usageCount: number;
  aliases?: string[];
}

