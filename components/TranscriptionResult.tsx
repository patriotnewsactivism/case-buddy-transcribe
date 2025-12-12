import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, FileText, Wand2, Languages, Users, Download, Printer, ChevronDown, Music, Edit3, Save, Play, Pause, BookOpen, Plus, UserCog } from 'lucide-react';
import { summarizeText, translateText } from '../services/geminiService';
import { downloadFile, generateFilename, printLegalDocument, formatTranscriptWithSpeakers, extractDateFromFilename, getFileMetadata } from '../utils/fileUtils';
import { TranscriptSegment, TranscriptionResult as TranscriptionResultType, TranscriptionProvider } from '../types';
import { getSpeakerSuggestions, saveVoiceProfile, getRecentSpeakers, recordSpeakerUsage, persistSpeakerMap, getSavedSpeakerMap } from '../services/voiceProfileService';

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

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  // Text Selection for Learning
  const [selection, setSelection] = useState<string>('');

  // Speaker Management
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [showSpeakerPanel, setShowSpeakerPanel] = useState(false);
  const [speakerSuggestions, setSpeakerSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [segmentEditingIndex, setSegmentEditingIndex] = useState<number | null>(null);
  const [segmentSpeakerInput, setSegmentSpeakerInput] = useState('');
  const [segmentOriginalSpeaker, setSegmentOriginalSpeaker] = useState<string | null>(null);
  const [segmentTextEditingIndex, setSegmentTextEditingIndex] = useState<number | null>(null);
  const [segmentTextInput, setSegmentTextInput] = useState('');

  // File Metadata
  const [fileDate, setFileDate] = useState<{ date: string | null; time: string | null } | null>(null);
  const [fileMetadata, setFileMetadata] = useState<{ lastModified: string; size: string; type: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const speakerPanelRef = useRef<HTMLDivElement>(null);
  const speakerMapInitialized = useRef(false);

  // Get display name for a speaker (mapped or original)
  const getSpeakerDisplayName = (originalSpeaker: string): string => {
      return speakerMap[originalSpeaker] || originalSpeaker;
  };

  const rawSpeakers = [...new Set(segments.map(s => s.speaker))];
  const uniqueSpeakers = [...new Set(segments.map(s => getSpeakerDisplayName(s.speaker)))];

  // Initialize Audio URL and extract metadata
  useEffect(() => {
    if (audioFile) {
        const url = URL.createObjectURL(audioFile);
        setAudioUrl(url);

        // Extract date from filename if it's a File
        if (audioFile instanceof File) {
            const extracted = extractDateFromFilename(audioFile.name);
            setFileDate(extracted);
            setFileMetadata(getFileMetadata(audioFile));
        }

        return () => URL.revokeObjectURL(url);
    }
  }, [audioFile]);

  // Auto-generate summary when transcription completes (if not already summarized)
  useEffect(() => {
    if (displayText && !summary && !isSummarizing && segments.length > 0) {
        // Auto-summarize for transcripts with segments
        handleSummarize();
    }
  }, []); // Only on initial load

  // Sync state when props change
  useEffect(() => {
    setDisplayText(result.text);
    setSegments(result.segments || []);
    setSummary(null);
    setTranslation(null);
    setSpeakerMap({});
    speakerMapInitialized.current = false;
    setSegmentEditingIndex(null);
    setSegmentSpeakerInput('');
    setSegmentOriginalSpeaker(null);
    setSegmentTextEditingIndex(null);
    setSegmentTextInput('');
  }, [result]);

  // Close menu on outside click
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
              setShowExportMenu(false);
          }
          if (speakerPanelRef.current && !speakerPanelRef.current.contains(event.target as Node)) {
              // Save speaker mappings when closing panel by clicking outside
              if (showSpeakerPanel && Object.keys(speakerMap).length > 0) {
                  recordSpeakerUsage(speakerMap);
              }
              setShowSpeakerPanel(false);
              setEditingSpeaker(null);
              setShowSuggestions(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSpeakerPanel, speakerMap]);

  // Load any saved speaker mappings for known labels
  useEffect(() => {
      if (speakerMapInitialized.current) return;
      if (segments.length === 0) return;

      const saved = getSavedSpeakerMap();
      const applicable: Record<string, string> = {};
      segments.forEach(seg => {
          if (saved[seg.speaker]) {
              applicable[seg.speaker] = saved[seg.speaker];
          }
      });

      if (Object.keys(applicable).length > 0) {
          setSpeakerMap(applicable);
      }

      speakerMapInitialized.current = true;
  }, [segments]);

  // Update speaker name mapping and save to voice profiles
  const handleSpeakerRename = (originalSpeaker: string, newName: string) => {
      if (newName.trim()) {
          const cleaned = newName.trim();
          setSpeakerMap(prev => {
              const updated = { ...prev, [originalSpeaker]: cleaned };
              persistSpeakerMap({ [originalSpeaker]: cleaned });
              return updated;
          });
          // Save to voice profiles for future suggestions
          saveVoiceProfile(cleaned);
          recordSpeakerUsage({ [originalSpeaker]: cleaned });
      }
      setEditingSpeaker(null);
      setNewSpeakerName('');
      setShowSuggestions(false);
  };

  // Centralized suggestion lookup to share between inputs
  const refreshSuggestions = (value: string) => {
      if (value.trim()) {
          const suggestions = getSpeakerSuggestions(value);
          setSpeakerSuggestions(suggestions);
          setShowSuggestions(suggestions.length > 0);
      } else {
          const recent = getRecentSpeakers(5);
          setSpeakerSuggestions(recent);
          setShowSuggestions(recent.length > 0);
      }
  };

  // Handle speaker name input change and fetch suggestions
  const handleSpeakerInputChange = (value: string) => {
      setNewSpeakerName(value);
      refreshSuggestions(value);
  };

  const handleSegmentSpeakerInputChange = (value: string) => {
      setSegmentSpeakerInput(value);
      refreshSuggestions(value);
  };

  // Select a suggestion
  const handleSelectSuggestion = (suggestion: string) => {
      if (segmentEditingIndex !== null) {
          setSegmentSpeakerInput(suggestion);
      } else {
          setNewSpeakerName(suggestion);
      }
      setShowSuggestions(false);
  };

  // Save all speaker mappings when closing the panel
  const handleCloseSpeakerPanel = () => {
      setShowSpeakerPanel(false);
      setEditingSpeaker(null);
      // Record all current speaker mappings for learning
      if (Object.keys(speakerMap).length > 0) {
          recordSpeakerUsage(speakerMap);
          persistSpeakerMap(speakerMap);
      }
  };

  const startSegmentSpeakerEdit = (index: number) => {
      const target = segments[index];
      if (!target) return;
      setSegmentEditingIndex(index);
      const displayName = getSpeakerDisplayName(target.speaker);
      setSegmentSpeakerInput(displayName);
      setSegmentOriginalSpeaker(target.speaker);
      refreshSuggestions(displayName);
  };

  const cancelSegmentSpeakerEdit = () => {
      setSegmentEditingIndex(null);
      setSegmentSpeakerInput('');
      setSegmentOriginalSpeaker(null);
      setShowSuggestions(false);
  };

  const startSegmentTextEdit = (index: number) => {
      const target = segments[index];
      if (!target) return;
      setSegmentTextEditingIndex(index);
      setSegmentTextInput(target.text);
  };

  const cancelSegmentTextEdit = () => {
      setSegmentTextEditingIndex(null);
      setSegmentTextInput('');
  };

  const saveSegmentTextEdit = () => {
      if (segmentTextEditingIndex === null) return;
      const updatedText = segmentTextInput.trim();
      if (!updatedText) {
          cancelSegmentTextEdit();
          return;
      }

      setSegments(prev => prev.map((seg, idx) => idx === segmentTextEditingIndex ? { ...seg, text: updatedText } : seg));
      cancelSegmentTextEdit();
  };

  const saveSegmentSpeakerEdit = () => {
      if (segmentEditingIndex === null) return;

      const target = segments[segmentEditingIndex];
      if (!target) {
          cancelSegmentSpeakerEdit();
          return;
      }

      const cleaned = segmentSpeakerInput.trim();
      if (!cleaned) {
          cancelSegmentSpeakerEdit();
          return;
      }

      const originalLabel = segmentOriginalSpeaker ?? target.speaker;

      setSegments(prev => prev.map((seg, idx) => idx === segmentEditingIndex ? { ...seg, speaker: cleaned } : seg));
      setSpeakerMap(prev => {
          const updated = { ...prev, [originalLabel]: cleaned };
          persistSpeakerMap({ [originalLabel]: cleaned });
          return updated;
      });

      saveVoiceProfile(cleaned);
      recordSpeakerUsage({ [originalLabel]: cleaned });
      cancelSegmentSpeakerEdit();
  };

  // Update displayText whenever speakerMap changes
  useEffect(() => {
      if (segments.length > 0) {
          const formattedText = segments.map(s => {
              const speakerName = getSpeakerDisplayName(s.speaker);
              const timestamp = formatTimestamp(s.start);
              return `[${timestamp}] [${speakerName}] ${s.text}`;
          }).join('\n');
          setDisplayText(formattedText);
      }
  }, [speakerMap, segments]);

  const formatTimestamp = (seconds: number) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // Handle word click to seek to estimated position within segment
  const handleWordClick = (segmentStart: number, segmentEnd: number, wordIndex: number, totalWords: number, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent segment click from firing
      if (audioRef.current && totalWords > 0) {
          // Estimate word position based on linear distribution within segment
          const segmentDuration = segmentEnd - segmentStart;
          const wordPosition = segmentStart + (segmentDuration * (wordIndex / totalWords));
          audioRef.current.currentTime = wordPosition;
          audioRef.current.play();
          setIsPlaying(true);
      }
  };

  // Render segment text with clickable words
  const renderClickableText = (text: string, segmentStart: number, segmentEnd: number) => {
      const words = text.split(/(\s+)/); // Split but keep whitespace
      const actualWords = words.filter(w => w.trim().length > 0);
      let wordIndex = 0;

      return words.map((word, idx) => {
          if (word.trim().length === 0) {
              // It's whitespace, render as-is
              return <span key={idx}>{word}</span>;
          }

          const currentWordIndex = wordIndex++;
          return (
              <span
                  key={idx}
                  onClick={(e) => handleWordClick(segmentStart, segmentEnd, currentWordIndex, actualWords.length, e)}
                  className="cursor-pointer hover:bg-indigo-500/20 hover:text-indigo-300 rounded px-0.5 transition-colors"
                  title={`Click to jump to ~${formatTimestamp(segmentStart + ((segmentEnd - segmentStart) * (currentWordIndex / actualWords.length)))}`}
              >
                  {word}
              </span>
          );
      });
  };

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

           {/* Speaker Management */}
          {rawSpeakers.length > 0 && (
               <div className="relative" ref={speakerPanelRef}>
                   <button
                       onClick={() => showSpeakerPanel ? handleCloseSpeakerPanel() : setShowSpeakerPanel(true)}
                       className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
                           ${showSpeakerPanel
                               ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                               : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}
                   >
                       <UserCog size={14} />
                       Speakers ({uniqueSpeakers.length})
                   </button>
                   {showSpeakerPanel && (
                       <div className="absolute right-0 mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 p-4">
                           <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Edit Speaker Names</h3>
                           <p className="text-[10px] text-zinc-600 mb-3">Names you assign are remembered for future transcriptions.</p>
                           <div className="space-y-2">
                               {rawSpeakers.map(speaker => (
                                   <div key={speaker} className="relative">
                                       {editingSpeaker === speaker ? (
                                           <div className="relative">
                                               <input
                                                   type="text"
                                                   value={newSpeakerName}
                                                   onChange={(e) => handleSpeakerInputChange(e.target.value)}
                                                   onFocus={() => handleSpeakerInputChange(newSpeakerName)}
                                                   onKeyDown={(e) => {
                                                       if (e.key === 'Enter') handleSpeakerRename(speaker, newSpeakerName);
                                                       if (e.key === 'Escape') {
                                                           setEditingSpeaker(null);
                                                           setShowSuggestions(false);
                                                       }
                                                   }}
                                                   placeholder={`Enter name for ${speaker}`}
                                                   autoFocus
                                                   className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                               />
                                               {/* Suggestions dropdown */}
                                               {showSuggestions && speakerSuggestions.length > 0 && (
                                                   <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-32 overflow-y-auto">
                                                       {speakerSuggestions.map((suggestion, idx) => (
                                                           <button
                                                               key={idx}
                                                               onClick={() => handleSelectSuggestion(suggestion)}
                                                               className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg"
                                                           >
                                                               {suggestion}
                                                           </button>
                                                       ))}
                                                   </div>
                                               )}
                                           </div>
                                       ) : (
                                           <div className="flex items-center gap-2 w-full">
                                               <span className="flex-1 text-sm text-zinc-300">
                                                   {getSpeakerDisplayName(speaker)}
                                                   {speakerMap[speaker] && (
                                                       <span className="text-zinc-600 ml-2 text-xs">({speaker})</span>
                                                   )}
                                               </span>
                                               <button
                                                   onClick={() => {
                                                       setEditingSpeaker(speaker);
                                                       setNewSpeakerName(speakerMap[speaker] || '');
                                                       // Load suggestions when starting to edit
                                                       const recent = getRecentSpeakers(5);
                                                       setSpeakerSuggestions(recent);
                                                       setShowSuggestions(recent.length > 0);
                                                   }}
                                                   className="p-1 text-zinc-500 hover:text-white rounded transition-colors"
                                               >
                                                   <Edit3 size={12} />
                                               </button>
                                           </div>
                                       )}
                                   </div>
                               ))}
                           </div>
                           <p className="text-[10px] text-zinc-600 mt-3">Click the edit icon to rename speakers. Names are used in exports.</p>
                       </div>
                   )}
               </div>
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
                <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50">
                     <button
                        onClick={() => {
                            const formattedText = segments.length > 0
                                ? formatTranscriptWithSpeakers(segments, speakerMap)
                                : displayText;
                            downloadFile(formattedText, generateFilename('Transcript', 'txt'), 'text/plain');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-t-xl"
                     >
                        Text File (with speakers)
                     </button>
                     <button
                        onClick={() => {
                            if (segments.length === 0) return;
                            const grouped = formatTranscriptWithSpeakers(segments, speakerMap, { includeTimestamps: true, groupBySpeaker: true });
                            downloadFile(grouped, generateFilename('Speaker_Separated', 'txt'), 'text/plain');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                     >
                        Speaker-separated (grouped)
                     </button>
                     <button
                        onClick={() => printLegalDocument(
                            displayText,
                            "TRANSCRIPT OF RECORDING",
                            segments,
                            speakerMap,
                            { summary: summary || undefined }
                        )}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-b-xl"
                     >
                        Legal Print (formatted)
                     </button>
                </div>
            )}
           </div>
        </div>
      </div>

      {/* Metadata Header */}
      {(fileDate?.date || fileMetadata) && (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 mb-2">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {fileDate?.date && (
                      <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Recording Date:</span>
                          <span className="text-zinc-200 font-medium">{fileDate.date}</span>
                          {fileDate.time && (
                              <span className="text-zinc-400">at {fileDate.time}</span>
                          )}
                      </div>
                  )}
                  {fileMetadata && !fileDate?.date && (
                      <div className="flex items-center gap-2">
                          <span className="text-zinc-500">File Modified:</span>
                          <span className="text-zinc-300">{fileMetadata.lastModified}</span>
                      </div>
                  )}
                  {fileMetadata && (
                      <>
                          <div className="flex items-center gap-2">
                              <span className="text-zinc-500">Size:</span>
                              <span className="text-zinc-300">{fileMetadata.size}</span>
                          </div>
                          <div className="flex items-center gap-2">
                              <span className="text-zinc-500">Type:</span>
                              <span className="text-zinc-300">{fileMetadata.type}</span>
                          </div>
                      </>
                  )}
                  {uniqueSpeakers.length > 0 && (
                      <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Speakers:</span>
                          <span className="text-zinc-300">{uniqueSpeakers.length} identified</span>
                      </div>
                  )}
              </div>
          </div>
      )}

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
                                          <div className="flex items-center gap-2">
                                              <span className={`text-[10px] font-bold uppercase tracking-wider ${idx === activeSegmentIndex ? 'text-indigo-400' : 'text-zinc-500'}`}>
                                                  {getSpeakerDisplayName(seg.speaker) || `Speaker`}
                                              </span>
                                              <button
                                                  onClick={(e) => { e.stopPropagation(); startSegmentSpeakerEdit(idx); }}
                                                  className="text-[10px] text-zinc-500 hover:text-white bg-zinc-800/70 border border-zinc-700 px-2 py-0.5 rounded-full"
                                              >
                                                  Edit
                                              </button>
                                              <button
                                                  onClick={(e) => { e.stopPropagation(); startSegmentTextEdit(idx); }}
                                                  className="text-[10px] text-zinc-500 hover:text-white bg-zinc-800/70 border border-zinc-700 px-2 py-0.5 rounded-full"
                                              >
                                                  Edit text
                                              </button>
                                          </div>
                                          <span className="text-[10px] font-mono text-zinc-600">
                                              {formatTimestamp(seg.start)}
                                          </span>
                                      </div>
                                      {segmentEditingIndex === idx ? (
                                          <div className="relative mt-2" onClick={(e) => e.stopPropagation()}>
                                              <div className="flex items-center gap-2">
                                                  <input
                                                      type="text"
                                                      value={segmentSpeakerInput}
                                                      onChange={(e) => handleSegmentSpeakerInputChange(e.target.value)}
                                                      onFocus={(e) => refreshSuggestions(e.target.value)}
                                                      onKeyDown={(e) => {
                                                          if (e.key === 'Enter') saveSegmentSpeakerEdit();
                                                          if (e.key === 'Escape') cancelSegmentSpeakerEdit();
                                                      }}
                                                      className="w-48 px-2 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                                      placeholder="Assign speaker"
                                                      autoFocus
                                                  />
                                                  <button
                                                      onClick={saveSegmentSpeakerEdit}
                                                      className="px-2 py-1 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                                                  >
                                                      Save
                                                  </button>
                                                  <button
                                                      onClick={cancelSegmentSpeakerEdit}
                                                      className="px-2 py-1 text-[11px] bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-700 hover:bg-zinc-700"
                                                  >
                                                      Cancel
                                                  </button>
                                              </div>
                                              {showSuggestions && speakerSuggestions.length > 0 && (
                                                  <div className="absolute z-50 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                                      {speakerSuggestions.map((suggestion, sIdx) => (
                                                          <button
                                                              key={sIdx}
                                                              onClick={() => handleSelectSuggestion(suggestion)}
                                                              className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                                                          >
                                                              {suggestion}
                                                          </button>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                      ) : segmentTextEditingIndex === idx ? (
                                          <div className="relative mt-3" onClick={(e) => e.stopPropagation()}>
                                              <textarea
                                                  value={segmentTextInput}
                                                  onChange={(e) => setSegmentTextInput(e.target.value)}
                                                  className="w-full min-h-[100px] px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                              />
                                              <div className="flex items-center gap-2 mt-2">
                                                  <button
                                                      onClick={saveSegmentTextEdit}
                                                      className="px-3 py-1 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                                                  >
                                                      Save text
                                                  </button>
                                                  <button
                                                      onClick={cancelSegmentTextEdit}
                                                      className="px-3 py-1 text-[11px] bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-700 hover:bg-zinc-700"
                                                  >
                                                      Cancel
                                                  </button>
                                              </div>
                                          </div>
                                      ) : (
                                          <p className={`text-base leading-relaxed ${idx === activeSegmentIndex ? 'text-white' : 'text-zinc-300 group-hover:text-zinc-200'}`}>
                                              {renderClickableText(seg.text, seg.start, seg.end)}
                                          </p>
                                      )}
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
             <div className="sticky top-40 space-y-4">
                {/* Summary Section - always show if summarizing or has summary */}
                {(isSummarizing || summary) && (
                    <div className="p-5 bg-emerald-950/30 border border-emerald-900/50 rounded-xl animate-in slide-in-from-right">
                        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Wand2 size={12} className={isSummarizing ? 'animate-spin' : ''}/> Summary
                        </h3>
                        {isSummarizing ? (
                            <div className="flex items-center gap-2 text-sm text-emerald-100/60">
                                <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin"></div>
                                Analyzing transcript...
                            </div>
                        ) : (
                            <p className="text-sm text-emerald-100/80 leading-relaxed">{summary}</p>
                        )}
                    </div>
                )}

                {/* Translation Section */}
                {translation && (
                    <div className="p-5 bg-purple-950/30 border border-purple-900/50 rounded-xl animate-in slide-in-from-right">
                        <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Languages size={12}/> Translation
                        </h3>
                        <p className="text-sm text-purple-100/80 leading-relaxed">{translation}</p>
                    </div>
                )}

                {/* Speaker Legend */}
                {uniqueSpeakers.length > 1 && (
                    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users size={12}/> Speaker Legend
                        </h3>
                        <div className="space-y-2">
                            {uniqueSpeakers.map((speaker, idx) => (
                                <div key={speaker} className="flex items-center gap-2 text-sm">
                                    <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-amber-500' : 'bg-pink-500'}`}></div>
                                    <span className="text-zinc-300">{getSpeakerDisplayName(speaker)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
             </div>
          </div>
      </div>
    </div>
  );
};

export default TranscriptionResult;