import mammoth from 'mammoth';
import { AlignedSegment } from './transcriptAlignment';

export interface ParsedTranscriptResult {
  segments: AlignedSegment[];
  hasSpeakerLabels: boolean;
  speakerNames: string[];
}

export async function parseTranscriptFile(
  fileBuffer: Buffer,
  filename: string
): Promise<ParsedTranscriptResult> {
  const ext = filename.split('.').pop()?.toLowerCase();

  let textContent = '';

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    textContent = result.value;
  } else {
    textContent = fileBuffer.toString('utf8');
  }

  if (ext === 'srt') {
    return parseSrt(textContent);
  } else if (ext === 'vtt') {
    return parseVtt(textContent);
  } else {
    return parseTextLines(textContent);
  }
}

export function parseTextLines(text: string): ParsedTranscriptResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const segments: AlignedSegment[] = [];
  const speakerSet = new Set<string>();
  let hasSpeakerLabels = false;

  let currentTime = 0;

  for (const line of lines) {
    // Check for timestamp prefix e.g. [01:23] or [12.5s]
    let content = line;
    let start = currentTime;
    let end = currentTime + 4.0;

    const timeMatch = content.match(/^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d+))?\]\s*(.*)$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1] || '0', 10);
      const mins = parseInt(timeMatch[2], 10);
      const secs = parseInt(timeMatch[3], 10);
      start = hours * 3600 + mins * 60 + secs;
      end = start + 4.0;
      content = timeMatch[5];
    }

    // Check for "Speaker Name: text"
    const speakerMatch = content.match(/^([A-Za-z0-9 _'-]{2,25}):\s+(.+)$/);
    if (speakerMatch) {
      hasSpeakerLabels = true;
      const speakerName = speakerMatch[1].trim();
      const speechText = speakerMatch[2].trim();
      speakerSet.add(speakerName);

      segments.push({
        start,
        end,
        speaker_name: speakerName,
        text: speechText,
      });
      currentTime = end + 0.5;
    } else {
      // Line without speaker label
      segments.push({
        start,
        end,
        speaker_name: 'Unknown',
        text: content,
      });
      currentTime = end + 0.5;
    }
  }

  return {
    segments,
    hasSpeakerLabels,
    speakerNames: Array.from(speakerSet),
  };
}

export function parseSrt(srtContent: string): ParsedTranscriptResult {
  const blocks = srtContent.split(/\r?\n\r?\n/).map(b => b.trim()).filter(Boolean);
  const segments: AlignedSegment[] = [];
  const speakerSet = new Set<string>();
  let hasSpeakerLabels = false;

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 2) continue;

    // Timecode line e.g. 00:01:20,000 --> 00:01:23,500
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;

    const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
    const start = parseTimestampToSeconds(startStr);
    const end = parseTimestampToSeconds(endStr);

    const textLines = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (!textLines) continue;

    const speakerMatch = textLines.match(/^([A-Za-z0-9 _'-]{2,25}):\s+(.+)$/);
    if (speakerMatch) {
      hasSpeakerLabels = true;
      const speakerName = speakerMatch[1].trim();
      speakerSet.add(speakerName);
      segments.push({
        start,
        end,
        speaker_name: speakerName,
        text: speakerMatch[2].trim(),
      });
    } else {
      segments.push({
        start,
        end,
        speaker_name: 'Unknown',
        text: textLines,
      });
    }
  }

  return {
    segments,
    hasSpeakerLabels,
    speakerNames: Array.from(speakerSet),
  };
}

export function parseVtt(vttContent: string): ParsedTranscriptResult {
  const cleaned = vttContent.replace(/^WEBVTT[^\n]*\n+/i, '');
  return parseSrt(cleaned.replace(/\./g, ',')); // VTT uses period for ms
}

function parseTimestampToSeconds(str: string): number {
  const parts = str.replace(',', '.').split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str) || 0;
}
