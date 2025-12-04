import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, RotateCcw, AlertCircle } from 'lucide-react';
import { TranscriptionStatus } from '../types';
import { formatTime } from '../utils/audioUtils';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  status: TranscriptionStatus;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, status }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startRecording = async () => {
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        onRecordingComplete(blob);
        stopVisualizer();
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start Timer
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start Visualizer
      startVisualizer(stream);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); // Stop stream
      setIsRecording(false);
      
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setRecordingTime(0);
    setError(null);
  };

  // Visualizer Logic
  const startVisualizer = (stream: MediaStream) => {
    if (!canvasRef.current) return;

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    
    analyserRef.current.fftSize = 256;
    sourceRef.current.connect(analyserRef.current);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const draw = () => {
      if (!analyserRef.current) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#09090b'; // clear with background color
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        
        // Gradient fill
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#4f46e5'); // Indigo 600
        gradient.addColorStop(1, '#818cf8'); // Indigo 400

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      stopVisualizer();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/30 rounded-2xl border border-zinc-800 border-dashed min-h-[400px]">
      
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-200 flex items-center gap-2">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Visualizer Canvas */}
      <div className={`relative w-full max-w-md h-32 mb-8 transition-opacity duration-300 ${isRecording ? 'opacity-100' : 'opacity-20'}`}>
         <canvas 
            ref={canvasRef} 
            width={400} 
            height={128} 
            className="w-full h-full rounded-lg"
         />
         {!isRecording && !audioBlob && (
           <div className="absolute inset-0 flex items-center justify-center text-zinc-600 font-mono text-sm">
             Awaiting Audio Input...
           </div>
         )}
      </div>

      <div className="mb-8 font-mono text-5xl font-light text-zinc-200 tracking-wider">
        {formatTime(recordingTime)}
      </div>

      <div className="flex items-center gap-6">
        {!isRecording && !audioBlob && (
          <button
            onClick={startRecording}
            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-all duration-300 shadow-lg shadow-indigo-600/30 hover:scale-105"
          >
            <Mic size={32} className="text-white group-hover:animate-pulse" />
            <span className="absolute -bottom-8 text-xs font-medium text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
              Start
            </span>
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 transition-all duration-300 shadow-lg shadow-red-500/30 hover:scale-105"
          >
            <Square size={32} className="text-white fill-current" />
            <span className="absolute -bottom-8 text-xs font-medium text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
              Stop
            </span>
            <span className="absolute top-0 right-0 w-4 h-4 bg-red-400 rounded-full animate-ping"></span>
          </button>
        )}

        {audioBlob && !isRecording && (
          <>
            <button
              onClick={resetRecording}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all border border-zinc-700"
              title="Record New"
              disabled={status === TranscriptionStatus.PROCESSING}
            >
              <RotateCcw size={20} />
            </button>
            <div className="flex flex-col items-center">
                <div className="text-sm text-indigo-400 mb-2 font-medium">Ready to Transcribe</div>
                 {/* The parent component handles the "Transcribe" button via the blob passed in onRecordingComplete */}
            </div>
          </>
        )}
      </div>
      
      {audioBlob && (
        <audio controls src={URL.createObjectURL(audioBlob)} className="mt-8 w-full max-w-md h-10 opacity-70" />
      )}
    </div>
  );
};

export default AudioRecorder;