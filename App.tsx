// CaseBuddy Intelligence Engine
import React, { useState, useEffect, useRef } from 'react';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import TranscriptionResult from './components/TranscriptionResult';
import BatchQueue from './components/BatchQueue';
import { AppMode, TranscriptionStatus, TranscriptionProvider, TranscriptionSettings, BatchItem, GoogleUser } from './types';
import { transcribeAudio, fetchRemoteMedia } from './services/transcriptionService';
import { processMediaFile } from './utils/audioUtils';
import { downloadFile, generateFilename, formatTranscriptWithSpeakers } from './utils/fileUtils';
import { openDrivePicker, uploadToDrive } from './services/driveService';
import { initGoogleAuth, handleCredentialResponse, signOut as googleSignOut, signIn } from './services/googleAuthService';
import { 
  ArrowLeft, Settings2, Shield, Activity, HardDrive, Cpu, 
  LogOut, Key, Info, ExternalLink,
  LayoutGrid, ListTodo, Eye, EyeOff, Book, Link as LinkIcon, Play
} from 'lucide-react';

const DEFAULT_SETTINGS: TranscriptionSettings = {
  provider: TranscriptionProvider.GEMINI,
  openaiKey: '',
  assemblyAiKey: import.meta.env.VITE_ASSEMBLYAI_API_KEY || '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  googleApiKey: import.meta.env.VITE_GEMINI_API_KEY || '', 
  geminiModel: 'gemini-1.5-pro',
  caseContext: '',
  legalMode: true,
  autoDownloadAudio: false,
  autoDriveUpload: false,
  customVocabulary: [],
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'TRANSCRIPTION' | 'SETTINGS' | 'HISTORY'>('TRANSCRIPTION');
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [settings, setSettings] = useState<TranscriptionSettings>(DEFAULT_SETTINGS);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const [processCounter, setProcessCounter] = useState(0);
  const [driveLoadingState, setDriveLoadingState] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('whisper_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, customVocabulary: parsed.customVocabulary || [] });
      } catch (e) { console.error("Settings load error", e); }
    }

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

  const handleSaveSettings = (newSet: TranscriptionSettings) => {
    setSettings(newSet);
    localStorage.setItem('whisper_settings', JSON.stringify(newSet));
  };

  const handleFilesSelect = (files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file, status: 'QUEUED', stage: 'Queued', progress: 0
    }));
    setQueue(prev => [...prev, ...newItems]);
    setMode(AppMode.UPLOAD); 
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!remoteUrl) return;
      const newItem: BatchItem = {
          id: Math.random().toString(36).substring(7),
          file: { name: "Remote Media", url: remoteUrl, type: "video/mp4" },
          status: 'QUEUED', stage: 'Queued', progress: 0
      };
      setQueue(prev => [...prev, newItem]);
      setRemoteUrl('');
  };

  const handleDriveSelect = async () => {
      if (!googleUser) { alert("Sign in first."); return; }
      setDriveLoadingState("Initializing...");
      try {
          const files = await openDrivePicker(settings.googleApiKey, (msg) => setDriveLoadingState(msg));
          if (files.length > 0) handleFilesSelect(files);
      } catch (e) { alert(`Drive Error: ${e instanceof Error ? e.message : String(e)}`); } 
      finally { setDriveLoadingState(null); }
  };

  useEffect(() => {
    const processNext = async () => {
        if (isProcessingRef.current) return;
        const nextItem = queue.find(i => i.status === 'QUEUED');
        if (!nextItem) return;
        isProcessingRef.current = true;
        const itemId = nextItem.id;
        try {
            let fileToProcess: Blob;
            if ('url' in nextItem.file) {
                updateItem(itemId, { status: 'PROCESSING', stage: 'Fetching Remote Media...', progress: 5 });
                fileToProcess = await fetchRemoteMedia(nextItem.file.url);
            } else {
                fileToProcess = nextItem.file;
            }

            const skipConversion = settings.provider === TranscriptionProvider.GEMINI;
            updateItem(itemId, { status: 'PROCESSING', stage: skipConversion ? 'Analyzing Content...' : 'Scraping Audio (FFmpeg)...', progress: 10 });
            
            const processedFile = await processMediaFile(fileToProcess as any, skipConversion, (pct) => {
                if (!skipConversion) updateItem(itemId, { stage: `Scraping Audio (${pct}%)`, progress: 10 + Math.round(pct * 0.1) });
            });

            updateItem(itemId, { stage: 'AI Transcription...', progress: 20 });
            const result = await transcribeAudio(processedFile, '', settings, (pct) => {
                updateItem(itemId, { stage: pct === 100 ? 'Finalizing Intelligence...' : `Processing (${pct}%)`, progress: 20 + Math.round(pct * 0.75) });
            });
            updateItem(itemId, { status: 'COMPLETED', progress: 100, result: result });
        } catch (error) {
            updateItem(itemId, { status: 'ERROR', error: error instanceof Error ? error.message : 'Failed' });
        } finally {
            isProcessingRef.current = false;
            setProcessCounter(c => c + 1);
        }
    };
    processNext();
  }, [queue, settings, processCounter, googleUser]);

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const viewingItem = viewingItemId ? queue.find(i => i.id === viewingItemId) : null;

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden">
      <aside className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950">
        <div className="p-6">
           <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-500/30"><Activity size={22} /></div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">CaseBuddy</h1>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest leading-none text-nowrap">Intelligence Engine</p>
              </div>
           </div>

           <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 mb-6 group transition-all hover:border-zinc-700">
              {googleUser ? (
                  <div className="flex items-center gap-3">
                    <img src={googleUser.picture} className="w-10 h-10 rounded-full border border-zinc-700" alt="" />
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-bold text-white truncate">{googleUser.name}</p>
                      <button onClick={() => { googleSignOut(); setGoogleUser(null); }} className="text-[10px] text-zinc-500 hover:text-red-400 font-bold uppercase mt-0.5">DISCONNECT</button>
                    </div>
                  </div>
              ) : (
                  <button onClick={() => signIn()} className="w-full py-2 bg-white text-black text-xs font-black rounded-lg hover:bg-zinc-200 transition-all uppercase">SIGN IN WITH GOOGLE</button>
              )}
           </div>

           <nav className="space-y-1">
              {[
                { id: 'TRANSCRIPTION', icon: LayoutGrid, label: 'Workbench' },
                { id: 'HISTORY', icon: ListTodo, label: 'Batch Queue' },
                { id: 'SETTINGS', icon: Settings2, label: 'Engine Config' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-zinc-800/50 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={18} />
                    <span className="text-sm font-bold tracking-tight">{item.label}</span>
                  </div>
                  {activeTab === item.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                </button>
              ))}
           </nav>
        </div>

        <div className="mt-auto p-6 border-t border-zinc-900 space-y-4">
           <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1">Engine Status</h3>
           <div className="space-y-3 px-1">
              <div className="flex items-center justify-between group">
                <span className="text-xs font-bold text-zinc-500">Gemini 1.5 Pro</span>
                <div className={`w-2 h-2 rounded-full ${googleUser ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`} />
              </div>
              <div className="flex items-center justify-between group">
                <span className="text-xs font-bold text-zinc-500">FFmpeg Scraper</span>
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              </div>
           </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-black relative">
        <header className="h-20 border-b border-zinc-900 flex items-center justify-between px-10 bg-black/50 backdrop-blur-xl sticky top-0 z-40">
           <h2 className="text-xl font-black text-white tracking-tight italic underline">
             {activeTab === 'TRANSCRIPTION' ? 'Advanced Workbench' : activeTab === 'SETTINGS' ? 'Engine Parameters' : 'Batch Processor'}
           </h2>
           
           <div className="flex items-center gap-4">
              {activeTab === 'TRANSCRIPTION' && !viewingItemId && (
                <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800">
                  <button onClick={() => setMode(AppMode.UPLOAD)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === AppMode.UPLOAD ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Local File</button>
                  <button onClick={() => setMode(AppMode.URL)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === AppMode.URL ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Remote Link</button>
                  <button onClick={() => setMode(AppMode.RECORD)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === AppMode.RECORD ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Live Record</button>
                </div>
              )}
              {viewingItemId && <button onClick={() => setViewingItemId(null)} className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all text-xs font-bold flex items-center gap-2 uppercase"><ArrowLeft size={14} /> Back</button>}
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          {activeTab === 'TRANSCRIPTION' && (
            <div className="max-w-4xl mx-auto w-full">
              {viewingItem && viewingItem.result ? (
                  <TranscriptionResult result={viewingItem.result} audioFile={viewingItem.file as any} />
              ) : queue.length > 0 && !viewingItemId ? (
                  <BatchQueue queue={queue} onViewResult={(item) => setViewingItemId(item.id)} onDownloadAll={() => {}} />
              ) : (
                  <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                    <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 mb-8"><Cpu size={32} /></div>
                    <h2 className="text-3xl font-black text-white mb-4 tracking-tighter">Ready for Analysis.</h2>
                    
                    <div className="w-full max-w-xl">
                       {mode === AppMode.URL ? (
                          <form onSubmit={handleUrlSubmit} className="space-y-4 animate-in fade-in duration-500">
                             <div className="relative">
                                <LinkIcon size={18} className="absolute left-4 top-4 text-zinc-500" />
                                <input 
                                  type="url" 
                                  placeholder="Paste YouTube or Media URL..."
                                  value={remoteUrl}
                                  onChange={(e) => setRemoteUrl(e.target.value)}
                                  className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all shadow-2xl"
                                />
                             </div>
                             <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 uppercase tracking-widest"><Play size={18} /> Fetch & Process</button>
                          </form>
                       ) : (
                          <FileUploader onFilesSelect={handleFilesSelect} onDriveSelect={handleDriveSelect} driveLoadingState={driveLoadingState} />
                       )}
                    </div>
                  </div>
              )}
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="max-w-4xl mx-auto w-full">
               <BatchQueue queue={queue} onViewResult={(item) => { setViewingItemId(item.id); setActiveTab('TRANSCRIPTION'); }} onDownloadAll={() => {}} />
            </div>
          )}

          {activeTab === 'SETTINGS' && (
            <div className="max-w-2xl mx-auto w-full space-y-12 animate-in fade-in duration-500">
               <section className="space-y-6">
                  <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2"><Cpu size={14} className="text-indigo-500" /> Engine Selection</h3>
                  <div className="grid grid-cols-2 gap-3">
                     {[
                       { id: 'gemini-1.5-pro', label: '1.5 Pro', desc: 'Maximum Intelligence' },
                       { id: 'gemini-2.5-flash', label: '2.5 Flash', desc: 'Highest Speed' },
                     ].map(m => (
                       <button key={m.id} onClick={() => handleSaveSettings({ ...settings, geminiModel: m.id as any })} className={`p-5 rounded-3xl border transition-all text-left relative overflow-hidden ${settings.geminiModel === m.id ? 'bg-white border-white' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                          <p className={`text-sm font-black ${settings.geminiModel === m.id ? 'text-black' : 'text-white'}`}>{m.label}</p>
                          <p className={`text-[10px] font-bold mt-1 ${settings.geminiModel === m.id ? 'text-zinc-600' : 'text-zinc-500'}`}>{m.desc}</p>
                       </button>
                     ))}
                  </div>
               </section>

               <section className="space-y-6">
                  <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2"><Book size={14} className="text-indigo-500" /> Intelligence Context</h3>
                  <div className="space-y-4 p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Case Brief / Transcription Context</label>
                    <textarea value={settings.caseContext} onChange={(e) => handleSaveSettings({ ...settings, caseContext: e.target.value })} className="w-full h-32 bg-black border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all" placeholder="Provide background info to help the AI identify jargon and speaker intent..." />
                  </div>
               </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
