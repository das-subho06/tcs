export interface TimedSegment {
  start: number;
  end: number;
  text: string;
  speaker_name?: string;
}

export function calculateTimeOverlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);
  return Math.max(0, overlapEnd - overlapStart);
}

export function tokenizeAndNormalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

export function jaccardSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(tokenizeAndNormalize(textA));
  const wordsB = new Set(tokenizeAndNormalize(textB));

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function filterMicEcho(
  micSegments: TimedSegment[],
  tabSegments: TimedSegment[],
  minOverlapSec: number = 0.3,
  similarityThreshold: number = 0.55
): TimedSegment[] {
  return micSegments.filter(micSeg => {
    for (const tabSeg of tabSegments) {
      const overlap = calculateTimeOverlap(micSeg, tabSeg);
      if (overlap >= minOverlapSec) {
        const similarity = jaccardSimilarity(micSeg.text, tabSeg.text);
        if (similarity >= similarityThreshold) {
          // Acoustic echo detected (user audio leaking from laptop speakers back into mic)
          return false;
        }
      }
    }
    return true;
  });
}
