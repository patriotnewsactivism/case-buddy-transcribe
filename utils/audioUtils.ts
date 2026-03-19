import { extractAudio } from '../services/ffmpegService';

export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * High-speed media file processing using FFmpeg.
 * This function handles both audio and video files by "scraping" or re-encoding
 * the audio to the optimal 16kHz Mono format required for high AI transcription accuracy.
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
      return file;
    }

    // 1. FAST PATH: SMALL FILES
    // For very small files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 50MB to avoid browser memory issues
    const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
    if (file.size > LARGE_FILE_THRESHOLD) {
        console.log(`Large file detected (${(file.size / 1024 / 1024).toFixed(1)}MB). Using FFmpeg for processing...`);
        return await processWithFFmpeg(file, onProgress);
    }

    // 3. SAFETY LIMIT: Browser Memory Cap (~1.8 GB)
    const MAX_SAFE_SIZE = 1.8 * 1024 * 1024 * 1024; // 1.8 GB
    
    if (file.size > MAX_SAFE_SIZE) {
        console.warn(`File size exceeds browser memory safety limit (${(file.size / 1024 / 1024).toFixed(1)}MB). Uploading original file directly.`);
        return file;
    }

    // 4. FFmpeg PATH (The standard for both Video and Audio)
    // This scrapes audio from video or optimizes audio-only files (resampling, mono conversion).
    try {
        if (onProgress) onProgress(0);
        const processedBlob = await extractAudio(file, onProgress);
        return processedBlob;
    } catch (e) {
        console.warn("FFmpeg processing failed. Falling back to original file.", e);
        return file;
    }
};

/**
 * Processes large files using FFmpeg with better error handling
 */
const processWithFFmpeg = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
    try {
        // Check if FFmpeg is available
        if (typeof FFmpeg === 'undefined') {
            throw new Error('FFmpeg not available in this browser');
        }
        
        if (onProgress) onProgress(0);
        const processedBlob = await extractAudio(file, onProgress);
        return processedBlob;
    } catch (ffmpegError) {
        console.warn("FFmpeg processing failed for large file, falling back to original file:", ffmpegError);
        
        // For very large files that can't be processed, return the original
        // This ensures the transcription service can still work
        return file;
    }
};
        return file;
    }

    // 4. FFmpeg PATH (The standard for both Video and Audio)
    // This scrapes audio from video or optimizes audio-only files (resampling, mono conversion).
    try {
        if (onProgress) onProgress(0);
        const processedBlob = await extractAudio(file, onProgress);
        return processedBlob;
    } catch (e) {
        console.warn("FFmpeg processing failed. Falling back to original file.", e);
        return file;
    }
};

/**
 * Processes large files using FFmpeg with better error handling
 */
const processWithFFmpeg = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
    try {
        // Check if FFmpeg is available
        if (typeof FFmpeg === 'undefined') {
            throw new Error('FFmpeg not available in this browser');
        }
        
        if (onProgress) onProgress(0);
        const processedBlob = await extractAudio(file, onProgress);
        return processedBlob;
    } catch (ffmpegError) {
        console.warn("FFmpeg processing failed for large file, falling back to original file:", ffmpegError);
        
        // For very large files that can't be processed, return the original
        // This ensures the transcription service can still work
        return file;
    }
};

