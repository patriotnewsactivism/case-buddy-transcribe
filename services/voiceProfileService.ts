/**
 * Voice Profile Service
 * Manages learned speaker names and voice profiles for future transcriptions
 */

export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string;
  usageCount: number;
  // Future: audio fingerprint data for actual voice recognition
  // fingerprint?: string;
}

const STORAGE_KEY = 'voice_profiles';
const SPEAKER_MAP_KEY = 'speaker_name_map';

/**
 * Get all saved voice profiles
 */
export const getVoiceProfiles = (): VoiceProfile[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load voice profiles:', e);
  }
  return [];
};

/**
 * Save a new voice profile or update existing one
 */
export const saveVoiceProfile = (name: string): VoiceProfile => {
  const profiles = getVoiceProfiles();
  const existingIndex = profiles.findIndex(p => p.name.toLowerCase() === name.toLowerCase());

  if (existingIndex >= 0) {
    // Update existing profile
    profiles[existingIndex].lastUsed = new Date().toISOString();
    profiles[existingIndex].usageCount++;
  } else {
    // Create new profile
    const newProfile: VoiceProfile = {
      id: Math.random().toString(36).substring(7),
      name,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      usageCount: 1,
    };
    profiles.push(newProfile);
  }

  // Sort by usage count (most used first)
  profiles.sort((a, b) => b.usageCount - a.usageCount);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  return profiles.find(p => p.name.toLowerCase() === name.toLowerCase())!;
};

/**
 * Delete a voice profile
 */
export const deleteVoiceProfile = (id: string): void => {
  const profiles = getVoiceProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

/**
 * Get speaker name suggestions based on saved profiles
 */
export const getSpeakerSuggestions = (query: string = ''): string[] => {
  const profiles = getVoiceProfiles();

  if (!query) {
    // Return top 10 most used speakers
    return profiles.slice(0, 10).map(p => p.name);
  }

  // Filter by query
  const lowerQuery = query.toLowerCase();
  return profiles
    .filter(p => p.name.toLowerCase().includes(lowerQuery))
    .slice(0, 5)
    .map(p => p.name);
};

/**
 * Record speaker usage (call when speaker is assigned/confirmed)
 */
export const recordSpeakerUsage = (speakerMap: Record<string, string>): void => {
  // Save all renamed speakers to profiles
  Object.values(speakerMap).forEach(name => {
    if (name && name.trim()) {
      saveVoiceProfile(name.trim());
    }
  });
};

/**
 * Persist speaker name overrides so common mappings are reused.
 */
export const persistSpeakerMap = (speakerMap: Record<string, string>): void => {
  try {
    const existingRaw = localStorage.getItem(SPEAKER_MAP_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) as Record<string, string> : {};
    const merged = { ...existing, ...speakerMap };
    localStorage.setItem(SPEAKER_MAP_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to persist speaker map', e);
  }
};

/**
 * Load previously saved speaker overrides.
 */
export const getSavedSpeakerMap = (): Record<string, string> => {
  try {
    const stored = localStorage.getItem(SPEAKER_MAP_KEY);
    return stored ? JSON.parse(stored) as Record<string, string> : {};
  } catch (e) {
    console.error('Failed to load speaker map', e);
    return {};
  }
};

/**
 * Get recent speakers (for quick selection)
 */
export const getRecentSpeakers = (limit: number = 5): string[] => {
  const profiles = getVoiceProfiles();
  return profiles
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, limit)
    .map(p => p.name);
};
