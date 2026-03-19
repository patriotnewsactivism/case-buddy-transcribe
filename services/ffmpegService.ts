import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Initialize FFmpeg
const ffmpeg = new FFmpeg();

// Load FFmpeg core
const loadFFmpeg = async (): Promise<void> => {
    if (!ffmpeg.isLoaded()) {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm", "application/wasm"),
        });
    }
};

/**
 * Extracts audio from video files or optimizes audio files using FFmpeg
 */
export const extractAudio = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
    try {
        await loadFFmpeg();
        
        // Write the file to FFmpeg's virtual file system
        ffmpeg.FS("writeFile", "input", await fetchFile(file));
        
        // Set up progress monitoring
        if (onProgress) {
            ffmpeg.on("progress", ({ progress }) => {
                onProgress(Math.round(progress * 100));
            });
        }
        
        // Determine output format based on input
        const isVideo = file.type.startsWith('video/');
        const outputFormat = isVideo ? 'mp3' : 'wav';
        
        // Execute FFmpeg command
        await ffmpeg.run(
            "-i", "input",
            "-vn", // Disable video
            "-acodec", "pcm_s16le", // Use 16-bit PCM for better quality
            "-ar", "16000", // 16kHz sample rate (good for speech)
            "-ac", "1", // Mono channel
            "-y", // Overwrite output file
            `output.${outputFormat}`
        );
        
        // Read the output file
        const outputData = ffmpeg.FS("readFile", `output.${outputFormat}`);
        
        // Clean up
        ffmpeg.FS("unlink", "input");
        ffmpeg.FS("unlink", `output.${outputFormat}`);
        
        // Create blob and return
        return new Blob([outputData.buffer], { type: `audio/${outputFormat}` });
    } catch (error) {
        console.error("FFmpeg audio extraction failed:", error);
        throw error;
    }
};

/**
 * Processes large files using FFmpeg with better error handling
 */
export const processWithFFmpeg = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
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
