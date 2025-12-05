export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the Data-URI prefix (e.g., "data:audio/mp3;base64,")
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

// --- AUDIO EXTRACTION & CONVERSION UTILS ---

/**
 * Writes a string to a DataView (helper for WAV encoding)
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Encodes raw audio samples to a standard 16-bit PCM WAV File.
 * Supports Mono (1 channel) or Stereo (2 channels).
 * @param samples - Interleaved Float32 samples (L, R, L, R...) if stereo
 * @param sampleRate - Sample rate (default 16000)
 * @param numChannels - Number of channels (1 or 2)
 */
export const encodeWAV = (samples: Float32Array, sampleRate: number = 16000, numChannels: number = 1) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};

/**
 * Processes a large Audio or Video file.
 * 
 * UPDATE: Added `skipConversion` for Gemini.
 * Gemini natively supports video files. Converting video to audio in the browser
 * is extremely CPU intensive and slow for large files. Skipping this step
 * makes the process 10x faster.
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false): Promise<Blob> => {
    // 0. SPEED PATH: If provider supports video (Gemini), return immediately.
    if (skipConversion) {
      return file;
    }

    // 1. FAST PATH: Small audio files (< 10MB) don't need processing
    if (file.type.startsWith('audio/') && file.size < 10 * 1024 * 1024) {
        return file;
    }

    // 2. SAFETY LIMIT: Browser Memory Cap (~1.8 GB)
    const MAX_SAFE_SIZE = 1.8 * 1024 * 1024 * 1024; // 1.8 GB
    
    if (file.size > MAX_SAFE_SIZE) {
        console.warn(`File size exceeds browser memory safety limit. Uploading original file directly.`);
        return file;
    }

    // 3. CONVERSION PATH: Extract audio from video/audio file
    // Only runs if we are using a provider that strictly needs Audio (like Whisper/AssemblyAI limit checks)
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // This decodes the raw audio data (CPU intensive)
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Determine channels (Keep Stereo if available for better AI Diarization)
        const numChannels = audioBuffer.numberOfChannels >= 2 ? 2 : 1;
        
        // Resample to 16kHz (Standard for Speech AI)
        const targetRate = 16000;
        const offlineCtx = new OfflineAudioContext(numChannels, audioBuffer.duration * targetRate, targetRate);
        
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        const renderedBuffer = await offlineCtx.startRendering();
        
        // Prepare samples (Interleave if Stereo)
        let finalSamples: Float32Array;
        
        if (numChannels === 2) {
            const left = renderedBuffer.getChannelData(0);
            const right = renderedBuffer.getChannelData(1);
            finalSamples = new Float32Array(left.length + right.length);
            for (let i = 0; i < left.length; i++) {
                finalSamples[i * 2] = left[i];
                finalSamples[i * 2 + 1] = right[i];
            }
        } else {
            finalSamples = renderedBuffer.getChannelData(0);
        }
        
        // Encode to WAV
        return encodeWAV(finalSamples, targetRate, numChannels);

    } catch (e) {
        console.warn("Client-side audio conversion failed (likely Out of Memory). Falling back to original file upload.", e);
        return file; 
    }
};