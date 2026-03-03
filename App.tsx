import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import TranscriptionResult from './components/TranscriptionResult';
import BatchQueue from './components/BatchQueue';
import SettingsDialog from './components/SettingsDialog';
import { AppMode, TranscriptionStatus, TranscriptionProvider, TranscriptionSettings, BatchItem, GoogleUser } from './types';
import { transcribeAudio } from './services/transcriptionService';
import { processMediaFile } from './utils/audioUtils';
import { downloadFile, generateFilename, formatTranscriptWithSpeakers } from './utils/fileUtils';
import { openDrivePicker, uploadToDrive } from './services/driveService';
import { initGoogleAuth, handleCredentialResponse, signOut as googleSignOut, signIn } from './services/googleAuthService';
import { ArrowLeft } from 'lucide-react';

const DEFAULT_SETTINGS: TranscriptionSettings = {
  provider: TranscriptionProvider.GEMINI,
  openaiKey: '',
  assemblyAiKey: import.meta.env.VITE_ASSEMBLYAI_API_KEY || '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  googleApiKey: import.meta.env.VITE_GEMINI_API_KEY || '', 
  legalMode: false,
  autoDownloadAudio: false,
  autoDriveUpload: false,
  customVocabulary: [],
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TranscriptionSettings>(DEFAULT_SETTINGS);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const [processCounter, setProcessCounter] = useState(0);
  const [driveLoadingState, setDriveLoadingState] = useState<string | null>(null);

  useEffect(() => {
    const savedSettings = localStorage.getItem('whisper_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, customVocabulary: parsed.customVocabulary || [] });
      } catch (e) { console.error("Settings load error", e); }
    }

    // Google Auth Init
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    script.onload = () => {
      initGoogleAuth(setGoogleUser);
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: settings.googleClientId || DEFAULT_SETTINGS.googleClientId,
          callback: handleCredentialResponse
        });
        const btnContainer = document.getElementById("google-signin-button");
        if (btnContainer) {
            window.google.accounts.id.renderButton(btnContainer, { theme: "outline", size: "large" });
        }
      }
    };
    document.body.appendChild(script);

    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true; gapiScript.defer = true;
    gapiScript.onload = () => {
      window.gapi.load('picker', () => console.log("Picker loaded"));
    }
    document.body.appendChild(gapiScript);
  }, []);

  const handleSaveSettings = (newSettings: TranscriptionSettings) => {
    setSettings(newSettings);
    localStorage.setItem('whisper_settings', JSON.stringify(newSettings));
  };
  
  const handleSignOut = () => { googleSignOut(); setGoogleUser(null); };
  const handleSignIn = () => signIn();

  const handleFilesSelect = (files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file, status: 'QUEUED', stage: 'Pending', progress: 0
    }));
    setQueue(prev => [...prev, ...newItems]);
    setMode(AppMode.UPLOAD); 
  };

  const handleRecordingComplete = (blob: Blob) => {
    const file = new File([blob], `Recording_${new Date().toLocaleTimeString()}.webm`, { type: 'audio/webm' });
    handleFilesSelect([file]);
  };

  const handleDriveSelect = async () => {
      if (!googleUser) { alert("Please sign in with Google first."); return; }
      if (!settings.googleApiKey) { alert("Configure Google API Key in Settings."); setIsSettingsOpen(true); return; }
      setDriveLoadingState("Connecting...");
      try {
          const files = await openDrivePicker(settings.googleApiKey, (msg) => setDriveLoadingState(msg));
          if (files.length > 0) handleFilesSelect(files);
      } catch (e) { alert(`Drive Error: ${e instanceof Error ? e.message : String(e)}`); } 
      finally { setDriveLoadingState(null); }
  };

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  useEffect(() => {
    const processNext = async () => {
        if (isProcessingRef.current) return;
        const nextItem = queue.find(i => i.status === 'QUEUED');
        if (!nextItem) return;
        isProcessingRef.current = true;
        const itemId = nextItem.id;
        try {
            if (settings.provider === TranscriptionProvider.GEMINI && !googleUser) {
              throw new Error("Sign in with Google to use Gemini.");
            }
            const skipConversion = settings.provider === TranscriptionProvider.GEMINI;
            updateItem(itemId, { status: 'PROCESSING', stage: skipConversion ? 'Uploading...' : 'Optimizing...', progress: 5 });
            const fileToProcess = await processMediaFile(nextItem.file, skipConversion);
            updateItem(itemId, { stage: 'Transcribing...', progress: 15 });
            const result = await transcribeAudio(fileToProcess, '', settings, (pct) => {
                updateItem(itemId, { stage: pct === 100 ? 'Analyzing...' : `Uploading (${pct}%)`, progress: 15 + Math.round(pct * 0.75) });
            });
            updateItem(itemId, { status: 'COMPLETED', progress: 100, result: result });
            if (settings.autoDriveUpload && googleUser) {
                 try {
                    const formatted = result.segments ? formatTranscriptWithSpeakers(result.segments) : result.text;
                    await uploadToDrive("CaseBuddyWhisper", `Transcript_${nextItem.file.name}.txt`, formatted, "text/plain");
                    await uploadToDrive("CaseBuddyWhisper", nextItem.file.name, nextItem.file, nextItem.file.type);
                 } catch (e) { console.error("Drive auto-save failed", e); }
            }
        } catch (error) {
            updateItem(itemId, { status: 'ERROR', error: error instanceof Error ? error.message : 'Failed' });
        } finally {
            isProcessingRef.current = false;
            setProcessCounter(c => c + 1);
        }
    };
    processNext();
  }, [queue, settings, processCounter, googleUser]);

  const handleDownloadAll = () => {
      const completed = queue.filter(i => i.status === 'COMPLETED' && i.result);
      if (completed.length === 0) return;
      const combined = completed.map(i => `--- FILE: ${i.file.name} ---\n\n${i.result?.segments ? formatTranscriptWithSpeakers(i.result.segments) : i.result?.text}\n\n`).join('\n===\n\n');
      downloadFile(combined, generateFilename('All_Transcripts', 'txt'), 'text/plain');
  };

  const viewingItem = viewingItemId ? queue.find(i => i.id === viewingItemId) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      <Header 
        currentMode={mode} setMode={(m) => { setMode(m); setViewingItemId(null); }} 
        onOpenSettings={() => setIsSettingsOpen(true)}
        googleUser={googleUser} onSignOut={handleSignOut} onSignIn={handleSignIn}
      />
      <SettingsDialog 
        isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}
        settings={settings} onSave={handleSaveSettings}
      />
      <main className="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center">
        {viewingItem && viewingItem.result ? (
            <div className="w-full animate-in slide-in-from-right duration-300">
                <button onClick={() => setViewingItemId(null)} className="mb-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft size={18} /> Back to Batch Queue
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 px-1">{viewingItem.file.name}</h2>
                <TranscriptionResult result={viewingItem.result} audioFile={viewingItem.file} onTeachAi={(p) => handleSaveSettings({ ...settings, customVocabulary: [...settings.customVocabulary, p]})} />
            </div>
        ) : (
            <>
                {queue.length === 0 && (
                    <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
                           {mode === AppMode.UPLOAD ? 'Upload Evidence.' : 'Record Voice.'}
                        </h2>
                        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                            {mode === AppMode.UPLOAD ? "Process video and audio files instantly. Gemini Engine auto-transcribes." : "Record proceedings directly. Audio is enhanced in real-time." }
                        </p>
                    </div>
                )}
                {queue.length === 0 && (
                    <div className="w-full">
                        {mode === AppMode.RECORD ? <AudioRecorder onRecordingComplete={handleRecordingComplete} status={TranscriptionStatus.IDLE} autoDownload={settings.autoDownloadAudio} /> : <FileUploader onFilesSelect={handleFilesSelect} onDriveSelect={handleDriveSelect} driveLoadingState={driveLoadingState} /> }
                    </div>
                )}
                {queue.length > 0 && (
                     <div className="w-full">
                        <div className="flex justify-between items-center mb-6">
                             {mode === AppMode.UPLOAD && <button onClick={() => { if (confirm("Clear queue?")) { setQueue([]); setViewingItemId(null); } }} className="text-sm text-zinc-500 hover:text-red-400 px-3 py-2">Clear Queue</button>}
                        </div>
                        <BatchQueue queue={queue} onViewResult={(item) => setViewingItemId(item.id)} onDownloadAll={handleDownloadAll} />
                         <div className="mt-8 pt-8 border-t border-zinc-900">
                             <p className="text-center text-zinc-600 text-sm mb-4">Add more files</p>
                             <div className="max-w-md mx-auto opacity-50 hover:opacity-100 transition-opacity">
                                <FileUploader onFilesSelect={handleFilesSelect} onDriveSelect={handleDriveSelect} driveLoadingState={driveLoadingState} />
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
