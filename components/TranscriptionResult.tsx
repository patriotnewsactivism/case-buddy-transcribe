import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Check, FileText, Wand2, Languages, Users, Download, Printer, ChevronDown, Music } from 'lucide-react';
import { summarizeText, translateText } from '../services/geminiService';
import { downloadFile, generateFilename, printLegalDocument } from '../utils/fileUtils';

interface TranscriptionResultProps {
  text: string;
  audioFile?: File | Blob | null;
}

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({ text: initialText, audioFile }) => {
  const [displayText, setDisplayText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Speaker Identification State
  const [showSpeakerTools, setShowSpeakerTools] = useState(false);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Reset display text if prop changes
  useEffect(() => {
    setDisplayText(initialText);
    setSpeakerMap({});
    setSummary(null);
    setTranslation(null);
  }, [initialText]);

  // Extract potential speakers
  const detectedSpeakers = useMemo(() => {
    const regex = /\[?Speaker\s+(\w+)\]?:?/gi;
    const matches = initialText.match(regex);
    if (!matches) return [];
    return Array.from(new Set(matches)).sort();
  }, [initialText]);

  // Apply speaker name changes
  const handleSpeakerRename = (original: string, newName: string) => {
    setSpeakerMap(prev => {
        const updated = { ...prev, [original]: newName };
        applySpeakerNames(updated);
        return updated;
    });
  };

  const applySpeakerNames = (map: Record<string, string>) => {
      let newText = initialText;
      Object.entries(map).forEach(([original, newName]) => {
          if (newName.trim()) {
              const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(escapedOriginal, 'g');
              newText = newText.replace(regex, newName);
          }
      });
      setDisplayText(newText);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSummarize = async () => {
    if (!displayText) return;
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
    if (!displayText) return;
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

  // Export Handlers
  const handleExportText = () => {
      downloadFile(displayText, generateFilename('Transcript', 'txt'), 'text/plain');
      setShowExportMenu(false);
  };

  const handleExportJSON = () => {
      const data = JSON.stringify({
          transcript: displayText,
          summary: summary,
          timestamp: new Date().toISOString(),
          speakers: speakerMap
      }, null, 2);
      downloadFile(data, generateFilename('Case_Data', 'json'), 'application/json');
      setShowExportMenu(false);
  };

  const handlePrintLegal = () => {
      printLegalDocument(displayText);
      setShowExportMenu(false);
  };

  const handleDownloadAudio = () => {
    if (!audioFile) return;
    // Determine extension/type
    const ext = audioFile.type.includes('video') ? 'mp4' : 'webm';
    downloadFile(audioFile, generateFilename('Evidence_Original', ext), audioFile.type);
    setShowExportMenu(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-2 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-2 px-3">
          <FileText size={18} className="text-indigo-400" />
          <span className="text-sm font-medium text-zinc-300">Transcription</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
           
           {/* Speaker Toggle */}
           {detectedSpeakers.length > 0 && (
                <button
                    onClick={() => setShowSpeakerTools(!showSpeakerTools)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
                    ${showSpeakerTools
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}
                >
                    <Users size={14} />
                    {showSpeakerTools ? 'Hide Speakers' : 'Identify Speakers'}
                </button>
           )}

           <div className="w-px h-6 bg-zinc-800 mx-1 hidden md:block"></div>

           <button
            onClick={handleSummarize}
            disabled={isSummarizing || !!summary}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
              ${summary 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}
          >
            <Wand2 size={14} />
            {isSummarizing ? 'Summarizing...' : summary ? 'Summarized' : 'Summarize'}
          </button>
          
          <button
            onClick={handleTranslate}
            disabled={isTranslating || !!translation}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
              ${translation
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}
          >
            <Languages size={14} />
            {isTranslating ? 'Translating...' : translation ? 'Translated (ES)' : 'Translate'}
          </button>

          {/* Export Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white text-black hover:bg-zinc-200 rounded-lg transition-colors"
            >
                <Download size={14} />
                Export
                <ChevronDown size={12} />
            </button>
            
            {showExportMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-100">
                    <button onClick={handlePrintLegal} className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 hover:text-white flex items-center gap-2">
                        <Printer size={16} /> Legal PDF / Print
                    </button>
                    <button onClick={handleExportText} className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 hover:text-white flex items-center gap-2">
                        <FileText size={16} /> Text File (.txt)
                    </button>
                    <button onClick={handleExportJSON} className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 hover:text-white flex items-center gap-2">
                        <div className="font-mono text-xs opacity-70">{'{ }'}</div> JSON Metadata
                    </button>
                    {audioFile && (
                        <button onClick={handleDownloadAudio} className="w-full text-left px-4 py-3 text-sm text-emerald-400 hover:bg-zinc-800 hover:text-emerald-300 flex items-center gap-2 border-t border-zinc-800">
                           <Music size={16} /> Save Original Audio
                        </button>
                    )}
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Speaker Renaming Panel */}
      {showSpeakerTools && detectedSpeakers.length > 0 && (
          <div className="p-4 bg-indigo-950/20 border border-indigo-900/50 rounded-xl animate-in slide-in-from-top-2">
              <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">
                  Map Speaker Labels to Real Names
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {detectedSpeakers.map((speakerTag, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                          <span className="text-xs text-zinc-500 whitespace-nowrap">{speakerTag}</span>
                          <span className="text-zinc-600">→</span>
                          <input 
                            type="text" 
                            placeholder="Enter Name..."
                            className="w-full bg-transparent border-none text-sm text-white focus:outline-none placeholder-zinc-700"
                            value={speakerMap[speakerTag] || ''}
                            onChange={(e) => handleSpeakerRename(speakerTag, e.target.value)}
                          />
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Main Text Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original Transcript */}
          <div className={`p-6 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-sm ${summary || translation ? '' : 'md:col-span-2'}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Original Text</h3>
                <button onClick={handleCopy} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                    {copied ? <Check size={12}/> : <Copy size={12}/>} {copied ? 'Copied' : 'Copy Text'}
                </button>
            </div>
            <div className="prose prose-invert prose-zinc max-w-none">
              <p className="whitespace-pre-wrap leading-relaxed text-zinc-100 font-mono text-sm md:text-base">
                {displayText}
              </p>
            </div>
          </div>

          {/* Side Panel for Summary/Translation */}
          {(summary || translation) && (
             <div className="space-y-6">
                {summary && (
                    <div className="p-6 bg-emerald-950/20 rounded-2xl border border-emerald-900/50 animate-in fade-in zoom-in duration-300">
                        <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Wand2 size={16} /> Summary
                        </h3>
                        <div className="prose prose-invert prose-sm prose-emerald">
                            <p className="whitespace-pre-wrap leading-relaxed text-emerald-100/90">{summary}</p>
                        </div>
                    </div>
                )}
                
                {translation && (
                    <div className="p-6 bg-purple-950/20 rounded-2xl border border-purple-900/50 animate-in fade-in zoom-in duration-300">
                        <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                             <Languages size={16} /> Translation (Spanish)
                        </h3>
                        <div className="prose prose-invert prose-sm prose-purple">
                            <p className="whitespace-pre-wrap leading-relaxed text-purple-100/90">{translation}</p>
                        </div>
                    </div>
                )}
             </div>
          )}
      </div>
    </div>
  );
};

export default TranscriptionResult;