<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1tlopaIWR4fc9X31hYmCU_FYoo-KmrQX_

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` (or `.env`) and set the required secrets.
3. Run the app:
   `npm run dev`

## Deployment

This project expects secrets to be injected at build time from a secure store (Firebase environment config for Cloud Functions or your CI/CD secret manager). Never hard-code or expose secrets via `VITE_`-prefixed variables.

Required environment variables:

- `GEMINI_API_KEY` – Google Gemini API key used for transcription. Keep this in Secret Manager or CI secrets.
- `GOOGLE_DRIVE_CLIENT_ID` – OAuth client ID for Google Drive picker uploads.
- `GOOGLE_DRIVE_API_KEY` – Google API key for Drive picker.
- `OPENAI_API_KEY` – Optional: OpenAI Whisper key when using that provider.
- `ASSEMBLYAI_API_KEY` – Optional: AssemblyAI key when using that provider.

When deploying with Cloud Build/Run, configure the secrets in Secret Manager and inject them into the build using Cloud Build `availableSecrets`, or populate Firebase function environment variables so the build can read them. The production container must be built with these environment variables present; no secrets should live in source control or metadata.json.
