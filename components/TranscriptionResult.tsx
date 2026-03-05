import React, { useRef, useState } from 'react';
import { Play, Download, Copy, Share2, Search, Brain, ListChecks, Fingerprint, Clock } from 'lucide-react';
import { TranscriptionResult as ResultType, TranscriptSegment } from '../types';
import { formatTime } from '../utils/audioUtils';

interface Props {
  result: ResultType;
  audioFile: File | { name: string; url: string };
  onTeachAi?: (phrase: string) => void;
}

const TranscriptionResult: React.FC<Props> = ({ result, audioFile }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [searchQuery, setSearchBar] = useState('');

  const jumpTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      audioRef.current.play();
    }
  };

  const filteredSegments = result.segments?.filter(s => 
    s.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.speaker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      
      {/* 1. AI INTELLIGENCE DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="md:col-span-2 p-6 rounded-3xl bg-indigo-600/10 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-4 text-indigo-400">
               <Brain size={20} />
               <h3 className="text-sm font-black uppercase tracking-widest">Executive Summary</h3>
            </div>
            <p className="text-zinc-300 leading-relaxed font-medium">
               {result.summary || "AI is generating a strategic overview of this recording..."}
            </p>
         </div>

         <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800">
            <div className="flex items-center gap-2 mb-4 text-emerald-400">
               <Fingerprint size={20} />
               <h3 className="text-sm font-black uppercase tracking-widest">Key Facts</h3>
            </div>
            <ul className="space-y-2">
               {(result.keyFacts || []).map((fact, i) => (
                 <li key={i} className="text-xs text-zinc-400 flex gap-2">
                    <span className="text-emerald-500">•</span> {fact}
                 </li>
               ))}
            </ul>
         </div>
      </div>

      {/* 2. MEDIA PLAYER CONTROL */}
      <div className="sticky top-24 z-30 p-4 rounded-2xl bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 shadow-2xl flex items-center gap-6">
         <audio 
            ref={audioRef} 
            src={audioFile instanceof File ? URL.createObjectURL(audioFile) : audioFile.url} 
            controls 
            className="flex-1 h-10 custom-audio-player"
         />
         <div className="flex gap-2">
            <button className="p-2.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-all"><Download size={18} /></button>
            <button className="p-2.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-all"><Copy size={18} /></button>
         </div>
      </div>

      {/* 3. INTERACTIVE TRANSCRIPT */}
      <div className="space-y-6">
         <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
               Transcript 
               <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500 uppercase tracking-tighter">Verified</span>
            </h3>
            <div className="relative">
               <Search className="absolute left-3 top-2.5 text-zinc-600" size={14} />
               <input 
                  type="text" 
                  placeholder="Search testimony..."
                  value={searchQuery}
                  onChange={(e) => setSearchBar(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-64 transition-all"
               />
            </div>
         </div>

         <div className="space-y-1">
            {filteredSegments?.map((s, i) => (
               <div 
                  key={i} 
                  onClick={() => jumpTo(s.start)}
                  className="group grid grid-cols-[100px_1fr] gap-6 p-4 rounded-2xl hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-zinc-800"
               >
                  <div className="text-[10px] font-black text-zinc-600 mt-1 flex flex-col gap-1">
                     <span className="flex items-center gap-1 group-hover:text-indigo-400 transition-colors">
                        <Clock size={10} /> {formatTime(s.start)}
                     </span>
                     <span className="uppercase tracking-widest truncate">{s.speaker}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-300 group-hover:text-white transition-colors">
                     {s.text}
                  </p>
               </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default TranscriptionResult;
