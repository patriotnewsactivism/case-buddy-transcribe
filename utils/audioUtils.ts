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
    // Always extract audio from video files for better performance and smaller file size
    if (file.type.startsWith('video/')) {
        try {
            console.log(`Extracting audio from video file: ${file.name}`);
            
            // Create a video element to extract audio
            const videoElement = document.createElement('video');
            videoElement.src = URL.createObjectURL(file);
            
            await new Promise<void>((resolve, reject) => {
                videoElement.addEventListener('loadedmetadata', () => resolve());
                videoElement.addEventListener('error', () => reject(new Error('Failed to load video')));
            });
            
            // Create an audio context and media element source
            const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error('AudioContext not supported in this browser');
            }
            const audioCtx = new AudioContextClass();
            const mediaSource = audioCtx.createMediaElementSource(videoElement);
            
            // Create an offline context to render the audio
            const targetRate = 16000; // Standard for speech AI
            const numChannels = 1; // Mono is sufficient for transcription and reduces file size
            const offlineCtx = new OfflineAudioContext(numChannels, videoElement.duration * targetRate, targetRate);
            
            mediaSource.connect(offlineCtx.destination);
            
            // Start playing and render
            videoElement.play();
            const renderedBuffer = await offlineCtx.startRendering();
            
            // Encode to WAV
            const wavBlob = encodeWAV(renderedBuffer.getChannelData(0), targetRate, numChannels);
            console.log(`Audio extraction complete. File size reduced from ${(file.size / 1024 / 1024).toFixed(2)}MB to ${(wavBlob.size / 1024 / 1024).toFixed(2)}MB`);
            
            URL.revokeObjectURL(videoElement.src);
            return wavBlob;
            
        } catch (e) {
            console.warn("Client-side audio extraction from video failed. Falling back to original file.", e);
            return file; 
        }
    }

    // For audio files, apply optimizations if needed
    if (file.type.startsWith('audio/')) {
        // Small audio files (< 10MB) don't need processing
        if (file.size < 10 * 1024 * 1024) {
            return file;
        }

        // For larger audio files, optimize
        try {
            console.log(`Optimizing audio file: ${file.name}`);
            
            const arrayBuffer = await file.arrayBuffer();
            const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error('AudioContext not supported in this browser');
            }
            const audioCtx = new AudioContextClass();
            
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            const numChannels = 1; // Convert to mono for smaller file size
            const targetRate = 16000; // Standard for speech AI
            
            const offlineCtx = new OfflineAudioContext(numChannels, audioBuffer.duration * targetRate, targetRate);
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineCtx.destination);
            source.start();
            
            const renderedBuffer = await offlineCtx.startRendering();
            
            const wavBlob = encodeWAV(renderedBuffer.getChannelData(0), targetRate, numChannels);
            console.log(`Audio optimization complete. File size reduced from ${(file.size / 1024 / 1024).toFixed(2)}MB to ${(wavBlob.size / 1024 / 1024).toFixed(2)}MB`);
            
            return wavBlob;
            
        } catch (e) {
            console.warn("Client-side audio optimization failed. Falling back to original file.", e);
            return file; 
        }
    }

    // If not an audio or video file, return as is (though validation should prevent this)
    console.warn(`File type ${file.type} is not audio or video. Returning as is.`);
    return file;
};