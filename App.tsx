import React, { useState, useEffect, useRef } from 'react';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import TranscriptionResult from './components/TranscriptionResult';
import BatchQueue from './components/BatchQueue';
import { AppMode, TranscriptionStatus, TranscriptionProvider, TranscriptionSettings, BatchItem, GoogleUser } from './types';
import { transcribeAudio } from './services/transcriptionService';
import { processMediaFile } from './utils/audioUtils';
import { downloadFile, generateFilename, formatTranscriptWithSpeakers } from './utils/fileUtils';
import { openDrivePicker, uploadToDrive } from './services/driveService';
import { initGoogleAuth, handleCredentialResponse, signOut as googleSignOut, signIn } from './services/googleAuthService';
import { 
  ArrowLeft, Settings2, Shield, Activity, HardDrive, Cpu, 
  LogOut, Key, Info, ExternalLink,
  LayoutGrid, ListTodo, Eye, EyeOff, Book
} from 'lucide-react';
import Header from './components/Header'; // Assuming we kept a version or integrated it

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
  const [showKeys, setShowKeys] = useState({ openai: false, assembly: false });
  
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

  const handleSignOut = () => { googleSignOut(); setGoogleUser(null); };
  const handleSignIn = () => signIn();

  const handleFilesSelect = (files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file, status: 'QUEUED', stage: 'Queued', progress: 0
    }));
    setQueue(prev => [...prev, ...newItems]);
    setMode(AppMode.UPLOAD); 
  };

  const handleDriveSelect = async () => {
      if (!googleUser) { alert("Please sign in with Google first."); return; }
      setDriveLoadingState("Initializing Picker...");
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
            if (settings.provider === TranscriptionProvider.GEMINI && !googleUser) throw new Error("Google sign-in required for Gemini.");
            const skipConversion = settings.provider === TranscriptionProvider.GEMINI;
            updateItem(itemId, { status: 'PROCESSING', stage: skipConversion ? 'Uploading...' : 'FFmpeg Extraction...', progress: 5 });
            const processedFile = await processMediaFile(nextItem.file, skipConversion, (pct) => {
                if (!skipConversion) updateItem(itemId, { stage: `FFmpeg (${pct}%)`, progress: 5 + Math.round(pct * 0.1) });
            });
            updateItem(itemId, { stage: 'AI Transcription...', progress: 15 });
            const result = await transcribeAudio(processedFile, '', settings, (pct) => {
                updateItem(itemId, { stage: pct === 100 ? 'Analyzing...' : `Processing (${pct}%)`, progress: 15 + Math.round(pct * 0.75) });
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

  const viewingItem = viewingItemId ? queue.find(i => i.id === viewingItemId) : null;

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden">
      <aside className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950">
        <div className="p-6">
           <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-500/30">
                <Activity size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">CaseBuddy</h1>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest leading-none">Intelligence Engine</p>
              </div>
           </div>

           <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 mb-6 group transition-all hover:border-zinc-700">
              {googleUser ? (
                  <div className="flex items-center gap-3">
                    <img src={googleUser.picture} className="w-10 h-10 rounded-full border border-zinc-700" alt="" />
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-bold text-white truncate">{googleUser.name}</p>
                      <button onClick={handleSignOut} className="text-[10px] text-zinc-500 hover:text-red-400 font-bold flex items-center gap-1 mt-0.5 uppercase">DISCONNECT</button>
                    </div>
                  </div>
              ) : (
                  <button onClick={handleSignIn} className="w-full py-2 bg-white text-black text-xs font-black rounded-lg hover:bg-zinc-200 transition-all">SIGN IN WITH GOOGLE</button>
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
                <span className="text-xs font-bold text-zinc-500">Gemini Pro</span>
                <div className={`w-2 h-2 rounded-full ${googleUser ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
              </div>
              <div className="flex items-center justify-between group">
                <span className="text-xs font-bold text-zinc-500">Whisper</span>
                <div className={`w-2 h-2 rounded-full ${settings.openaiKey ? 'bg-green-500' : 'bg-zinc-700'}`} />
              </div>
              <div className="flex items-center justify-between group">
                <span className="text-xs font-bold text-zinc-500">AssemblyAI</span>
                <div className={`w-2 h-2 rounded-full ${settings.assemblyAiKey ? 'bg-green-500' : 'bg-zinc-700'}`} />
              </div>
           </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-black relative">
        <header className="h-20 border-b border-zinc-900 flex items-center justify-between px-10 bg-black/50 backdrop-blur-xl sticky top-0 z-40">
           <div>
              <h2 className="text-xl font-black text-white tracking-tight">
                {activeTab === 'TRANSCRIPTION' ? 'Workbench' : activeTab === 'SETTINGS' ? 'Configuration' : 'Batch Processor'}
              </h2>
           </div>
           
           <div className="flex items-center gap-4">
              {activeTab === 'TRANSCRIPTION' && !viewingItemId && (
                <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800">
                  <button onClick={() => setMode(AppMode.UPLOAD)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === AppMode.UPLOAD ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Upload</button>
                  <button onClick={() => setMode(AppMode.RECORD)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === AppMode.RECORD ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Record</button>
                </div>
              )}
              {viewingItemId && <button onClick={() => setViewingItemId(null)} className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all text-xs font-bold">Back to Workbench</button>}
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          {activeTab === 'TRANSCRIPTION' && (
            <div className="max-w-4xl mx-auto w-full">
              {viewingItem && viewingItem.result ? (
                  <TranscriptionResult result={viewingItem.result} audioFile={viewingItem.file} onTeachAi={(p) => handleSaveSettings({ ...settings, customVocabulary: [...settings.customVocabulary, p]})} />
              ) : queue.length > 0 && !viewingItemId ? (
                  <BatchQueue queue={queue} onViewResult={(item) => setViewingItemId(item.id)} onDownloadAll={() => {}} />
              ) : (
                  <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                    <h2 className="text-3xl font-black text-white mb-4 tracking-tighter italic underline">Scrape Audio from Video</h2>
                    <p className="text-zinc-500 max-w-lg mb-10 font-medium leading-relaxed">High-performance FFmpeg extraction. Select an engine and context for maximum accuracy.</p>
                    <div className="w-full max-w-xl"><FileUploader onFilesSelect={handleFilesSelect} onDriveSelect={handleDriveSelect} driveLoadingState={driveLoadingState} /></div>
                  </div>
              )}
            </div>
          )}

          {activeTab === 'SETTINGS' && (
            <div className="max-w-2xl mx-auto w-full space-y-12 animate-in fade-in duration-500">
               <section className="space-y-6">
                  <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2"><Cpu size={14} className="text-indigo-500" /> Intelligence Engine</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: TranscriptionProvider.GEMINI, label: 'Gemini', note: 'Native Video' },
                      { id: TranscriptionProvider.OPENAI, label: 'Whisper', note: 'General Audio' },
                      { id: TranscriptionProvider.ASSEMBLYAI, label: 'AssemblyAI', note: 'High Stakes' },
                    ].map(p => (
                      <button key={p.id} onClick={() => handleSaveSettings({ ...settings, provider: p.id })} className={`p-4 rounded-2xl border transition-all text-left ${settings.provider === p.id ? 'bg-white border-white' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                        <p className={`text-sm font-black ${settings.provider === p.id ? 'text-black' : 'text-white'}`}>{p.label}</p>
                        <p className={`text-[10px] font-bold mt-1 ${settings.provider === p.id ? 'text-zinc-600' : 'text-zinc-500'}`}>{p.note}</p>
                      </button>
                    ))}
                  </div>

                  {settings.provider === TranscriptionProvider.GEMINI && (
                     <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Gemini Model (Accuracy Tier)</label>
                        <div className="grid grid-cols-2 gap-2">
                           {[
                             { id: 'gemini-1.5-pro', label: '1.5 Pro', desc: 'Max Accuracy (Legal/Complex)' },
                             { id: 'gemini-2.5-flash', label: '2.5 Flash', desc: 'Fast & Efficient' },
                           ].map(m => (
                             <button key={m.id} onClick={() => handleSaveSettings({ ...settings, geminiModel: m.id as any })} className={`p-3 rounded-xl border text-left transition-all ${settings.geminiModel === m.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                                <p className="text-xs font-black">{m.label}</p>
                                <p className="text-[9px] font-bold opacity-70">{m.desc}</p>
                             </button>
                           ))}
                        </div>
                     </div>
                  )}
               </section>

               <section className="space-y-6">
                  <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2"><Book size={14} className="text-indigo-500" /> Accuracy Context</h3>
                  <div className="space-y-4 p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Case Context / Brief</label>
                      <textarea 
                        value={settings.caseContext}
                        onChange={(e) => handleSaveSettings({ ...settings, caseContext: e.target.value })}
                        className="w-full h-24 bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                        placeholder="e.g. This is a deposition for a medical malpractice case regarding a knee surgery performed by Dr. Smith..."
                      />
                      <p className="text-[9px] text-zinc-600 italic px-1">Describing the scene helps the AI identify specialized jargon and speaker intent.</p>
                    </div>
                  </div>
               </section>

               <section className="space-y-6">
                  <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2"><Key size={14} className="text-indigo-500" /> API Access</h3>
                  <div className="space-y-4 p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">OpenAI Key</label>
                      <div className="relative">
                        <input type={showKeys.openai ? 'text' : 'password'} value={settings.openaiKey} onChange={(e) => handleSaveSettings({ ...settings, openaiKey: e.target.value })} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none" placeholder="sk-..." />
                        <button onClick={() => setShowKeys({...showKeys, openai: !showKeys.openai})} className="absolute right-3 top-3.5 text-zinc-600 hover:text-white">{showKeys.openai ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">AssemblyAI Key</label>
                      <div className="relative">
                        <input type={showKeys.assembly ? 'text' : 'password'} value={settings.assemblyAiKey} onChange={(e) => handleSaveSettings({ ...settings, assemblyAiKey: e.target.value })} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none" placeholder="Key..." />
                        <button onClick={() => setShowKeys({...showKeys, assembly: !showKeys.assembly})} className="absolute right-3 top-3.5 text-zinc-600 hover:text-white">{showKeys.assembly ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
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
