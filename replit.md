# CaseBuddy Intelligence Engine

## Overview
A high-intelligence transcription and analysis tool for legal professionals. Uses Google Gemini AI to transcribe audio/video, identify speakers, generate summaries, and extract key legal facts and action items.

## Architecture
- **Frontend:** React 18 + TypeScript, built with Vite 7
- **Styling:** Tailwind CSS 4 + Lucide React icons
- **AI:** Google Gemini API (`@google/genai`)
- **Audio processing:** FFmpeg WebAssembly (`@ffmpeg/ffmpeg`) for client-side audio extraction
- **Auth:** Google OAuth2 / Identity Services for Google Drive integration

## Project Layout
```
├── App.tsx                    # Main application logic and state
├── index.tsx                  # React entry point
├── types.ts                   # Global TypeScript interfaces/enums
├── components/
│   ├── AudioRecorder.tsx      # Live recording interface
│   ├── BatchQueue.tsx         # Queue management for multiple files
│   ├── FileUploader.tsx       # File selection + Google Drive picker
│   ├── ProgressIndicator.tsx  # Visual feedback for processing stages
│   └── TranscriptionResult.tsx # AI-generated results viewer
├── services/
│   ├── driveService.ts        # Google Drive API
│   ├── ffmpegService.ts       # Client-side audio/video processing
│   ├── geminiService.ts       # Google GenAI model calls
│   ├── googleAuthService.ts   # OAuth2 and Identity Services
│   ├── transcriptionService.ts # Main transcription pipeline orchestration
│   └── voiceProfileService.ts # Voice profile management
└── utils/
    ├── audioUtils.ts          # File conversions, Base64, FFmpeg helpers
    └── fileUtils.ts           # Download, formatting, print helpers
```

## Environment Variables
The `.env` file contains:
- `VITE_GEMINI_API_KEY` - Google Gemini API key
- `VITE_ASSEMBLYAI_API_KEY` - AssemblyAI API key
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID

## Development
- **Dev server:** `npm run dev` on port 5000
- **Build:** `npm run build` → outputs to `dist/`
- **Tests:** `npm run test` (Vitest)

## Deployment
Configured as a static site: `npm run build` → serve `dist/` directory.

## Key Notes
- All audio/video processing happens client-side via FFmpeg WASM
- Requires COEP/COOP headers for SharedArrayBuffer (FFmpeg) — configured in vite.config.ts
- Google Drive integration uses OAuth2 picker
