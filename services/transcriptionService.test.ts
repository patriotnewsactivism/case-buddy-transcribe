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
  it('maps utterances into transcript segments with seconds and prefers segment text', () => {
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
    expect(result.text).toBe('First line Second line');
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

  it('falls back to words array when utterances are missing', () => {
    const response = {
      ...baseTranscript,
      text: '',
      words: [
        { start: 0, end: 500, speaker: 1, text: 'Hi' },
        { start: 600, end: 1200, speaker: 1, punctuated_word: 'there' },
        { start: 1500, end: 2000, speaker: 2, text: 'team' },
      ],
    };

    const result = mapAssemblyResponseToResult(response);

    expect(result.segments).toEqual([
      { start: 0, end: 0.5, speaker: 'Speaker 1', text: 'Hi there' },
      { start: 1.5, end: 2, speaker: 'Speaker 2', text: 'team' },
    ]);
    expect(result.text).toBe('Hi there team');
  });

  it('ignores placeholder transcript text when segment content is available', () => {
    const response = {
      ...baseTranscript,
      text: 'AssemblyAI Support pending update to JSON schema',
      words: [
        { start: 0, end: 500, speaker: 1, text: 'Actual' },
        { start: 600, end: 1200, speaker: 1, text: 'transcript' },
      ],
    };

    const result = mapAssemblyResponseToResult(response);

    expect(result.text).toBe('Actual transcript');
  });

  it('drops placeholder transcript text when no segment content exists', () => {
    const response = {
      ...baseTranscript,
      text: 'AssemblyAI Support pending update to JSON schema',
      utterances: [],
      words: [],
    };

    const result = mapAssemblyResponseToResult(response);

    expect(result.segments).toBeUndefined();
    expect(result.text).toBe('');
  });
});
