import React, { useState, useEffect } from 'react';
import { X, Save, Shield, Key, Cpu, Eye, EyeOff, Cloud, HardDrive, AlertTriangle, ExternalLink, Settings2, Copy, Check, Users } from 'lucide-react';
import { TranscriptionProvider, TranscriptionSettings } from '../types';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TranscriptionSettings;
  onSave: (settings: TranscriptionSettings) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = React.useState<TranscriptionSettings>(settings);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAssemblyKey, setShowAssemblyKey] = useState(false);
  const [showGoogleClientId, setShowGoogleClientId] = useState(false);
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  
  const [currentOrigin, setCurrentOrigin] = useState('');
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  // Sync when opening
  useEffect(() => {
    setLocalSettings(settings);
    if (typeof window !== 'undefined') {
        setCurrentOrigin(window.location.origin);
    }
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Sanitize inputs on save
    const sanitizedSettings = {
        ...localSettings,
        openaiKey: localSettings.openaiKey.trim(),
        assemblyAiKey: localSettings.assemblyAiKey.trim(),
        googleClientId: localSettings.googleClientId.trim(),
        googleApiKey: localSettings.googleApiKey.trim(),
    };
    onSave(sanitizedSettings);
    onClose();
  };

  const copyOrigin = () => {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings2 size={20} className="text-zinc-400" />
            Settings
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">
          
          {/* SECTION 1: PREFERENCES */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">General Preferences</h3>
            
            {/* Legal Mode Toggle */}
            <div className="flex items-start gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <Shield className="text-indigo-400 shrink-0 mt-1" size={20} />
                <div className="flex-1">
                <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-indigo-100">Legal Grade Mode</span>
                    <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full border border-zinc-600 bg-zinc-800">
                    <input
                        type="checkbox"
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                        checked={localSettings.legalMode}
                        onChange={(e) => setLocalSettings({ ...localSettings, legalMode: e.target.checked })}
                    />
                    <span
                        className={`absolute left-0 inline-block w-6 h-6 rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                        localSettings.legalMode ? 'translate-x-6 bg-indigo-500' : 'bg-zinc-400'
                        }`}
                    />
                    </div>
                </label>
                <p className="text-xs text-indigo-300/80 mt-1 leading-relaxed">
                    Verbatim transcription, speaker labels, timestamps, and error correction.
                </p>
                </div>
            </div>

            {/* Cloud / Auto-Download Toggle */}
            <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <Cloud className="text-emerald-400 shrink-0 mt-1" size={20} />
                <div className="flex-1">
                <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-emerald-100">Auto-Download Audio</span>
                    <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full border border-zinc-600 bg-zinc-800">
                    <input
                        type="checkbox"
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                        checked={localSettings.autoDownloadAudio}
                        onChange={(e) => setLocalSettings({ ...localSettings, autoDownloadAudio: e.target.checked })}
                    />
                    <span
                        className={`absolute left-0 inline-block w-6 h-6 rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                        localSettings.autoDownloadAudio ? 'translate-x-6 bg-emerald-500' : 'bg-zinc-400'
                        }`}
                    />
                    </div>
                </label>
                <p className="text-xs text-emerald-300/80 mt-1 leading-relaxed">
                    Saves recording to disk automatically after stopping.
                </p>
                </div>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* SECTION 2: GOOGLE DRIVE */}
          <div className="space-y-4">
             <div className="flex items-center gap-2">
                 <HardDrive size={18} className="text-amber-500" />
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider">Google Drive Integration</h3>
             </div>
             
             <div className="p-5 bg-zinc-800/30 rounded-xl border border-zinc-800 space-y-5">
                 
                 {/* Auto-Upload Toggle */}
                 <div className="flex items-start gap-3 pb-4 border-b border-zinc-700/50">
                     <div className="flex-1">
                         <label className="flex items-center justify-between cursor-pointer">
                             <span className="text-sm font-medium text-amber-100">Auto-Upload to Google Drive</span>
                             <div className="relative inline-block w-10 h-5 transition duration-200 ease-in-out rounded-full border border-zinc-600 bg-zinc-800">
                                 <input
                                     type="checkbox"
                                     className="absolute opacity-0 w-full h-full cursor-pointer"
                                     checked={localSettings.autoDriveUpload}
                                     onChange={(e) => setLocalSettings({ ...localSettings, autoDriveUpload: e.target.checked })}
                                 />
                                 <span
                                     className={`absolute left-0 inline-block w-5 h-5 rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                                     localSettings.autoDriveUpload ? 'translate-x-5 bg-amber-500' : 'bg-zinc-400'
                                     }`}
                                 />
                             </div>
                         </label>
                         <p className="text-xs text-zinc-400 mt-1">
                             Automatically creates a "GeminiWhisper" folder and uploads all transcripts and audio/video evidence.
                         </p>
                     </div>
                 </div>

                 {/* HELPER BOX: Origin Detection */}
                 <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                     <div className="flex items-start gap-3">
                        <div className="mt-1 p-1 bg-blue-500/20 rounded-md">
                            <Settings2 size={16} className="text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-bold text-blue-200 mb-1">Configuration Helper</h4>
                            <p className="text-xs text-blue-300/80 mb-3">
                                Paste this exact URL into your <strong>Authorized JavaScript origins</strong> in Google Cloud.
                            </p>
                            
                            <div className="flex items-center gap-2 bg-black/40 p-1.5 pr-2 rounded-lg border border-blue-500/20">
                                <code className="flex-1 font-mono text-xs text-blue-100 px-2 truncate">
                                    {currentOrigin}
                                </code>
                                <button 
                                    onClick={copyOrigin}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wide rounded transition-colors"
                                >
                                    {copiedOrigin ? <Check size={12} /> : <Copy size={12} />}
                                    {copiedOrigin ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                     </div>
                 </div>

                 {/* OAuth Client ID */}
                 <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                        OAuth 2.0 Client ID
                    </label>
                    <div className="relative">
                        <input
                            type={showGoogleClientId ? "text" : "password"}
                            placeholder="e.g. 12345...apps.googleusercontent.com"
                            value={localSettings.googleClientId || ''}
                            onChange={(e) => setLocalSettings({ ...localSettings, googleClientId: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10 font-mono"
                        />
                        <button 
                            onClick={() => setShowGoogleClientId(!showGoogleClientId)}
                            className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                            tabIndex={-1}
                        >
                            {showGoogleClientId ? <EyeOff size={14}/> : <Eye size={14}/>}
                        </button>
                    </div>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                        Google Cloud API Key <span className="text-amber-500">*</span>
                    </label>
                    <div className="relative">
                        <input
                            type={showGoogleApiKey ? "text" : "password"}
                            placeholder="e.g. AIzaSy..."
                            value={localSettings.googleApiKey || ''}
                            onChange={(e) => setLocalSettings({ ...localSettings, googleApiKey: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10 font-mono"
                        />
                        <button 
                            onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
                            className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                            tabIndex={-1}
                        >
                            {showGoogleApiKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                        </button>
                    </div>
                </div>

                 {/* Setup Checklist (Collapsible or Small) */}
                  <div className="mt-4 border-t border-zinc-700/50 pt-4">
                      <p className="text-xs font-bold text-zinc-400 mb-2">Google Cloud Setup Checklist</p>
                      <ul className="space-y-3">
                          {[
                              "Create Project & Enable 'Google Drive API' + 'Picker API'.",
                              "Create 'OAuth Client ID' (Web App) -> Add URL above to 'Authorized Origins'.",
                              "Create 'API Key' -> Paste above.",
                              "IMPORTANT: Go to 'OAuth Consent Screen' -> 'Test Users'.",
                              "Click '+ Add Users' and enter YOUR email address.",
                              "Save and retry."
                          ].map((step, i) => (
                              <li key={i} className={`flex items-start gap-3 text-[11px] ${i >= 3 ? 'text-amber-400 font-medium' : 'text-zinc-500'}`}>
                                  <div className={`mt-0.5 min-w-[16px] h-4 rounded-full border flex items-center justify-center text-[9px] font-mono ${i >= 3 ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' : 'border-zinc-700 bg-zinc-800 text-zinc-600'}`}>
                                      {i + 1}
                                  </div>
                                  <span className="break-words leading-tight">{step}</span>
                              </li>
                          ))}
                      </ul>
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 text-xs text-indigo-400 hover:text-indigo-300">
                          <ExternalLink size={12} /> Open Google Cloud Console
                      </a>
                  </div>
             </div>
          </div>
            
          <hr className="border-zinc-800" />

          {/* SECTION 3: TRANSCRIPTION ENGINE */}
          <div className="space-y-4">
             <div className="flex items-center gap-2">
                 <Cpu size={18} className="text-indigo-500" />
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider">Transcription Engine</h3>
             </div>
             
             <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-800">
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                        { id: TranscriptionProvider.GEMINI, label: 'Gemini (Default)' },
                        { id: TranscriptionProvider.OPENAI, label: 'Whisper' },
                        { id: TranscriptionProvider.ASSEMBLYAI, label: 'AssemblyAI' },
                    ].map((provider) => (
                        <button
                        key={provider.id}
                        onClick={() => setLocalSettings({ ...localSettings, provider: provider.id as TranscriptionProvider })}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                            localSettings.provider === provider.id
                            ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:bg-zinc-800'
                        }`}
                        >
                        {provider.label}
                        </button>
                    ))}
                </div>

                {/* Third Party API Keys */}
                {localSettings.provider !== TranscriptionProvider.GEMINI && (
                    <div className="space-y-4 pt-4 border-t border-zinc-700/50">
                        {localSettings.provider === TranscriptionProvider.OPENAI && (
                        <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                            <Key size={12} /> OpenAI API Key
                            </label>
                            <div className="relative">
                            <input
                                type={showOpenAIKey ? "text" : "password"}
                                placeholder="sk-..."
                                value={localSettings.openaiKey}
                                onChange={(e) => setLocalSettings({ ...localSettings, openaiKey: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10"
                            />
                            <button 
                                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                                className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                                tabIndex={-1}
                            >
                                {showOpenAIKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                            </button>
                            </div>
                        </div>
                        )}

                        {localSettings.provider === TranscriptionProvider.ASSEMBLYAI && (
                        <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                            <Key size={12} /> AssemblyAI API Key
                            </label>
                            <div className="relative">
                            <input
                                type={showAssemblyKey ? "text" : "password"}
                                placeholder="Enter API Key"
                                value={localSettings.assemblyAiKey}
                                onChange={(e) => setLocalSettings({ ...localSettings, assemblyAiKey: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10"
                            />
                            <button 
                                onClick={() => setShowAssemblyKey(!showAssemblyKey)}
                                className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                                tabIndex={-1}
                            >
                                {showAssemblyKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                            </button>
                            </div>
                        </div>
                        )}
                    </div>
                )}
             </div>
          </div>

        </div>

        <div className="p-6 pt-0 mt-auto border-t border-zinc-800/50 pt-4 bg-zinc-900/50">
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"
          >
            <Save size={18} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;