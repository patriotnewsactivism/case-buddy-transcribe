import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const ffmpeg = new FFmpeg();

const loadFFmpeg = async (): Promise<void> => {
    if (!ffmpeg.isLoaded()) {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
    }
};

export const extractAudio = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
    try {
        await loadFFmpeg();

        ffmpeg.FS("writeFile", "input", await fetchFile(file));

        if (onProgress) {
            ffmpeg.on("progress", ({ progress }) => {
                onProgress(Math.round(progress * 100));
            });
        }

        const isVideo = file.type.startsWith('video/');
        const outputFormat = isVideo ? 'mp3' : 'wav';

        await ffmpeg.run(
            "-i", "input",
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            "-y",
            `output.${outputFormat}`
        );

        const outputData = ffmpeg.FS("readFile", `output.${outputFormat}`);

        ffmpeg.FS("unlink", "input");
        ffmpeg.FS("unlink", `output.${outputFormat}`);

        return new Blob([outputData.buffer], { type: `audio/${outputFormat}` });
    } catch (error) {
        console.error("FFmpeg audio extraction failed:", error);
        throw error;
    }
};

export const processMediaFile = async (file: File, skipConversion: boolean = false, onProgress?: (pct: number) => void): Promise<Blob> => {
    if (skipConversion) {
        return file;
    }

    if (file.type.startsWith('audio/') && file.size < 2 * 1024 * 1024) {
        return file;
    }

    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;
    if (file.size > LARGE_FILE_THRESHOLD) {
        console.log(`Large file detected (${(file.size / 1024 / 1024).toFixed(1)}MB). Using FFmpeg for processing...`);
        return await processWithFFmpeg(file, onProgress);
    }

    const MAX_SAFE_SIZE = 1.8 * 1024 * 1024 * 1024;

    if (file.size > MAX_SAFE_SIZE) {
        console.warn(`File size exceeds browser memory safety limit (${(file.size / 1024 / 1024).toFixed(1)}MB). Uploading original file directly.`);
        return file;
    }

    try {
        if (onProgress) onProgress(0);
        const processedBlob = await extractAudio(file, onProgress);
        return processedBlob;
    } catch (e) {
        console.warn("FFmpeg processing failed. Falling back to original file.", e);
        return file;
    }
};

const processWithFFmpeg = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
    try {
        if (typeof FFmpeg === 'undefined') {
            throw new Error('FFmpeg not available in this browser');
        }

        if (onProgress) onProgress(0);
        const processedBlob = await extractAudio(file, onProgress);
        return processedBlob;
    } catch (ffmpegError) {
        console.warn("FFmpeg processing failed for large file, falling back to original file:", ffmpegError);
        return file;
    }
};

export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const fileToBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export const formatTime = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        };
    }

    const hasAudio = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!hasAudio) {
        return {
            valid: false,
            error: 'File must be an audio or video file'
        };
    }

    return { valid: true };
};
