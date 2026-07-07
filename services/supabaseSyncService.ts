import { TranscriptionResult } from "../types";

// Bridges completed transcripts into the shared case-companion Supabase
// project (the same backend used by case-companion, DiscoveryLens, and
// AI-Law-Partner) via a dedicated Edge Function. This app has no user-level
// Supabase Auth of its own, so the function does the write with the service
// role and case linkage is by explicit case_id selection, not auth.uid().
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/transcribe-app-sync`;

export interface CaseOption {
  id: string;
  name: string;
  client_name: string;
  case_number: string | null;
  status: string;
  case_type: string;
  updated_at: string;
}

const isConfigured = (): boolean => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

export const isSupabaseSyncConfigured = isConfigured;

const authHeaders = (): HeadersInit => ({
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  apikey: SUPABASE_ANON_KEY,
});

export const listCases = async (): Promise<CaseOption[]> => {
  if (!isConfigured()) {
    throw new Error("Supabase sync is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).");
  }

  const res = await fetch(`${FUNCTION_URL}?action=list`, { headers: authHeaders() });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to load cases: ${res.status} ${errText || res.statusText}`);
  }

  const data = await res.json();
  return data.cases || [];
};

export const syncTranscriptToCase = async (
  caseId: string,
  fileName: string,
  result: TranscriptionResult
): Promise<void> => {
  if (!isConfigured()) {
    throw new Error("Supabase sync is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).");
  }

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      case_id: caseId,
      file_name: fileName,
      transcript_text: result.text,
      duration_seconds: result.segments?.length ? Math.round(result.segments[result.segments.length - 1].end) : undefined,
      provider: result.providerUsed,
      segments: result.segments,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to sync transcript: ${res.status} ${errText || res.statusText}`);
  }
};
