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
import { downloadFile, generateFilename, formatTranscriptWithSpeakers } from './utils/fileUtils';
import { openDrivePicker, uploadToDrive } from './services/driveService';
import { ArrowLeft } from 'lucide-react';

const DEFAULT_SETTINGS: TranscriptionSettings = {
  provider: TranscriptionProvider.GEMINI,
  openaiKey: '',
  assemblyAiKey: '',
  googleClientId: '',
  googleApiKey: '', 
  legalMode: false,
  autoDownloadAudio: false,
  autoDriveUpload: false,
  customVocabulary: [], // Initialize empty
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TranscriptionSettings>(DEFAULT_SETTINGS);
  
  // Batch State
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const [processCounter, setProcessCounter] = useState(0); // Trigger to force queue re-evaluation

  // Drive State
  const [driveLoadingState, setDriveLoadingState] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    const savedSettings = localStorage.getItem('whisper_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // Ensure customVocabulary exists for older saves
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, customVocabulary: parsed.customVocabulary || [] });
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
    setMode(AppMode.UPLOAD); 
  };

  const handleRecordingComplete = (blob: Blob) => {
    const file = new File([blob], `Recording_${new Date().toLocaleTimeString()}.webm`, { type: 'audio/webm' });
    handleFilesSelect([file]);
  };

  const handleDriveSelect = async () => {
      if (!settings.googleClientId || !settings.googleApiKey) {
          alert("Please configure Google Drive Client ID and API Key in Settings first.");
          setIsSettingsOpen(true);
          return;
      }

      setDriveLoadingState("Connecting...");
      try {
          const files = await openDrivePicker(
            settings.googleClientId, 
            settings.googleApiKey,
            (msg) => setDriveLoadingState(msg)
          );
          
          if (files.length > 0) {
              setDriveLoadingState("Finalizing...");
              handleFilesSelect(files);
          }
      } catch (e: any) {
          console.error("Drive Selection Error", e);
          alert(`Drive Error: ${e.message}`);
      } finally {
          setDriveLoadingState(null);
      }
  };

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // --- PROCESS LOOP (Watched via useEffect) ---
  useEffect(() => {
    const processNext = async () => {
        if (isProcessingRef.current) return;

        const nextItem = queue.find(i => i.status === 'QUEUED');
        if (!nextItem) return;

        isProcessingRef.current = true;
        const itemId = nextItem.id;

        try {
            // 1. OPTIMIZE / CONVERT
            // Gemini natively supports Video, so we SKIP the slow audio stripping process.
            const skipConversion = settings.provider === TranscriptionProvider.GEMINI;
            
            updateItem(itemId, { 
                status: 'PROCESSING', 
                stage: skipConversion ? 'Uploading Evidence...' : 'Optimizing Audio...', 
                progress: 5 
            });
            
            const fileToProcess = await processMediaFile(nextItem.file, skipConversion);
            
            // 2. TRANSCRIBE
            updateItem(itemId, { stage: 'Processing Evidence...', progress: 15 });
            
            // Result is now an object, not a string
            const result = await transcribeAudio(
                fileToProcess,
                '',
                settings,
                (pct) => {
                    const mappedProgress = 15 + Math.round(pct * 0.75);
                    updateItem(itemId, { 
                        stage: pct === 100 ? 'Analyzing & Transcribing...' : `Uploading (${pct}%)`, 
                        progress: mappedProgress 
                    });
                }
            );

            updateItem(itemId, { status: 'COMPLETED', progress: 100, result: result });

            // 3. AUTO-SAVE TO DRIVE
            if (settings.autoDriveUpload && settings.googleClientId) {
                 try {
                    // Format transcript with speakers and timestamps for Drive upload
                    const formattedTranscript = result.segments && result.segments.length > 0
                        ? formatTranscriptWithSpeakers(result.segments)
                        : result.text;

                    // Upload Transcript
                    await uploadToDrive(
                        settings.googleClientId,
                        "GeminiWhisper",
                        `Transcript_${nextItem.file.name}.txt`,
                        formattedTranscript,
                        "text/plain"
                    );
                    
                    // Upload Original Evidence
                    await uploadToDrive(
                        settings.googleClientId,
                        "GeminiWhisper",
                        nextItem.file.name, 
                        nextItem.file,      
                        nextItem.file.type
                    );
                 } catch (driveErr) {
                     console.error("Auto-save failed", driveErr);
                 }
            }

        } catch (error: any) {
            console.error(`Error processing file ${nextItem.file.name}:`, error);
            updateItem(itemId, { status: 'ERROR', error: error.message || 'Processing Failed' });
        } finally {
            isProcessingRef.current = false;
            // Force re-evaluation of queue to process next item
            setProcessCounter(c => c + 1);
        }
    };

    processNext();
  }, [queue, settings, processCounter]);

  // --- HANDLERS ---

  const handleDownloadAll = () => {
      const completed = queue.filter(i => i.status === 'COMPLETED' && i.result);
      if (completed.length === 0) return;

      const combinedText = completed.map(i => {
          // Use formatted transcript with speakers if segments are available
          const transcriptText = i.result?.segments && i.result.segments.length > 0
              ? formatTranscriptWithSpeakers(i.result.segments)
              : i.result?.text || '';
          return `--- FILE: ${i.file.name} ---\n\n${transcriptText}\n\n`;
      }).join('\n========================================\n\n');

      downloadFile(combinedText, generateFilename('All_Transcripts', 'txt'), 'text/plain');
  };

  const resetQueue = () => {
      if (confirm("Clear all files and results?")) {
          setQueue([]);
          setViewingItemId(null);
      }
  }

  // Handle adding vocab from the result view
  const handleTeachAi = (phrase: string) => {
      const newVocab = [...settings.customVocabulary, phrase];
      handleSaveSettings({ ...settings, customVocabulary: newVocab });
  };

  const viewingItem = viewingItemId ? queue.find(i => i.id === viewingItemId) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      <Header 
        currentMode={mode} 
        setMode={(m) => {
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
        
        {viewingItem && viewingItem.result ? (
            <div className="w-full animate-in slide-in-from-right duration-300">
                <button 
                    onClick={() => setViewingItemId(null)}
                    className="mb-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={18} /> Back to Batch Queue
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 px-1">{viewingItem.file.name}</h2>
                <TranscriptionResult 
                    result={viewingItem.result} 
                    audioFile={viewingItem.file}
                    onTeachAi={handleTeachAi}
                />
            </div>
        ) : (
            <>
                {queue.length === 0 && (
                    <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
                           {mode === AppMode.UPLOAD ? 'Upload Evidence.' : 'Record Voice.'}
                        </h2>
                        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                            {mode === AppMode.UPLOAD 
                                ? "Process video and audio files instantly. Gemini Engine auto-transcribes with high fidelity."
                                : "Record proceedings directly. Audio is enhanced and transcribed in real-time."
                            }
                        </p>
                    </div>
                )}

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
                                driveLoadingState={driveLoadingState} 
                            />
                        )}
                    </div>
                )}

                {queue.length > 0 && (
                     <div className="w-full">
                        <div className="flex justify-between items-center mb-6">
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

                         <div className="mt-8 pt-8 border-t border-zinc-900">
                             <p className="text-center text-zinc-600 text-sm mb-4">Add more files</p>
                             <div className="max-w-md mx-auto opacity-50 hover:opacity-100 transition-opacity">
                                <FileUploader 
                                    onFilesSelect={handleFilesSelect}
                                    onDriveSelect={handleDriveSelect}
                                    driveLoadingState={driveLoadingState}
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