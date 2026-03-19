import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const CHUNK_DURATION_SEC = 600;   // 10 minutes per chunk
const CHUNK_OVERLAP_SEC  = 5;     // 5 second overlap to avoid cutting words
const CHUNK_THRESHOLD_SEC = 900;  // chunk files longer than 15 minutes

export type FFmpegProgressCallback = (pct: number, stage: string) => void;

const getInstance = (): FFmpeg => {
    if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
    return ffmpegInstance;
};

export const loadFFmpeg = async (): Promise<FFmpeg> => {
    const ff = getInstance();
    if (ff.loaded) return ff;
    if (loadPromise) { await loadPromise; return ff; }

    loadPromise = (async () => {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ff.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
    })();

    await loadPromise;
    return ff;
};

/**
 * Parse duration from ffmpeg log output (e.g. "Duration: 01:23:45.67")
 */
const parseDurationFromLog = (log: string): number | null => {
    const match = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
};

/**
 * Get audio duration in seconds by running FFmpeg with -f null output.
 */
export const getAudioDuration = async (file: File | Blob): Promise<number> => {
    const ff = await loadFFmpeg();
    const inputName = `dur_input_${Date.now()}`;
    let durationSec = 0;

    const logLines: string[] = [];
    const logHandler = ({ message }: { message: string }) => {
        logLines.push(message);
        const parsed = parseDurationFromLog(message);
        if (parsed !== null) durationSec = parsed;
    };
    ff.on("log", logHandler);

    try {
        await ff.writeFile(inputName, await fetchFile(file));
        await ff.exec(["-i", inputName, "-f", "null", "-"]);
    } catch {
        // FFmpeg always "fails" with -f null, that's expected — duration is in the log
        const fullLog = logLines.join("\n");
        const parsed = parseDurationFromLog(fullLog);
        if (parsed !== null) durationSec = parsed;
    } finally {
        ff.off("log", logHandler);
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    }

    return durationSec;
};

/**
 * Compress any audio/video to a speech-optimised mono MP3 at 32 kbps, 16 kHz.
 * This reduces a 1-hour WAV (~110 MB) to ~14 MB — well within Gemini File API limits.
 */
export const compressForSpeech = async (
    file: File | Blob,
    onProgress?: FFmpegProgressCallback
): Promise<Blob> => {
    const ff = await loadFFmpeg();
    const inputName  = `compress_in_${Date.now()}`;
    const outputName = `compress_out_${Date.now()}.mp3`;

    onProgress?.(0, "Loading FFmpeg...");

    const progressHandler = ({ progress }: { progress: number }) => {
        onProgress?.(Math.min(99, Math.round(progress * 100)), "Compressing audio...");
    };
    ff.on("progress", progressHandler);

    try {
        onProgress?.(2, "Writing file to FFmpeg...");
        await ff.writeFile(inputName, await fetchFile(file));

        onProgress?.(5, "Compressing audio (32kbps mono)...");
        await ff.exec([
            "-i",  inputName,
            "-vn",                        // strip video
            "-c:a", "libmp3lame",         // MP3 encoder
            "-b:a", "32k",               // 32 kbps — good enough for speech
            "-ar",  "16000",             // 16 kHz sample rate
            "-ac",  "1",                 // mono
            "-y",
            outputName,
        ]);

        const data = await ff.readFile(outputName) as Uint8Array;
        return new Blob([data.buffer], { type: "audio/mpeg" });
    } finally {
        ff.off("progress", progressHandler);
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
        try { await ff.deleteFile(outputName); } catch { /* ignore */ }
    }
};

/**
 * Extract a specific time slice from audio (already loaded as a Blob).
 * Used for chunking long recordings.
 */
const extractChunk = async (
    ff: FFmpeg,
    sourceBlob: Blob,
    startSec: number,
    durationSec: number,
    chunkIndex: number
): Promise<{ blob: Blob; startSec: number }> => {
    const inputName  = `chunk_in_${chunkIndex}_${Date.now()}`;
    const outputName = `chunk_out_${chunkIndex}_${Date.now()}.mp3`;

    try {
        await ff.writeFile(inputName, await fetchFile(sourceBlob));
        await ff.exec([
            "-ss", String(startSec),
            "-t",  String(durationSec),
            "-i",  inputName,
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", "32k",
            "-ar",  "16000",
            "-ac",  "1",
            "-y",
            outputName,
        ]);
        const data = await ff.readFile(outputName) as Uint8Array;
        return {
            blob: new Blob([data.buffer], { type: "audio/mpeg" }),
            startSec,
        };
    } finally {
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
        try { await ff.deleteFile(outputName); } catch { /* ignore */ }
    }
};

/**
 * Prepare audio for Gemini transcription:
 * 1. Always compress to 32 kbps mono MP3 (removes practical size limits).
 * 2. If the result is still > 15 min, split into overlapping chunks.
 *
 * Returns an array of { blob, startSec } objects.
 * Single-chunk recordings return an array of length 1 with startSec = 0.
 */
export const prepareAudioChunks = async (
    file: File | Blob,
    onProgress?: FFmpegProgressCallback
): Promise<Array<{ blob: Blob; startSec: number }>> => {
    const ff = await loadFFmpeg();

    // Step 1 — compress the whole file
    onProgress?.(0, "Initialising FFmpeg...");
    const compressed = await compressForSpeech(file, (pct, stage) => {
        onProgress?.(Math.round(pct * 0.6), stage);   // 0–60 % of overall
    });

    // Step 2 — measure compressed duration
    onProgress?.(62, "Measuring duration...");
    const duration = await getAudioDuration(compressed);

    if (duration <= CHUNK_THRESHOLD_SEC || duration === 0) {
        onProgress?.(100, "Ready");
        return [{ blob: compressed, startSec: 0 }];
    }

    // Step 3 — split into overlapping chunks
    const chunks: Array<{ blob: Blob; startSec: number }> = [];
    let offset = 0;
    let chunkIdx = 0;

    while (offset < duration) {
        const chunkDur  = Math.min(CHUNK_DURATION_SEC + CHUNK_OVERLAP_SEC, duration - offset);
        const pct = 63 + Math.round((offset / duration) * 35);   // 63–98 %
        onProgress?.(pct, `Slicing chunk ${chunkIdx + 1}...`);

        const chunk = await extractChunk(ff, compressed, offset, chunkDur, chunkIdx);
        chunks.push(chunk);

        offset += CHUNK_DURATION_SEC;
        chunkIdx++;
    }

    onProgress?.(100, "Chunks ready");
    return chunks;
};
