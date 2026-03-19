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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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
 * Processes media files with optimized paths for different file sizes and types
 * Uses FFmpeg for large files to avoid browser memory issues
 */
export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    // 0. SPEED PATH: If the provider specifically wants raw video (e.g. Gemini File API)
    if (skipConversion) {
        return file;
    }

    // 1. FAST PATH: SMALL AUDIO FILES
    // For very small audio files, we can just return the original if it's already audio.
    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    // 2. LARGE FILE PATH: Use FFmpeg for files > 10MB to ensure consistent processing
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
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

/**
 * Gets file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates if a file is suitable for audio processing
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size (max 2GB for safety)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    // Check if file has audio or video content
    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
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

