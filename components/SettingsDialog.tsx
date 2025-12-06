import React, { useState, useEffect } from 'react';
import { X, Save, Shield, Key, Cpu, Eye, EyeOff, Cloud, HardDrive, AlertTriangle, ExternalLink, Settings2, Copy, Check, Users, BookOpen, Trash2, Plus } from 'lucide-react';
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

  // Vocabulary State
  const [newVocabWord, setNewVocabWord] = useState('');

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

  const addVocabulary = () => {
      if (!newVocabWord.trim()) return;
      if (localSettings.customVocabulary.includes(newVocabWord.trim())) return;
      
      setLocalSettings(prev => ({
          ...prev,
          customVocabulary: [...prev.customVocabulary, newVocabWord.trim()]
      }));
      setNewVocabWord('');
  };

  const removeVocabulary = (word: string) => {
      setLocalSettings(prev => ({
          ...prev,
          customVocabulary: prev.customVocabulary.filter(w => w !== word)
      }));
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
            
            {/* Auto-Download Toggle */}
            <div className="flex items-start gap-3 p-4 bg-zinc-800/30 border border-zinc-800 rounded-xl">
                 <Cloud className="text-zinc-400 shrink-0 mt-1" size={20} />
                 <div className="flex-1">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="font-semibold text-zinc-200">Auto-Download Audio</span>
                        <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full border border-zinc-600 bg-zinc-800">
                        <input
                            type="checkbox"
                            className="absolute opacity-0 w-full h-full cursor-pointer"
                            checked={localSettings.autoDownloadAudio}
                            onChange={(e) => setLocalSettings({ ...localSettings, autoDownloadAudio: e.target.checked })}
                        />
                        <span
                            className={`absolute left-0 inline-block w-6 h-6 rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                            localSettings.autoDownloadAudio ? 'translate-x-6 bg-indigo-500' : 'bg-zinc-400'
                            }`}
                        />
                        </div>
                    </label>
                 </div>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* SECTION 2: AI LEARNING / VOCABULARY */}
          <div className="space-y-4">
              <div className="flex items-center gap-2">
                 <BookOpen size={18} className="text-amber-500" />
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Learning & Vocabulary</h3>
             </div>

             <div className="p-5 bg-zinc-800/30 rounded-xl border border-zinc-800">
                 <p className="text-sm text-zinc-400 mb-4">
                     Add specific words, names, or phrases here. The AI will prioritize these spellings in future transcriptions (e.g. correcting "Reel Estate" to "Real Estate").
                 </p>
                 
                 <div className="flex gap-2 mb-4">
                     <input 
                        type="text" 
                        value={newVocabWord}
                        onChange={(e) => setNewVocabWord(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addVocabulary()}
                        placeholder="Type phrase (e.g. 'Jane Doe', 'Real Estate')..."
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                     />
                     <button 
                        onClick={addVocabulary}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-colors"
                     >
                         <Plus size={18} />
                     </button>
                 </div>

                 <div className="flex flex-wrap gap-2">
                     {localSettings.customVocabulary.length === 0 && (
                         <span className="text-xs text-zinc-600 italic">No custom words added yet.</span>
                     )}
                     {localSettings.customVocabulary.map((word, idx) => (
                         <div key={idx} className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 px-3 py-1 rounded-full text-xs animate-in zoom-in">
                             {word}
                             <button onClick={() => removeVocabulary(word)} className="hover:text-white"><X size={12} /></button>
                         </div>
                     ))}
                 </div>
             </div>
          </div>

          <hr className="border-zinc-800" />

          {/* SECTION 3: GOOGLE DRIVE */}
          <div className="space-y-4">
             <div className="flex items-center gap-2">
                 <HardDrive size={18} className="text-blue-500" />
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider">Google Drive Integration</h3>
             </div>
             
             <div className="p-5 bg-zinc-800/30 rounded-xl border border-zinc-800 space-y-4">
                 
                 {/* Auto-Upload Toggle */}
                 <div className="flex items-start gap-3">
                     <div className="flex-1">
                         <label className="flex items-center justify-between cursor-pointer">
                             <span className="text-sm font-medium text-blue-100">Auto-Upload to Google Drive</span>
                             <div className="relative inline-block w-10 h-5 transition duration-200 ease-in-out rounded-full border border-zinc-600 bg-zinc-800">
                                 <input
                                     type="checkbox"
                                     className="absolute opacity-0 w-full h-full cursor-pointer"
                                     checked={localSettings.autoDriveUpload}
                                     onChange={(e) => setLocalSettings({ ...localSettings, autoDriveUpload: e.target.checked })}
                                 />
                                 <span
                                     className={`absolute left-0 inline-block w-5 h-5 rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                                     localSettings.autoDriveUpload ? 'translate-x-5 bg-blue-500' : 'bg-zinc-400'
                                     }`}
                                 />
                             </div>
                         </label>
                     </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-300">OAuth Client ID</label>
                    <input
                        type="password"
                        value={localSettings.googleClientId || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, googleClientId: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-300">Google Cloud API Key</label>
                    <input
                        type="password"
                        value={localSettings.googleApiKey || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, googleApiKey: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                </div>
             </div>
          </div>
            
          <hr className="border-zinc-800" />

          {/* SECTION 4: ENGINE */}
          <div className="space-y-4">
             <div className="flex items-center gap-2">
                 <Cpu size={18} className="text-indigo-500" />
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider">Transcription Engine</h3>
             </div>
             
             <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-800">
                <div className="grid grid-cols-3 gap-2">
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