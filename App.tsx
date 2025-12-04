import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import TranscriptionResult from './components/TranscriptionResult';
import SettingsDialog from './components/SettingsDialog';
import { AppMode, TranscriptionStatus, TranscriptionProvider, TranscriptionSettings } from './types';
import { transcribeAudio } from './services/transcriptionService';
import { fileToBase64 } from './utils/audioUtils';
import { Loader2, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';

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
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TranscriptionSettings>(DEFAULT_SETTINGS);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Load settings from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('whisper_settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const handleSaveSettings = (newSettings: TranscriptionSettings) => {
    setSettings(newSettings);
    localStorage.setItem('whisper_settings', JSON.stringify(newSettings));
  };

  const handleFileSelect = (file: File) => {
    setActiveFile(file);
    setStatus(TranscriptionStatus.IDLE);
    setTranscription('');
    setErrorMsg('');
  };

  const handleRecordingComplete = (blob: Blob) => {
    setActiveFile(blob);
    setStatus(TranscriptionStatus.IDLE);
    setTranscription('');
    setErrorMsg('');
  };

  const handleStartTranscription = async () => {
    if (!activeFile) return;

    setStatus(TranscriptionStatus.PROCESSING);
    setErrorMsg('');

    try {
      const base64 = await fileToBase64(activeFile);
      const text = await transcribeAudio(activeFile, base64, settings);
      
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
  }

  // If mode changes, reset state
  useEffect(() => {
    reset();
  }, [mode]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      <Header 
        currentMode={mode} 
        setMode={setMode} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <main className="max-w-5xl mx-auto px-4 py-12 flex flex-col items-center">
        
        {/* Intro Text (Only when Idle and no File) */}
        {!activeFile && status === TranscriptionStatus.IDLE && (
            <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
                    Turn voice into evidence.
                </h2>
                <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                    Record proceedings, depositions, or notes. 
                    Switch between <span className="text-indigo-400 font-medium">Gemini</span>, <span className="text-indigo-400 font-medium">Whisper</span>, and <span className="text-indigo-400 font-medium">AssemblyAI</span> for maximum accuracy.
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

        {/* Action Button & Settings Preview */}
        {activeFile && status === TranscriptionStatus.IDLE && (
            <div className="mt-8 flex flex-col items-center gap-4 animate-in zoom-in fade-in duration-300">
                
                {/* Mode Indicator */}
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
                    Transcribe Audio
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        )}

        {/* Processing State */}
        {status === TranscriptionStatus.PROCESSING && (
            <div className="mt-12 flex flex-col items-center animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
                    <Loader2 size={48} className="text-indigo-500 animate-spin relative z-10" />
                </div>
                <h3 className="mt-6 text-xl font-medium text-white">Transcribing...</h3>
                <p className="text-zinc-500 mt-2">
                  Engine: <span className="text-zinc-300 font-medium">{settings.provider}</span> 
                  {settings.legalMode ? ' (Legal Mode Active)' : ''}
                </p>
                {settings.provider === TranscriptionProvider.ASSEMBLYAI && (
                    <p className="text-xs text-zinc-600 mt-2">Uploading & Polling (this may take a moment)</p>
                )}
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
                <TranscriptionResult text={transcription} />
             </div>
        )}

      </main>
    </div>
  );
};

export default App;