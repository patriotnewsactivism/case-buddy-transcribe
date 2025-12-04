import React from 'react';
import { BatchItem } from '../types';
import { FileAudio, FileVideo, CheckCircle2, Loader2, AlertCircle, Clock, Eye, Download } from 'lucide-react';

interface BatchQueueProps {
  queue: BatchItem[];
  onViewResult: (item: BatchItem) => void;
  onDownloadAll: () => void;
}

const BatchQueue: React.FC<BatchQueueProps> = ({ queue, onViewResult, onDownloadAll }) => {
  const completedCount = queue.filter(i => i.status === 'COMPLETED').length;
  const progressPercent = Math.round((completedCount / queue.length) * 100);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* Header Stats */}
      <div className="flex items-center justify-between bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
        <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Batch Processing
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-400 border border-zinc-700">
                    {queue.length} Files
                </span>
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
                Processing queue sequentially to ensure highest quality.
            </p>
        </div>
        <div className="text-right">
            <div className="text-3xl font-mono font-light text-white">
                {completedCount}<span className="text-zinc-600">/</span>{queue.length}
            </div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Completed</div>
        </div>
      </div>

      {/* Global Progress */}
      {progressPercent < 100 && (
          <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-500 ease-out" 
                style={{ width: `${progressPercent}%` }}
              />
          </div>
      )}

      {/* Action Bar */}
      {completedCount > 0 && (
           <div className="flex justify-end">
               <button 
                onClick={onDownloadAll}
                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
               >
                 <Download size={14} /> Download All Completed Transcripts
               </button>
           </div>
      )}

      {/* List */}
      <div className="grid gap-3">
        {queue.map((item) => (
            <div 
                key={item.id}
                className={`group relative overflow-hidden p-4 rounded-xl border transition-all duration-300 ${
                    item.status === 'PROCESSING' 
                        ? 'bg-zinc-900/80 border-indigo-500/50 shadow-lg shadow-indigo-900/10' 
                        : item.status === 'COMPLETED'
                        ? 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700'
                        : 'bg-zinc-900/10 border-zinc-800/50 opacity-60'
                }`}
            >
                {/* Processing Background Progress Bar */}
                {item.status === 'PROCESSING' && (
                    <div 
                        className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 transition-all duration-300" 
                        style={{ width: `${item.progress}%` }}
                    />
                )}

                <div className="flex items-center justify-between gap-4">
                    {/* File Info */}
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            item.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                            item.status === 'PROCESSING' ? 'bg-indigo-500/10 text-indigo-400' :
                            item.status === 'ERROR' ? 'bg-red-500/10 text-red-400' :
                            'bg-zinc-800 text-zinc-500'
                        }`}>
                            {item.file.type.startsWith('video') ? <FileVideo size={20} /> : <FileAudio size={20} />}
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-medium text-zinc-200 truncate">{item.file.name}</h4>
                            <p className="text-xs text-zinc-500 flex items-center gap-2">
                                {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                                {item.status === 'PROCESSING' && (
                                    <span className="text-indigo-400 font-mono">• {item.stage} ({item.progress}%)</span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Status / Action */}
                    <div className="shrink-0">
                        {item.status === 'QUEUED' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 text-zinc-500 text-xs font-medium">
                                <Clock size={14} /> Pending
                            </div>
                        )}
                        
                        {item.status === 'PROCESSING' && (
                             <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-medium animate-pulse">
                                <Loader2 size={14} className="animate-spin" /> Processing
                            </div>
                        )}

                        {item.status === 'ERROR' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium" title={item.error}>
                                <AlertCircle size={14} /> Failed
                            </div>
                        )}

                        {item.status === 'COMPLETED' && (
                            <button
                                onClick={() => onViewResult(item)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-sm font-medium transition-colors border border-zinc-700"
                            >
                                <Eye size={16} /> View Transcript
                            </button>
                        )}
                    </div>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default BatchQueue;