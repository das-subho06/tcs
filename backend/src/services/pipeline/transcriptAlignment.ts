import { WordTimestamp, SegmentTranscript } from '../stt/types';
import { DiarizationTurn } from '../diarization/client';
import { calculateTimeOverlap, filterMicEcho, TimedSegment } from './echoDetection';

export interface AlignedSegment {
  start: number;
  end: number;
  speaker_name: string;
  speaker_label?: string;
  text: string;
}

export function assignSpeakersToTabSegments(
  sttSegments: SegmentTranscript[],
  turns: DiarizationTurn[],
  speakerNameMap: Map<string, string> // label -> displayName
): AlignedSegment[] {
  return sttSegments.map(seg => {
    let bestTurn: DiarizationTurn | null = null;
    let maxOverlap = 0;

    for (const turn of turns) {
      const overlap = calculateTimeOverlap(seg, turn);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestTurn = turn;
      }
    }

    const speakerLabel = bestTurn ? bestTurn.speaker_label : (turns[0]?.speaker_label || 'SPEAKER_00');
    const speakerName = speakerNameMap.get(speakerLabel) || speakerLabel;

    return {
      start: seg.start,
      end: seg.end,
      speaker_label: speakerLabel,
      speaker_name: speakerName,
      text: seg.text.trim(),
    };
  });
}

export function mergeAndSortTracks(
  tabSegments: AlignedSegment[],
  micSegments: TimedSegment[],
  micSpeakerName: string = 'You'
): AlignedSegment[] {
  // Echo filtering
  const cleanedMic = filterMicEcho(micSegments, tabSegments).map(m => ({
    start: m.start,
    end: m.end,
    speaker_name: micSpeakerName,
    text: m.text.trim(),
  }));

  const all: AlignedSegment[] = [...tabSegments, ...cleanedMic];

  // Sort by start timestamp
  all.sort((a, b) => a.start - b.start);

  // Compact adjacent segments from same speaker if gap is small (< 1.5s)
  const compacted: AlignedSegment[] = [];
  for (const item of all) {
    if (compacted.length === 0) {
      compacted.push({ ...item });
      continue;
    }

    const prev = compacted[compacted.length - 1];
    if (prev.speaker_name === item.speaker_name && item.start - prev.end <= 1.5) {
      prev.end = Math.max(prev.end, item.end);
      prev.text = `${prev.text} ${item.text}`.trim();
    } else {
      compacted.push({ ...item });
    }
  }

  return compacted;
}
