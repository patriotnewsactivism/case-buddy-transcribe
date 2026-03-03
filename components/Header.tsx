import React, { useState } from 'react';
import { Mic, Upload, Activity, Settings2, LogOut } from 'lucide-react';
import { AppMode, GoogleUser } from '../types';

interface HeaderProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  onOpenSettings: () => void;
  googleUser: GoogleUser | null;
  onSignOut: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentMode, setMode, onOpenSettings, googleUser, onSignOut }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

            <div className="relative">
              {googleUser ? (
                <div>
                  <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="rounded-full overflow-hidden w-9 h-9 border-2 border-zinc-700 hover:border-indigo-500 transition-all">
                    <img src={googleUser.picture} alt={googleUser.name} />
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg py-2">
                      <div className="px-4 py-2 border-b border-zinc-800">
                        <p className="text-sm font-semibold text-white">{googleUser.name}</p>
                        <p className="text-xs text-zinc-400">{googleUser.email}</p>
                      </div>
                      <button onClick={() => { onSignOut(); setIsDropdownOpen(false); }} className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div id="google-signin-button"></div>
              )}
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
