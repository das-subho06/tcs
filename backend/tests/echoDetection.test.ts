import {
  calculateTimeOverlap,
  jaccardSimilarity,
  filterMicEcho,
  TimedSegment,
} from '../src/services/pipeline/echoDetection';

describe('Echo Detection and Acoustic Filtering', () => {
  test('calculateTimeOverlap computes exact overlap duration between segments', () => {
    const a = { start: 1.0, end: 5.0 };
    const b = { start: 3.0, end: 7.0 };
    expect(calculateTimeOverlap(a, b)).toBeCloseTo(2.0);

    const nonOverlapping = { start: 6.0, end: 10.0 };
    expect(calculateTimeOverlap(a, nonOverlapping)).toBe(0);
  });

  test('jaccardSimilarity measures token overlap correctly', () => {
    const text1 = 'Please send the updated pricing sheet by Friday';
    const text2 = 'please send updated pricing sheet';
    const sim = jaccardSimilarity(text1, text2);
    expect(sim).toBeGreaterThan(0.6);

    const unrelated = 'Apples oranges bananas grapes';
    expect(jaccardSimilarity(text1, unrelated)).toBe(0);
  });

  test('filterMicEcho drops mic segments that overlap in time and have matching text', () => {
    const tabSegments: TimedSegment[] = [
      {
        start: 2.0,
        end: 6.0,
        text: 'Raj: Can everyone please review the roadmap slides before tomorrow?',
      },
    ];

    const micSegments: TimedSegment[] = [
      // Echo of the laptop speakers into the mic
      {
        start: 2.2,
        end: 5.8,
        text: 'Can everyone please review the roadmap slides',
      },
      // Real speech by the local user
      {
        start: 7.0,
        end: 9.0,
        text: 'Sure Raj, I will review the slides today.',
      },
    ];

    const filtered = filterMicEcho(micSegments, tabSegments, 0.3, 0.6);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].text).toContain('Sure Raj, I will review');
  });
});
