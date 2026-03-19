import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

/**
 * Initializes and loads the FFmpeg WASM instance.
 */
export const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpeg) return ffmpeg;

    ffmpeg = new FFmpeg();
    
    // Using unpkg for the WASM binaries (standard for FFmpeg.wasm)
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
};

/**
 * High-performance audio extraction from any video or audio file.
 * Uses FFmpeg to copy the audio stream without re-encoding when possible,
 * or re-encodes to a light-weight 16kHz Mono WAV (Standard for AI).
 */
export const extractAudio = async (file: File, onProgress?: (pct: number) => void): Promise<Blob> => {
    const instance = await loadFFmpeg();
    const inputName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
    const outputName = 'output.wav';

    // 1. Write the file to FFmpeg's virtual FS
    await instance.writeFile(inputName, await fetchFile(file));

    if (onProgress) {
        instance.on('progress', ({ progress }) => {
            onProgress(Math.round(progress * 100));
        });
    }

    // 2. Run FFmpeg command:
    // -i [input] : input file
    // -vn        : skip video (disable video stream)
    // -acodec pcm_s16le : standard 16-bit PCM for AI
    // -ar 16000  : resample to 16kHz (Gold standard for Speech AI)
    // -ac 1      : mono (smaller file size, faster upload, better for many AI models)
    await instance.exec([
        '-i', inputName,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        outputName
    ]);

    // 3. Read the output from virtual FS
    const data = await instance.readFile(outputName);
    
    // Clean up
    await instance.deleteFile(inputName);
    await instance.deleteFile(outputName);

    return new Blob([data], { type: 'audio/wav' });
};
