import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileAudio, FileVideo, X, FolderInput, Files, HardDrive, Loader2 } from 'lucide-react';

interface FileUploaderProps {
  onFilesSelect: (files: File[]) => void;
  onDriveSelect: () => void;
  isDriveLoading: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelect, onDriveSelect, isDriveLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File) => {
    return file.type.startsWith('audio/') || file.type.startsWith('video/');
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles: File[] = [];
      Array.from(e.dataTransfer.files).forEach((file: File) => {
          if (validateFile(file)) validFiles.push(file);
      });
      
      if (validFiles.length > 0) {
        onFilesSelect(validFiles);
      } else {
        alert("No valid audio or video files found in selection.");
      }
    }
  }, [onFilesSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
        const validFiles: File[] = [];
        Array.from(e.target.files).forEach((file: File) => {
            if (validateFile(file)) validFiles.push(file);
        });
        
        if (validFiles.length > 0) {
            onFilesSelect(validFiles);
        } else {
             alert("No valid audio or video files found.");
        }
    }
  }, [onFilesSelect]);

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className={`relative flex flex-col items-center justify-center w-full min-h-[350px] p-8 rounded-3xl border-2 border-dashed transition-all duration-300 ease-in-out group ${
          dragActive
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]'
            : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-500 hover:bg-zinc-900/50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center space-y-6 text-center pointer-events-none z-10">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${dragActive ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-200'}`}>
              <Upload className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold text-zinc-100">
                Upload Recordings
              </h3>
              <p className="text-zinc-400 max-w-sm mx-auto">
                Drag & drop files or folders here, or choose an option below.
              </p>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 z-20">
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-medium hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"
            >
                <Files size={18} />
                Select Files
            </button>
            <button 
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 text-zinc-200 rounded-xl font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
            >
                <FolderInput size={18} />
                Select Folder
            </button>
             <button 
                onClick={onDriveSelect}
                disabled={isDriveLoading}
                className={`flex items-center gap-2 px-6 py-3 bg-indigo-600/20 text-indigo-300 rounded-xl font-medium hover:bg-indigo-600/30 transition-colors border border-indigo-600/30 ${isDriveLoading ? 'opacity-70 cursor-wait' : ''}`}
            >
                {isDriveLoading ? <Loader2 size={18} className="animate-spin"/> : <HardDrive size={18} />}
                {isDriveLoading ? 'Importing...' : 'Google Drive'}
            </button>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="audio/*,video/*"
          onChange={handleFileChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          // @ts-ignore - webkitdirectory is standard in modern browsers but not in React types
          webkitdirectory=""
          directory=""
          onChange={handleFileChange}
        />

        <div className="absolute bottom-6 text-xs text-zinc-600 font-mono">
            Supported: MP3, WAV, MP4, MOV, MKV • Auto-converts Video to Audio
        </div>
      </div>
    </div>
  );
};

export default FileUploader;