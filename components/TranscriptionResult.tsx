import React, { useState } from 'react';
import { Copy, Check, FileText, Wand2, Languages } from 'lucide-react';
import { summarizeText, translateText } from '../services/geminiService';

interface TranscriptionResultProps {
  text: string;
}

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSummarize = async () => {
    if (!text) return;
    setIsSummarizing(true);
    try {
      const result = await summarizeText(text);
      setSummary(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleTranslate = async () => {
    if (!text) return;
    setIsTranslating(true);
    try {
        // Defaulting to Spanish for this demo, could be a dropdown
      const result = await translateText(text, "Spanish");
      setTranslation(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-2 px-3">
          <FileText size={18} className="text-indigo-400" />
          <span className="text-sm font-medium text-zinc-300">Transcription</span>
        </div>
        <div className="flex items-center gap-2">
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

          <div className="w-px h-6 bg-zinc-800 mx-1"></div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Main Text Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original Transcript */}
          <div className={`p-6 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-sm ${summary || translation ? '' : 'md:col-span-2'}`}>
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Original Text</h3>
            <div className="prose prose-invert prose-zinc max-w-none">
              <p className="whitespace-pre-wrap leading-relaxed text-zinc-100">
                {text}
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