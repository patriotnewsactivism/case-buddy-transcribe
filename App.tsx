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
import { initGoogleAuth, handleCredentialResponse, signOut as googleSignOut } from './services/googleAuthService';
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
  
  // Batch State
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const [processCounter, setProcessCounter] = useState(0);

  // Drive State
  const [driveLoadingState, setDriveLoadingState] = useState<string | null>(null);

  // Load settings and initialize Google Auth
  useEffect(() => {
    // Load saved settings from local storage
    const savedSettings = localStorage.getItem('whisper_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, customVocabulary: parsed.customVocabulary || [] });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }

    // Load Google scripts and initialize auth
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      initGoogleAuth(setGoogleUser);
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: DEFAULT_SETTINGS.googleClientId,
          callback: handleCredentialResponse
        });
        window.google.accounts.id.renderButton(
          document.getElementById("google-signin-button")!,
          { theme: "outline", size: "large" }
        );
      }
    };
    document.body.appendChild(script);

    // Also load gapi for picker
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
      window.gapi.load('picker', () => {
        console.log("GAPI picker loaded");
      });
    }
    document.body.appendChild(gapiScript);

  }, []);

  const handleSaveSettings = (newSettings: TranscriptionSettings) => {
    setSettings(newSettings);
    localStorage.setItem('whisper_settings', JSON.stringify(newSettings));
  };
  
  const handleSignOut = () => {
    googleSignOut();
    setGoogleUser(null);
  };

  // --- QUEUE MANAGEMENT (and other functions remain the same) ---
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
      if (!googleUser) {
        alert("Please sign in with Google first.");
        return;
      }
      if (!settings.googleApiKey) {
          alert("Please configure Google API Key in Settings first.");
          setIsSettingsOpen(true);
          return;
      }

      setDriveLoadingState("Connecting...");
      try {
          const files = await openDrivePicker(
            settings.googleApiKey,
            (msg) => setDriveLoadingState(msg)
          );
          
          if (files.length > 0) {
              setDriveLoadingState("Finalizing...");
              handleFilesSelect(files);
          }
      } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error("Drive Selection Error", error);
          alert(`Drive Error: ${error.message}`);
      } finally {
          setDriveLoadingState(null);
      }
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
              throw new Error("Please sign in with Google to use the Gemini engine.");
            }

            // Always extract audio from video files for better performance
            const skipConversion = false;
            
            updateItem(itemId, { 
                status: 'PROCESSING', 
                stage: nextItem.file.type.startsWith('video/') ? 'Extracting Audio...' : 'Optimizing Audio...', 
                progress: 5 
            });
            
            const fileToProcess = await processMediaFile(nextItem.file, skipConversion);
            
            updateItem(itemId, { stage: 'Processing...', progress: 15 });
            
            const result = await transcribeAudio(
                fileToProcess,
                '',
                settings,
                (pct) => {
                    const mappedProgress = 15 + Math.round(pct * 0.75);
                    updateItem(itemId, { 
                        stage: pct === 100 ? 'Transcribing...' : `Uploading (${pct}%)`, 
                        progress: mappedProgress 
                    });
                }
            );

            updateItem(itemId, { status: 'COMPLETED', progress: 100, result: result });

            if (settings.autoDriveUpload && googleUser) {
                 try {
                    const formattedTranscript = result.segments && result.segments.length > 0
                        ? formatTranscriptWithSpeakers(result.segments)
                        : result.text;

                    await uploadToDrive(
                        "CaseBuddyWhisper",
                        `Transcript_${nextItem.file.name}.txt`,
                        formattedTranscript,
                        "text/plain"
                    );
                    
                    await uploadToDrive(
                        "CaseBuddyWhisper",
                        nextItem.file.name, 
                        nextItem.file,      
                        nextItem.file.type
                    );
                 } catch (driveErr) {
                     console.error("Auto-save to Drive failed", driveErr);
                 }
            }

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`Error processing file ${nextItem.file.name}:`, err);
            updateItem(itemId, { status: 'ERROR', error: err.message || 'Processing Failed' });
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
      const combinedText = completed.map(i => {
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
        googleUser={googleUser}
        onSignOut={handleSignOut}
      />

      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
      {/* ... (rest of the JSX remains the same) */}
    </div>
  );
};

export default App;
