import React, { useCallback, useState } from 'react';
import { Upload, FileAudio, X } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        setSelectedFile(file);
        onFileSelect(file);
      } else {
        alert("Please upload an audio file.");
      }
    }
  }, [onFileSelect]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setSelectedFile(file);
        onFileSelect(file);
    }
  }, [onFileSelect]);

  const clearFile = () => {
    setSelectedFile(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`relative flex flex-col items-center justify-center w-full min-h-[300px] p-6 rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out ${
          dragActive
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-500 hover:bg-zinc-900/50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          accept="audio/*"
          onChange={handleChange}
          disabled={!!selectedFile}
        />

        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center space-y-4 text-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
              <Upload className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <p className="text-lg font-medium text-zinc-200">
                Click to upload or drag and drop
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                MP3, WAV, AAC, M4A (Max 20MB recommended)
              </p>
            </div>
          </div>
        ) : (
            // File Selected State
            <div className="relative z-20 flex flex-col items-center w-full max-w-md animate-in fade-in zoom-in duration-300">
                <div className="w-full p-4 bg-zinc-800/80 rounded-xl border border-zinc-700 flex items-center gap-4 shadow-lg">
                    <div className="w-12 h-12 rounded-lg bg-indigo-900/50 flex items-center justify-center text-indigo-400">
                        <FileAudio size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                            {selectedFile.name}
                        </p>
                        <p className="text-xs text-zinc-400">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                    </div>
                    <button 
                        onClick={clearFile}
                        className="p-2 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="mt-4 text-xs text-zinc-500">
                    File ready for processing
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;