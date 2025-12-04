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
 * This is essential for creating universally compatible audio files from raw data.
 */
export const encodeWAV = (samples: Float32Array, sampleRate: number = 16000) => {
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
  // channel count (mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
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
 * 1. Decodes the media using the Browser's Native Audio Engine.
 * 2. Downsamples to 16kHz Mono (Ideal for Speech Recognition).
 * 3. Returns a compact WAV Blob.
 */
export const processMediaFile = async (file: File): Promise<Blob> => {
    // If it's a small audio file (under 10MB), just use it directly to save time.
    if (file.type.startsWith('audio/') && file.size < 10 * 1024 * 1024) {
        return file;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // This step strips video and decodes audio to raw PCM
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Offline rendering to resample to 16kHz Mono
        const targetRate = 16000;
        const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * targetRate, targetRate);
        
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        const renderedBuffer = await offlineCtx.startRendering();
        const channelData = renderedBuffer.getChannelData(0); // Get Mono Channel
        
        return encodeWAV(channelData, targetRate);
    } catch (e) {
        console.warn("Fast audio conversion failed, falling back to original file.", e);
        return file; // Fallback to original if decoding fails (e.g. corrupt header)
    }
};