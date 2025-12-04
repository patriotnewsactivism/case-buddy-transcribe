import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import TranscriptionResult from './components/TranscriptionResult';
import BatchQueue from './components/BatchQueue';
import SettingsDialog from './components/SettingsDialog';
import { AppMode, TranscriptionStatus, TranscriptionProvider, TranscriptionSettings, BatchItem } from './types';
import { transcribeAudio } from './services/transcriptionService';
import { processMediaFile } from './utils/audioUtils';
import { downloadFile, generateFilename } from './utils/fileUtils';
import { openDrivePicker } from './services/driveService';
import { ArrowLeft, Plus } from 'lucide-react';

const DEFAULT_SETTINGS: TranscriptionSettings = {
  provider: TranscriptionProvider.GEMINI,
  openaiKey: '',
  assemblyAiKey: '',
  googleClientId: '',
  legalMode: false,
  autoDownloadAudio: false,
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.RECORD);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TranscriptionSettings>(DEFAULT_SETTINGS);
  
  // Batch State
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  // Drive State
  const [isDriveLoading, setIsDriveLoading] = useState(false);

  // Load settings
  useEffect(() => {
    const savedSettings = localStorage.getItem('whisper_settings');
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const handleSaveSettings = (newSettings: TranscriptionSettings) => {
    setSettings(newSettings);
    localStorage.setItem('whisper_settings', JSON.stringify(newSettings));
  };

  // --- QUEUE MANAGEMENT ---

  const handleFilesSelect = (files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'QUEUED',
      stage: 'Pending',
      progress: 0
    }));

    setQueue(prev => [...prev, ...newItems]);
    setMode(AppMode.UPLOAD); // Ensure we are in upload mode view
  };

  const handleRecordingComplete = (blob: Blob) => {
    // Treat recording as a single file batch
    const file = new File([blob], `Recording_${new Date().toLocaleTimeString()}.webm`, { type: 'audio/webm' });
    handleFilesSelect([file]);
  };

  const handleDriveSelect = async () => {
      if (!settings.googleClientId) {
          alert("Please configure your Google Client ID in settings to use Drive Integration.");
          setIsSettingsOpen(true);
          return;
      }

      setIsDriveLoading(true);
      try {
          const files = await openDrivePicker(settings.googleClientId, process.env.API_KEY || '');
          if (files.length > 0) {
              handleFilesSelect(files);
          }
      } catch (e) {
          console.error("Drive Selection Error", e);
          alert("Failed to access Google Drive. Please check your Client ID and network connection.");
      } finally {
          setIsDriveLoading(false);
      }
  };

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // --- BATCH PROCESSOR LOOP ---
  
  const processQueue = async () => {
    if (isProcessingRef.current) return;

    // Find next queued item
    const nextItem = queue.find(i => i.status === 'QUEUED');
    if (!nextItem) return;

    isProcessingRef.current = true;
    const itemId = nextItem.id;

    try {
        // 1. OPTIMIZE / CONVERT
        updateItem(itemId, { status: 'PROCESSING', stage: 'Optimizing Media', progress: 5 });
        
        let fileToUpload: File | Blob = nextItem.file;
        // Run everything through processor (handles video->audio and large file checks)
        fileToUpload = await processMediaFile(nextItem.file);
        
        // 2. TRANSCRIBE
        updateItem(itemId, { stage: 'Uploading Evidence', progress: 15 });
        
        const text = await transcribeAudio(
            fileToUpload,
            '',
            settings,
            (pct) => {
                // Map upload progress (0-100) to total progress (15-90)
                const mappedProgress = 15 + Math.round(pct * 0.75);
                updateItem(itemId, { 
                    stage: pct === 100 ? 'Analyzing & Transcribing...' : `Uploading (${pct}%)`, 
                    progress: mappedProgress 
                });
            }
        );

        updateItem(itemId, { status: 'COMPLETED', progress: 100, transcript: text });

    } catch (error: any) {
        console.error(`Error processing file ${nextItem.file.name}:`, error);
        updateItem(itemId, { status: 'ERROR', error: error.message || 'Processing Failed' });
    } finally {
        isProcessingRef.current = false;
        // Recursively call to process next item
        processQueue();
    }
  };

  // Trigger processing whenever queue changes
  useEffect(() => {
    processQueue();
  }, [queue, settings]); // Re-run if queue changes

  // --- HANDLERS ---

  const handleDownloadAll = () => {
      const completed = queue.filter(i => i.status === 'COMPLETED' && i.transcript);
      if (completed.length === 0) return;

      const combinedText = completed.map(i => {
          return `--- FILE: ${i.file.name} ---\n\n${i.transcript}\n\n`;
      }).join('\n========================================\n\n');

      downloadFile(combinedText, generateFilename('All_Transcripts', 'txt'), 'text/plain');
  };

  const resetQueue = () => {
      if (confirm("Clear all files and results?")) {
          setQueue([]);
          setViewingItemId(null);
          setMode(AppMode.RECORD); // Go back to default
      }
  }

  // --- RENDER HELPERS ---

  const viewingItem = viewingItemId ? queue.find(i => i.id === viewingItemId) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      <Header 
        currentMode={mode} 
        setMode={(m) => {
             // If switching to Record, we just show recorder. Queue stays in background unless cleared.
             setMode(m);
             setViewingItemId(null);
        }} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <main className="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center">
        
        {/* VIEW: RESULT DETAIL */}
        {viewingItem && viewingItem.transcript ? (
            <div className="w-full animate-in slide-in-from-right duration-300">
                <button 
                    onClick={() => setViewingItemId(null)}
                    className="mb-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={18} /> Back to Batch Queue
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 px-1">{viewingItem.file.name}</h2>
                <TranscriptionResult text={viewingItem.transcript} audioFile={viewingItem.file} />
            </div>
        ) : (
            // VIEW: MAIN CONTENT
            <>
                {/* Intro (Only show if queue is empty and recording mode) */}
                {queue.length === 0 && mode === AppMode.RECORD && (
                    <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
                            Turn voice into evidence.
                        </h2>
                        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                            Record proceedings or process massive folders of video evidence.
                            <span className="block mt-2 text-sm text-zinc-500">
                                Smart Engine auto-extracts audio from video to bypass limits.
                            </span>
                        </p>
                    </div>
                )}

                {/* Mode Switcher Content */}
                {queue.length === 0 && (
                    <div className="w-full">
                        {mode === AppMode.RECORD ? (
                            <AudioRecorder 
                                onRecordingComplete={handleRecordingComplete} 
                                status={TranscriptionStatus.IDLE}
                                autoDownload={settings.autoDownloadAudio}
                            />
                        ) : (
                            <FileUploader 
                                onFilesSelect={handleFilesSelect}
                                onDriveSelect={handleDriveSelect}
                                isDriveLoading={isDriveLoading} 
                            />
                        )}
                    </div>
                )}

                {/* Queue View (If items exist) */}
                {queue.length > 0 && (
                     <div className="w-full">
                        <div className="flex justify-between items-center mb-6">
                             {/* Add More Button */}
                             {mode === AppMode.UPLOAD && (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={resetQueue}
                                        className="text-sm text-zinc-500 hover:text-red-400 px-3 py-2"
                                    >
                                        Clear Queue
                                    </button>
                                </div>
                             )}
                        </div>

                        <BatchQueue 
                            queue={queue}
                            onViewResult={(item) => setViewingItemId(item.id)}
                            onDownloadAll={handleDownloadAll}
                        />

                        {/* Dropzone for adding more files (Mini) */}
                         <div className="mt-8 pt-8 border-t border-zinc-900">
                             <p className="text-center text-zinc-600 text-sm mb-4">Need to add more files?</p>
                             <div className="max-w-md mx-auto opacity-50 hover:opacity-100 transition-opacity">
                                <FileUploader 
                                    onFilesSelect={handleFilesSelect}
                                    onDriveSelect={handleDriveSelect}
                                    isDriveLoading={isDriveLoading}
                                />
                             </div>
                         </div>
                     </div>
                )}
            </>
        )}

      </main>
    </div>
  );
};

export default App;