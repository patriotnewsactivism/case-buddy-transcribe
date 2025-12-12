import { describe, it, expect } from 'vitest';
import { formatTranscriptWithSpeakers } from './fileUtils';
import type { TranscriptSegment } from '../types';

describe('formatTranscriptWithSpeakers', () => {
  const baseSegments: TranscriptSegment[] = [
    { start: 0, end: 5, speaker: 'spk_0', text: 'Hello there' },
    { start: 6, end: 10, speaker: 'spk_1', text: 'Hi again' },
    { start: 12, end: 15, speaker: 'spk_2', text: 'Follow up' },
  ];

  it('normalizes speaker labels using the provided map for per-line output', () => {
    const formatted = formatTranscriptWithSpeakers(baseSegments, {
      spk_0: 'Alex',
      spk_1: 'Jamie',
      spk_2: 'Alex',
    });

    expect(formatted).toContain('Alex: Hello there');
    expect(formatted).toContain('Jamie: Hi again');
    // Both spk_0 and spk_2 should emit as Alex, not separate diarized names
    const alexLines = formatted.split('\n').filter((line) => line.includes('Alex:')).length;
    expect(alexLines).toBe(2);
  });

  it('groups by canonical speaker names and preserves timestamps per line', () => {
    const formatted = formatTranscriptWithSpeakers(baseSegments, {
      spk_0: 'Alex',
      spk_1: 'Jamie',
      spk_2: 'Alex',
    }, { groupBySpeaker: true, includeTimestamps: true });

    // Should only surface two speakers (Alex + Jamie) even though diarization found 3
    const headerLines = formatted
      .split('\n')
      .filter((line) => /\[\d+:\d{2}\]\s.+:/.test(line));
    const uniqueSpeakers = new Set(headerLines.map((line) => line.split('] ')[1]?.replace(':', '')));
    expect(uniqueSpeakers.size).toBe(2);
    expect(uniqueSpeakers.has('Alex')).toBe(true);
    expect(uniqueSpeakers.has('Jamie')).toBe(true);
    // Each grouped block should keep per-line timestamps so we can match utterances to time
    expect(formatted).toContain('[0:00] Alex:');
    expect(formatted).toContain('[0:00] Hello there');
    expect(formatted).toContain('[0:12] Follow up');
  });
});
