import { loadFFmpeg } from "../services/ffmpegService";
import { fetchFile } from "@ffmpeg/util";

/**
 * Convert any File/Blob to a base64 string (data stripped of prefix).
 */
export const fileToBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

/**
 * Format seconds to M:SS display string.
 */
export const formatTime = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
};

/**
 * Human-readable file size.
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Validate that a file is a supported audio/video type.
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB — FFmpeg handles the rest
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size (${formatFileSize(file.size)}) exceeds 10 GB limit`,
        };
    }

    const hasAudio = file.type.startsWith("audio/") || file.type.startsWith("video/");
    if (!hasAudio) {
        return { valid: false, error: "File must be an audio or video file" };
    }

    return { valid: true };
};

/**
 * Extract raw audio from a video or audio file using FFmpeg (v0.12 API).
 * Output: 16 kHz mono WAV — lossless, good for downstream processing.
 *
 * For Gemini uploads, prefer compressForSpeech() from ffmpegService instead,
 * which produces a much smaller MP3.
 */
export const extractAudio = async (
    file: File | Blob,
    onProgress?: (pct: number) => void
): Promise<Blob> => {
    const ff = await loadFFmpeg();
    const inputName  = `extract_in_${Date.now()}`;
    const outputName = `extract_out_${Date.now()}.wav`;

    const progressHandler = ({ progress }: { progress: number }) => {
        onProgress?.(Math.min(99, Math.round(progress * 100)));
    };
    ff.on("progress", progressHandler);

    try {
        await ff.writeFile(inputName, await fetchFile(file));
        await ff.exec([
            "-i",  inputName,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            "-y",
            outputName,
        ]);
        const data = await ff.readFile(outputName) as Uint8Array;
        return new Blob([data.buffer], { type: "audio/wav" });
    } finally {
        ff.off("progress", progressHandler);
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
        try { await ff.deleteFile(outputName); } catch { /* ignore */ }
    }
};

/**
 * General-purpose media processing entry point.
 * Always runs through FFmpeg — no size-based bypasses.
 * For Gemini, the transcription service calls prepareAudioChunks() directly,
 * so this is mainly used for recording blobs and other providers.
 */
export const processMediaFile = async (
    file: File | Blob,
    _skipConversion: boolean = false,   // kept for API compat, ignored
    onProgress?: (pct: number) => void
): Promise<Blob> => {
    try {
        onProgress?.(0);
        const result = await extractAudio(file, onProgress);
        onProgress?.(100);
        return result;
    } catch (err) {
        console.warn("FFmpeg processing failed, using original file:", err);
        return file;
    }
};
