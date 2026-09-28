import { detectGaps } from '../src/services/pipeline/audioAssembly';

describe('Audio Chunk Assembly Gap Detection', () => {
  test('returns false when all sequential chunks are present', () => {
    const chunks = [
      { sequenceNum: 0, path: '/tmp/c0' },
      { sequenceNum: 1, path: '/tmp/c1' },
      { sequenceNum: 2, path: '/tmp/c2' },
      { sequenceNum: 3, path: '/tmp/c3' },
    ];
    expect(detectGaps(chunks)).toBe(false);
  });

  test('returns true when a chunk is missing in sequence', () => {
    const chunks = [
      { sequenceNum: 0, path: '/tmp/c0' },
      { sequenceNum: 2, path: '/tmp/c2' }, // missing seq 1
    ];
    expect(detectGaps(chunks)).toBe(true);
  });

  test('handles out-of-order received chunks correctly', () => {
    const chunks = [
      { sequenceNum: 2, path: '/tmp/c2' },
      { sequenceNum: 0, path: '/tmp/c0' },
      { sequenceNum: 1, path: '/tmp/c1' },
    ];
    expect(detectGaps(chunks)).toBe(false);
  });
});
