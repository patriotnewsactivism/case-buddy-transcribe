import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const CHUNK_DURATION_SEC = 600;   // 10 minutes per chunk
const CHUNK_OVERLAP_SEC  = 5;     // 5 second overlap to avoid cutting words
const CHUNK_THRESHOLD_SEC = 900;  // chunk files longer than 15 minutes

// Mirrors of the ffmpeg-core WASM bundle. Must be the ESM build: @ffmpeg/ffmpeg
// always spins up its worker as `type: "module"`, which means `importScripts()`
// (used to load the UMD build) is unavailable and throws inside that worker —
// every load falls through to `await import(coreURL)`, which only produces a
// usable `createFFmpegCore` export when coreURL points at the ESM build. The
// UMD build has no `export default`, so importing it silently resolves to an
// empty module and every load fails with "failed to import ffmpeg-core.js".
//
// Mobile networks / corporate proxies also occasionally block or fail to reach
// unpkg, so a second CDN mirror gives large-file transcription a real chance
// to succeed even when the first is unreachable.
const FFMPEG_CORE_MIRRORS = [
    "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm",
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm",
];

export type FFmpegProgressCallback = (pct: number, stage: string) => void;

const getInstance = (): FFmpeg => {
    if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
    return ffmpegInstance;
};

const loadFromMirror = async (ff: FFmpeg, baseURL: string): Promise<void> => {
    await Promise.race([
        (async () => {
            await ff.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
            });
        })(),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`FFmpeg core failed to load from ${baseURL} within 45s.`)), 45000)
        ),
    ]);
};

export const loadFFmpeg = async (): Promise<FFmpeg> => {
    const ff = getInstance();
    if (ff.loaded) return ff;

    // If a load is already in flight, piggyback on it — but if it fails,
    // clear it so the NEXT call gets a fresh attempt instead of replaying
    // the same dead rejection forever (this previously caused every file
    // after the first failure in a batch to fail instantly for the rest
    // of the session).
    if (loadPromise) {
        try {
            await loadPromise;
            return ff;
        } catch (err) {
            loadPromise = null;
            throw err;
        }
    }

    loadPromise = (async () => {
        let lastError: unknown;
        for (const baseURL of FFMPEG_CORE_MIRRORS) {
            try {
                await loadFromMirror(ff, baseURL);
                return;
            } catch (err) {
                lastError = err;
            }
        }
        throw new Error(
            `FFmpeg failed to load from all mirrors — check your network connection. Last error: ${
                lastError instanceof Error ? lastError.message : String(lastError)
            }`
        );
    })();

    try {
        await loadPromise;
    } catch (err) {
        loadPromise = null; // allow a retry on the next call instead of staying permanently broken
        throw err;
    }
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
 * Get audio duration in seconds by running FFmpeg with -f null output on a
 * file that has ALREADY been written into the FFmpeg FS under `inputName`.
 */
const getDurationOfLoadedFile = async (ff: FFmpeg, inputName: string): Promise<number> => {
    let durationSec = 0;
    const logLines: string[] = [];
    const logHandler = ({ message }: { message: string }) => {
        logLines.push(message);
        const parsed = parseDurationFromLog(message);
        if (parsed !== null) durationSec = parsed;
    };
    ff.on("log", logHandler);

    try {
        await ff.exec(["-i", inputName, "-f", "null", "-"]);
    } catch {
        // FFmpeg always "fails" with -f null, that's expected — duration is in the log
        const fullLog = logLines.join("\n");
        const parsed = parseDurationFromLog(fullLog);
        if (parsed !== null) durationSec = parsed;
    } finally {
        ff.off("log", logHandler);
    }

    return durationSec;
};

/**
 * Get audio duration in seconds for a standalone file/blob (writes + deletes
 * its own copy). Used by callers that just want duration, not chunking.
 */
export const getAudioDuration = async (file: File | Blob): Promise<number> => {
    const ff = await loadFFmpeg();
    const inputName = `dur_input_${Date.now()}`;
    await ff.writeFile(inputName, await fetchFile(file));
    try {
        return await getDurationOfLoadedFile(ff, inputName);
    } finally {
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    }
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
 * Extract + compress a specific time slice directly from the ORIGINAL
 * (uncompressed) source that's already sitting in the FFmpeg FS under
 * `inputName`. Slicing straight from the raw source — instead of first
 * transcoding the whole file to MP3 and then re-slicing that — means FFmpeg
 * only ever has to decode one ~10-minute window at a time, which keeps peak
 * WASM memory bounded regardless of how long the source recording is. That
 * matters most on mobile browsers, where large (100MB+) video files were
 * previously OOM-crashing the single full-file compression pass.
 */
const extractChunk = async (
    ff: FFmpeg,
    inputName: string,
    startSec: number,
    durationSec: number,
    chunkIndex: number
): Promise<{ blob: Blob; startSec: number }> => {
    const outputName = `chunk_out_${chunkIndex}_${Date.now()}.mp3`;

    try {
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
        try { await ff.deleteFile(outputName); } catch { /* ignore */ }
    }
};

/**
 * Prepare audio for transcription (Deepgram / Groq / Gemini all funnel
 * through this):
 *
 * 1. Write the source file into the FFmpeg FS exactly once.
 * 2. Measure its duration.
 * 3. If it's under the chunk threshold, compress the whole thing to one
 *    32 kbps mono MP3 and return a single chunk.
 * 4. Otherwise, slice directly off the original source in ~10-minute
 *    overlapping windows (see extractChunk for why slicing-then-compressing
 *    beats compressing-then-slicing for large files).
 *
 * Returns an array of { blob, startSec } objects.
 * Single-chunk recordings return an array of length 1 with startSec = 0.
 */
export const prepareAudioChunks = async (
    file: File | Blob,
    onProgress?: FFmpegProgressCallback
): Promise<Array<{ blob: Blob; startSec: number }>> => {
    const ff = await loadFFmpeg();
    const inputName = `prep_input_${Date.now()}`;

    onProgress?.(0, "Initialising FFmpeg...");

    try {
        onProgress?.(2, "Writing file to FFmpeg...");
        await ff.writeFile(inputName, await fetchFile(file));

        onProgress?.(5, "Measuring duration...");
        const duration = await getDurationOfLoadedFile(ff, inputName);

        if (duration <= CHUNK_THRESHOLD_SEC || duration === 0) {
            const progressHandler = ({ progress }: { progress: number }) => {
                onProgress?.(10 + Math.min(89, Math.round(progress * 89)), "Compressing audio...");
            };
            ff.on("progress", progressHandler);
            const outputName = `compress_out_${Date.now()}.mp3`;
            try {
                onProgress?.(10, "Compressing audio (32kbps mono)...");
                await ff.exec([
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
                onProgress?.(100, "Ready");
                return [{ blob: new Blob([data.buffer], { type: "audio/mpeg" }), startSec: 0 }];
            } finally {
                ff.off("progress", progressHandler);
                try { await ff.deleteFile(outputName); } catch { /* ignore */ }
            }
        }

        // Split into overlapping chunks, slicing directly off the raw source.
        const chunks: Array<{ blob: Blob; startSec: number }> = [];
        let offset = 0;
        let chunkIdx = 0;

        while (offset < duration) {
            const chunkDur = Math.min(CHUNK_DURATION_SEC + CHUNK_OVERLAP_SEC, duration - offset);
            const pct = 10 + Math.round((offset / duration) * 88);   // 10–98 %
            onProgress?.(pct, `Slicing chunk ${chunkIdx + 1}...`);

            const chunk = await extractChunk(ff, inputName, offset, chunkDur, chunkIdx);
            chunks.push(chunk);

            offset += CHUNK_DURATION_SEC;
            chunkIdx++;
        }

        onProgress?.(100, "Chunks ready");
        return chunks;
    } finally {
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    }
};
