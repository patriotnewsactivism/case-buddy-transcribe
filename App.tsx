import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import TranscriptionResult from './components/TranscriptionResult';
import SettingsDialog from './components/SettingsDialog';
import { AppMode, TranscriptionStatus, TranscriptionProvider, TranscriptionSettings } from './types';
import { transcribeAudio } from './services/transcriptionService';
import { fileToBase64, processMediaFile } from './utils/audioUtils';
import { Loader2, ArrowRight, ShieldCheck, AlertTriangle, FileAudio } from 'lucide-react';

const DEFAULT_SETTINGS: TranscriptionSettings = {
  provider: TranscriptionProvider.GEMINI,
  openaiKey: '',
  assemblyAiKey: '',
  legalMode: false,
  autoDownloadAudio: false,
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.RECORD);
  const [status, setStatus] = useState<TranscriptionStatus>(TranscriptionStatus.IDLE);
  const [transcription, setTranscription] = useState<string>('');
  const [activeFile, setActiveFile] = useState<File | Blob | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TranscriptionSettings>(DEFAULT_SETTINGS);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Load settings and Restore Session on mount
  useEffect(() => {
    // 1. Settings
    const savedSettings = localStorage.getItem('whisper_settings');
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }

    // 2. Session Recovery
    const savedSession = localStorage.getItem('whisper_current_session');
    if (savedSession) {
      try {
        const data = JSON.parse(savedSession);
        if (data.text && data.text.length > 0) {
          setTranscription(data.text);
          setStatus(TranscriptionStatus.COMPLETED);
        }
      } catch (e) {
        console.error("Failed to restore session", e);
      }
    }
  }, []);

  const handleSaveSettings = (newSettings: TranscriptionSettings) => {
    setSettings(newSettings);
    localStorage.setItem('whisper_settings', JSON.stringify(newSettings));
  };

  // Persist Session when it changes
  useEffect(() => {
    if (status === TranscriptionStatus.COMPLETED && transcription) {
      localStorage.setItem('whisper_current_session', JSON.stringify({
        text: transcription,
        date: new Date().toISOString()
      }));
    }
  }, [status, transcription]);

  const handleFileSelect = (file: File) => {
    setActiveFile(file);
    setStatus(TranscriptionStatus.IDLE);
    setTranscription('');
    setErrorMsg('');
    setUploadProgress(0);
  };

  const handleRecordingComplete = (blob: Blob) => {
    setActiveFile(blob);
    setStatus(TranscriptionStatus.IDLE);
    setTranscription('');
    setErrorMsg('');
    setUploadProgress(0);
  };

  const handleStartTranscription = async () => {
    if (!activeFile) return;

    setStatus(TranscriptionStatus.PROCESSING);
    setErrorMsg('');
    setProcessingStatus('Initializing...');
    setUploadProgress(0);

    try {
      // 1. Pre-process media (Extract audio from video, downsample)
      setProcessingStatus('Optimizing Media (Extracting Audio)...');
      
      let fileToUpload: File | Blob = activeFile;
      if (activeFile instanceof File) {
         fileToUpload = await processMediaFile(activeFile);
      }
      
      setProcessingStatus('Uploading & Transcribing...');
      
      // 2. Transcribe with Progress Callback
      const text = await transcribeAudio(
        fileToUpload, 
        '', 
        settings, 
        (progress) => {
            setUploadProgress(progress);
            if (progress === 100) {
                setProcessingStatus('Analyzing & Transcribing...');
            } else {
                setProcessingStatus(`Uploading Evidence (${progress}%)...`);
            }
        }
      );
      
      setTranscription(text);
      setStatus(TranscriptionStatus.COMPLETED);
    } catch (error: any) {
      console.error(error);
      setStatus(TranscriptionStatus.ERROR);
      setErrorMsg(error.message || "An unknown error occurred");
    }
  };

  const reset = () => {
      setActiveFile(null);
      setTranscription('');
      setStatus(TranscriptionStatus.IDLE);
      setErrorMsg('');
      setUploadProgress(0);
      localStorage.removeItem('whisper_current_session');
  }

  useEffect(() => {
    if (status !== TranscriptionStatus.COMPLETED) {
        reset();
    }
  }, [mode]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      <Header 
        currentMode={mode} 
        setMode={(m) => {
            if (status === TranscriptionStatus.COMPLETED) reset();
            setMode(m);
        }} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <main className="max-w-5xl mx-auto px-4 py-12 flex flex-col items-center">
        
        {/* Intro Text */}
        {!activeFile && status === TranscriptionStatus.IDLE && (
            <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
                    Turn voice into evidence.
                </h2>
                <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                    Record proceedings or upload large video/audio files. 
                    <span className="block mt-2 text-sm text-zinc-500">
                        Smart Engine automatically extracts audio from video for faster processing.
                    </span>
                </p>
            </div>
        )}

        {/* Input Section */}
        <div className={`w-full transition-all duration-500 ${status === TranscriptionStatus.COMPLETED ? 'hidden' : 'block'}`}>
            {mode === AppMode.RECORD ? (
              <AudioRecorder 
                onRecordingComplete={handleRecordingComplete} 
                status={status} 
                autoDownload={settings.autoDownloadAudio}
              />
            ) : (
              <FileUploader onFileSelect={handleFileSelect} />
            )}
        </div>

        {/* Action Button */}
        {activeFile && status === TranscriptionStatus.IDLE && (
            <div className="mt-8 flex flex-col items-center gap-4 animate-in zoom-in fade-in duration-300">
                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-400">
                    <div className={`w-2 h-2 rounded-full ${settings.provider === TranscriptionProvider.GEMINI ? 'bg-blue-500' : settings.provider === TranscriptionProvider.OPENAI ? 'bg-green-500' : 'bg-purple-500'}`}></div>
                    Using: <span className="font-medium text-zinc-200">{settings.provider}</span>
                    {settings.legalMode && (
                        <>
                            <span className="text-zinc-700">|</span>
                            <ShieldCheck size={12} className="text-indigo-400" />
                            <span className="text-indigo-400 font-medium">Legal Mode</span>
                        </>
                    )}
                </div>

                <button
                    onClick={handleStartTranscription}
                    className="group flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full text-lg font-semibold hover:bg-zinc-200 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.4)]"
                >
                    Start Processing
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        )}

        {/* Processing State */}
        {status === TranscriptionStatus.PROCESSING && (
            <div className="mt-12 flex flex-col items-center animate-in fade-in duration-500 w-full max-w-md">
                <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
                    <Loader2 size={48} className="text-indigo-500 animate-spin relative z-10" />
                </div>
                <h3 className="mt-6 text-xl font-medium text-white">
                    {processingStatus || 'Processing...'}
                </h3>
                
                {/* Upload Progress Bar */}
                {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="w-full mt-4 space-y-2">
                        <div className="flex justify-between text-xs text-zinc-400">
                            <span>Uploading...</span>
                            <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out" 
                                style={{ width: `${uploadProgress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                <p className="text-zinc-500 mt-4 text-sm text-center">
                   Large files are processed securely via Google Gemini. Please keep this tab open.
                </p>
            </div>
        )}

        {/* Error State */}
        {status === TranscriptionStatus.ERROR && (
             <div className="mt-8 p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-200 flex items-start gap-3 max-w-lg">
                 <AlertTriangle className="shrink-0 mt-0.5" size={20} />
                 <div>
                    <p className="font-medium">Transcription Failed</p>
                    <p className="text-sm opacity-80 mt-1">{errorMsg}</p>
                    <button onClick={reset} className="mt-3 text-sm underline hover:text-white">Try Again</button>
                 </div>
             </div>
        )}

        {/* Results Section */}
        {status === TranscriptionStatus.COMPLETED && (
             <div className="w-full mt-4">
                <div className="flex justify-between items-end mb-6">
                     <div>
                        <h2 className="text-2xl font-bold text-white">Transcription Complete</h2>
                        {settings.legalMode && (
                            <p className="text-xs text-indigo-400 mt-1 flex items-center gap-1">
                                <ShieldCheck size={12} /> Verbatim format with timestamps
                            </p>
                        )}
                     </div>
                     <button onClick={reset} className="text-sm text-zinc-500 hover:text-white transition-colors">
                        Start Over
                     </button>
                </div>
                <TranscriptionResult text={transcription} audioFile={activeFile} />
             </div>
        )}

      </main>
    </div>
  );
};

export default App;