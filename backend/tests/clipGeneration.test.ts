import { selectCleanTurns } from '../src/services/pipeline/clipGeneration';
import { DiarizationTurn } from '../src/services/diarization/client';

describe('Speaker Clip Selection', () => {
  test('selects up to 3 clean clips per speaker preferring turns between 3 and 8 seconds', () => {
    const turns: DiarizationTurn[] = [
      { speaker_label: 'SPEAKER_00', start: 0.0, end: 0.4 }, // too short (<=0.5s)
      { speaker_label: 'SPEAKER_00', start: 1.0, end: 5.5 }, // 4.5s -> IDEAL
      { speaker_label: 'SPEAKER_00', start: 7.0, end: 12.0 }, // 5.0s -> IDEAL
      { speaker_label: 'SPEAKER_00', start: 14.0, end: 17.5 }, // 3.5s -> IDEAL
      { speaker_label: 'SPEAKER_00', start: 20.0, end: 35.0 }, // 15.0s -> long
      { speaker_label: 'SPEAKER_01', start: 40.0, end: 44.0 }, // 4.0s -> IDEAL
      { speaker_label: 'SPEAKER_01', start: 46.0, end: 52.0 }, // 6.0s -> IDEAL
    ];

    const result = selectCleanTurns(turns, 3);
    const sp0 = result.get('SPEAKER_00') || [];
    const sp1 = result.get('SPEAKER_01') || [];

    expect(sp0.length).toBeLessThanOrEqual(3);
    expect(sp0.length).toBeGreaterThanOrEqual(2);
    // Should have picked the turns in the ideal range (3-8 seconds)
    expect(sp0.every(c => c.duration >= 3.0)).toBe(true);

    expect(sp1).toHaveLength(2);
  });
});
