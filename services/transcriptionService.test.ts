import { describe, expect, it } from 'vitest';
import { mapAssemblyResponseToResult } from './transcriptionService';
import { TranscriptionProvider } from '../types';

const baseTranscript = {
  id: 'test-id',
  status: 'completed',
  text: 'Hello world',
  language_code: 'en',
};

describe('mapAssemblyResponseToResult', () => {
  it('maps utterances into transcript segments with seconds', () => {
    const response = {
      ...baseTranscript,
      utterances: [
        { start: 1200, end: 2400, speaker: 1, text: 'First line' },
        { start: 2500, end: 4000, speaker: 'A', text: 'Second line' },
      ],
    };

    const result = mapAssemblyResponseToResult(response);

    expect(result.segments).toEqual([
      { start: 1.2, end: 2.4, speaker: 'Speaker 1', text: 'First line' },
      { start: 2.5, end: 4, speaker: 'Speaker A', text: 'Second line' },
    ]);
    expect(result.text).toBe('Hello world');
    expect(result.detectedLanguage).toBe('en');
    expect(result.providerUsed).toBe(TranscriptionProvider.ASSEMBLYAI);
  });

  it('handles missing utterances gracefully', () => {
    const response = { ...baseTranscript };
    const result = mapAssemblyResponseToResult(response);

    expect(result.segments).toBeUndefined();
    expect(result.text).toBe('Hello world');
    expect(result.providerUsed).toBe(TranscriptionProvider.ASSEMBLYAI);
  });
});
