import React from 'react';
import { Mic, Upload, Activity, Settings2 } from 'lucide-react';
import { AppMode } from '../types';

interface HeaderProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentMode, setMode, onOpenSettings }) => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Activity size={18} />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            CaseBuddy Whisper
          </h1>
        </div>

        <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
            <button
                onClick={() => setMode(AppMode.RECORD)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentMode === AppMode.RECORD
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
            >
                <Mic size={16} />
                Record
            </button>
            <button
                onClick={() => setMode(AppMode.UPLOAD)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentMode === AppMode.UPLOAD
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
            >
                <Upload size={16} />
                Upload
            </button>
            </nav>
            
            <button 
                onClick={onOpenSettings}
                className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Engine Settings"
            >
                <Settings2 size={18} />
            </button>
        </div>
      </div>
    </header>
  );
};

export default Header;