import React from 'react';
import { 
  Download, 
  Upload, 
  Brain, 
  FileAudio, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react';

// Local type definitions to avoid import issues
type ProcessingStage =
  | 'QUEUED'
  | 'FETCHING_MEDIA'
  | 'EXTRACTING_AUDIO'
  | 'UPLOADING'
  | 'PROCESSING_AI'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'ERROR';

interface ProgressInfo {
  stage: ProcessingStage;
  stageProgress: number;
  overallProgress: number;
  message: string;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
  bytesProcessed?: number;
  bytesTotal?: number;
}

interface ProgressIndicatorProps {
  progressInfo?: ProgressInfo;
  progress: number;
  stage: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  startedAt?: number;
}

const STAGE_CONFIG: Record<ProcessingStage, { icon: React.ReactNode; label: string; color: string }> = {
  QUEUED: { icon: <Clock size={16} />, label: 'Queued', color: 'text-zinc-400' },
  FETCHING_MEDIA: { icon: <Download size={16} />, label: 'Fetching Media', color: 'text-blue-400' },
  EXTRACTING_AUDIO: { icon: <FileAudio size={16} />, label: 'Extracting Audio', color: 'text-amber-400' },
  UPLOADING: { icon: <Upload size={16} />, label: 'Uploading', color: 'text-cyan-400' },
  PROCESSING_AI: { icon: <Brain size={16} />, label: 'AI Processing', color: 'text-indigo-400' },
  FINALIZING: { icon: <Zap size={16} />, label: 'Finalizing', color: 'text-purple-400' },
  COMPLETED: { icon: <CheckCircle2 size={16} />, label: 'Completed', color: 'text-emerald-400' },
  ERROR: { icon: <AlertCircle size={16} />, label: 'Error', color: 'text-red-400' },
};

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
};

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progressInfo,
  progress,
  stage,
  status,
  startedAt,
}) => {
  const timeElapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const estimatedRemaining = progressInfo?.estimatedTimeRemaining;
  
  const currentStage: ProcessingStage = progressInfo?.stage || 
    (status === 'COMPLETED' ? 'COMPLETED' : 
     status === 'ERROR' ? 'ERROR' : 
     status === 'QUEUED' ? 'QUEUED' : 'PROCESSING_AI');
  
  const stageConfig = STAGE_CONFIG[currentStage];
  
  const getProgressColor = (): string => {
    switch (currentStage) {
      case 'FETCHING_MEDIA': return 'bg-blue-500';
      case 'EXTRACTING_AUDIO': return 'bg-amber-500';
      case 'UPLOADING': return 'bg-cyan-500';
      case 'PROCESSING_AI': return 'bg-indigo-500';
      case 'FINALIZING': return 'bg-purple-500';
      case 'COMPLETED': return 'bg-emerald-500';
      case 'ERROR': return 'bg-red-500';
      default: return 'bg-zinc-500';
    }
  };

  if (status === 'QUEUED') {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Clock size={14} className="animate-pulse" />
        <span className="text-xs font-medium">Waiting in queue...</span>
      </div>
    );
  }

  if (status === 'ERROR') {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <AlertCircle size={14} />
        <span className="text-xs font-medium">Failed</span>
      </div>
    );
  }

  if (status === 'COMPLETED') {
    return (
      <div className="flex items-center gap-2 text-emerald-400">
        <CheckCircle2 size={14} />
        <span className="text-xs font-medium">Completed in {formatTime(timeElapsed)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 ${stageConfig.color}`}>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs font-medium">{stageConfig.label}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {timeElapsed > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatTime(timeElapsed)}
            </span>
          )}
          {estimatedRemaining && estimatedRemaining > 0 && (
            <span className="text-zinc-400">
              ~{formatTime(estimatedRemaining)} remaining
            </span>
          )}
        </div>
      </div>

      <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className={`absolute inset-y-0 left-0 ${getProgressColor()} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {progressInfo && (
