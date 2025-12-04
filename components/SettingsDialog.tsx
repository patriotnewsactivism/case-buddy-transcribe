import React from 'react';
import { X, Save, Shield, Key, Cpu } from 'lucide-react';
import { TranscriptionProvider, TranscriptionSettings } from '../types';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TranscriptionSettings;
  onSave: (settings: TranscriptionSettings) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = React.useState<TranscriptionSettings>(settings);

  // Sync when opening
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cpu size={20} className="text-indigo-500" />
            Engine Configuration
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
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
                Enables verbatim transcription, speaker diarization (identification), and strict timestamps. Optimized for court reporting and evidence.
              </p>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-300">Transcription Engine</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: TranscriptionProvider.GEMINI, label: 'Gemini 2.5' },
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

          {/* API Keys */}
          {localSettings.provider !== TranscriptionProvider.GEMINI && (
             <div className="space-y-4 pt-2 border-t border-zinc-800">
                {localSettings.provider === TranscriptionProvider.OPENAI && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                      <Key size={12} /> OpenAI API Key
                    </label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={localSettings.openaiKey}
                      onChange={(e) => setLocalSettings({ ...localSettings, openaiKey: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-zinc-500">Required for Whisper-1 model access.</p>
                  </div>
                )}

                {localSettings.provider === TranscriptionProvider.ASSEMBLYAI && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                      <Key size={12} /> AssemblyAI API Key
                    </label>
                    <input
                      type="password"
                      placeholder="Enter API Key"
                      value={localSettings.assemblyAiKey}
                      onChange={(e) => setLocalSettings({ ...localSettings, assemblyAiKey: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-zinc-500">Required for AssemblyAI advanced speaker diarization.</p>
                  </div>
                )}
             </div>
          )}

        </div>

        <div className="p-6 pt-0">
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
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