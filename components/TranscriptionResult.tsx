import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, FileText, Wand2, Languages, Users, Download, Printer, ChevronDown, Music, Edit3, Save, Play, Pause, BookOpen, Plus } from 'lucide-react';
import { summarizeText, translateText } from '../services/geminiService';
import { downloadFile, generateFilename, printLegalDocument } from '../utils/fileUtils';
import { TranscriptSegment, TranscriptionResult as TranscriptionResultType, TranscriptionProvider } from '../types';

interface TranscriptionResultProps {
  result: TranscriptionResultType;
  audioFile?: File | Blob | null;
  onTeachAi?: (phrase: string) => void; // Callback to add to vocabulary
}

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({ result, audioFile, onTeachAi }) => {
  const [displayText, setDisplayText] = useState(result.text);
  const [segments, setSegments] = useState<TranscriptSegment[]>(result.segments || []);
  
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({});
  
  // Audio Player State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  // Text Selection for Learning
  const [selection, setSelection] = useState<string>('');

  const menuRef = useRef<HTMLDivElement>(null);

  // Initialize Audio URL
  useEffect(() => {
    if (audioFile) {
        const url = URL.createObjectURL(audioFile);
        setAudioUrl(url);
        return () => URL.revokeObjectURL(url);
    }
  }, [audioFile]);

  // Sync state when props change
  useEffect(() => {
    setDisplayText(result.text);
    setSegments(result.segments || []);
    setSummary(null);
    setTranslation(null);
  }, [result]);

  useEffect(() => {
    try {
      const savedAliases = localStorage.getItem('speaker_aliases');
      if (savedAliases) {
        const parsed = JSON.parse(savedAliases);
        if (parsed && typeof parsed === 'object') {
          setSpeakerAliases(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load speaker aliases', e);
    }
  }, []);

  // Close menu on outside click
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
              setShowExportMenu(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- AUDIO PLAYER LOGIC ---

  const togglePlay = () => {
      if (audioRef.current) {
          if (isPlaying) {
              audioRef.current.pause();
          } else {
              audioRef.current.play();
          }
          setIsPlaying(!isPlaying);
      }
  };

  const handleTimeUpdate = () => {
      if (audioRef.current) {
          const time = audioRef.current.currentTime;
          setCurrentTime(time);

          // Find active segment
          if (segments.length > 0) {
              const activeIdx = segments.findIndex(s => time >= s.start && time <= s.end);
              if (activeIdx !== -1) setActiveSegmentIndex(activeIdx);
          }
      }
  };

  const handleSegmentClick = (start: number) => {
      if (audioRef.current) {
          audioRef.current.currentTime = start;
          audioRef.current.play();
          setIsPlaying(true);
      }
  };

  const getDisplaySpeaker = (rawSpeaker: string) => {
      const key = (rawSpeaker || 'Speaker').trim();
      return speakerAliases[key] || key || 'Speaker';
  };

  const rememberSpeaker = (rawSpeaker: string) => {
      const key = (rawSpeaker || 'Speaker').trim();
      const suggestion = speakerAliases[key] || key;
      const alias = prompt('Remember this speaker as:', suggestion);
      if (!alias) return;

      const cleaned = alias.trim();
      if (!cleaned) return;

      const updated = { ...speakerAliases, [key]: cleaned };
      setSpeakerAliases(updated);
      localStorage.setItem('speaker_aliases', JSON.stringify(updated));
  };

  // --- EDITING & LEARNING LOGIC ---

  const handleTextSelection = () => {
      const selectedText = window.getSelection()?.toString();
      if (selectedText && selectedText.trim().length > 0) {
          setSelection(selectedText.trim());
      } else {
          setSelection('');
      }
  };

  const handleTeachAi = () => {
      if (selection && onTeachAi) {
          onTeachAi(selection);
          alert(`Added "${selection}" to Vocabulary. Future transcriptions will prioritize this spelling.`);
          setSelection('');
          window.getSelection()?.removeAllRanges();
      }
  };

  const handleSaveEdit = () => {
      setIsEditing(false);
      // In a real app, you'd parse the Edited Text back into segments here
      // For now, we just save the text block.
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- AI ACTIONS ---

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const result = await summarizeText(displayText);
      setSummary(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleTranslate = async () => {
    setIsTranslating(true);
    try {
      const result = await translateText(displayText, "Spanish");
      setTranslation(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-32">
      
      {/* Hidden Audio Element */}
      {audioUrl && (
          <audio 
            ref={audioRef} 
            src={audioUrl} 
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            className="hidden"
          />
      )}

      {/* Toolbar */}
      <div className="sticky top-20 z-40 flex flex-col md:flex-row items-center justify-between gap-4 p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl">
        
        {/* Audio Controls */}
        <div className="flex items-center gap-4 w-full md:w-auto">
             <button 
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white transition-all hover:scale-105"
             >
                 {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
             </button>
             <div className="flex-1 md:w-48">
                 <div className="text-xs text-zinc-400 font-mono mb-1">
                     {audioRef.current ? new Date(currentTime * 1000).toISOString().substr(14, 5) : "00:00"} / 
                     {audioRef.current?.duration ? new Date(audioRef.current.duration * 1000).toISOString().substr(14, 5) : "--:--"}
                 </div>
                 <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full cursor-pointer" onClick={(e) => {
                     if(!audioRef.current) return;
                     const rect = e.currentTarget.getBoundingClientRect();
                     const pos = (e.clientX - rect.left) / rect.width;
                     audioRef.current.currentTime = pos * audioRef.current.duration;
                 }}>
                     <div className="h-full bg-indigo-500" style={{ width: `${audioRef.current && audioRef.current.duration ? (currentTime / audioRef.current.duration) * 100 : 0}%` }} />
                 </div>
             </div>
        </div>
        
        <div className="flex items-center gap-2">
           {/* Edit Toggle */}
           <button
             onClick={() => isEditing ? handleSaveEdit() : setIsEditing(true)}
             className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
               ${isEditing
                 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' 
                 : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}
           >
             {isEditing ? <Save size={14} /> : <Edit3 size={14} />}
             {isEditing ? 'Save Changes' : 'Edit Text'}
           </button>

            {/* Teaching Tool */}
            {selection && (
                <button
                    onClick={handleTeachAi}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 transition-all animate-in zoom-in"
                >
                    <BookOpen size={14} />
                    Teach "{selection.length > 15 ? selection.substring(0, 12) + '...' : selection}"
                </button>
            )}

           <button onClick={handleSummarize} disabled={isSummarizing || !!summary} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg border border-zinc-700">
             <Wand2 size={16} />
           </button>
          
           <button onClick={handleTranslate} disabled={isTranslating || !!translation} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg border border-zinc-700">
             <Languages size={16} />
           </button>

           <div className="relative" ref={menuRef}>
            <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white text-black hover:bg-zinc-200 rounded-lg transition-colors"
            >
                <Download size={14} />
                Export
            </button>
            {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50">
                     <button onClick={() => downloadFile(displayText, generateFilename('Transcript', 'txt'), 'text/plain')} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                        Text File
                     </button>
                     <button onClick={() => printLegalDocument(displayText)} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                        Legal Print
                     </button>
                </div>
            )}
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Transcript Display */}
          <div className="md:col-span-2 space-y-4">
              <div 
                className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 min-h-[500px]"
                onMouseUp={handleTextSelection} // Capture selection for "Learning"
              >
                  {isEditing ? (
                      <textarea
                        value={displayText}
                        onChange={(e) => setDisplayText(e.target.value)}
                        className="w-full h-full min-h-[500px] bg-transparent font-mono text-sm leading-relaxed text-zinc-300 focus:outline-none resize-none"
                      />
                  ) : (
                      <div className="space-y-4">
                          {/* If we have segments, render interactive mode. Else render plain text. */}
                          {segments.length > 0 ? (
                              segments.map((seg, idx) => (
                                  <div 
                                    key={idx} 
                                    onClick={() => handleSegmentClick(seg.start)}
                                    className={`
                                        group relative pl-4 border-l-2 transition-all duration-200 cursor-pointer hover:bg-zinc-800/50 p-2 rounded-r-lg
                                        ${idx === activeSegmentIndex 
                                            ? 'border-indigo-500 bg-indigo-500/10' 
                                            : 'border-transparent hover:border-zinc-700'}
                                    `}
                                  >
                                      <div className="flex items-baseline gap-3 mb-1">
                                          <span className={`text-[10px] font-bold uppercase tracking-wider ${idx === activeSegmentIndex ? 'text-indigo-400' : 'text-zinc-500'}`}>
                                              {getDisplaySpeaker(seg.speaker)}
                                          </span>
                                          <span className="text-[10px] font-mono text-zinc-600">
                                              {new Date(seg.start * 1000).toISOString().substr(14, 5)}
                                          </span>
                                          <button
                                            className="text-[10px] text-zinc-500 hover:text-amber-300 transition-colors ml-auto flex items-center gap-1"
                                            onClick={(e) => { e.stopPropagation(); rememberSpeaker(seg.speaker); }}
                                          >
                                            <Users size={12} />
                                            Remember
                                          </button>
                                      </div>
                                      <p className={`text-base leading-relaxed ${idx === activeSegmentIndex ? 'text-white' : 'text-zinc-300 group-hover:text-zinc-200'}`}>
                                          {seg.text}
                                      </p>
                                  </div>
                              ))
                          ) : (
                              <p className="whitespace-pre-wrap leading-relaxed text-zinc-300 font-mono">
                                  {displayText}
                              </p>
                          )}
                      </div>
                  )}
              </div>
          </div>

          {/* Sidebar (Summary / Translation) */}
          <div className="space-y-4">
             {(summary || translation) && (
                 <div className="sticky top-40 space-y-4 animate-in slide-in-from-right">
                    {summary && (
                        <div className="p-5 bg-emerald-950/30 border border-emerald-900/50 rounded-xl">
                            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Wand2 size={12}/> Summary
                            </h3>
                            <p className="text-sm text-emerald-100/80 leading-relaxed">{summary}</p>
                        </div>
                    )}
                    {translation && (
                        <div className="p-5 bg-purple-950/30 border border-purple-900/50 rounded-xl">
                            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Languages size={12}/> Translation
                            </h3>
                            <p className="text-sm text-purple-100/80 leading-relaxed">{translation}</p>
                        </div>
                    )}
                 </div>
             )}
          </div>
      </div>
    </div>
  );
};

export default TranscriptionResult;