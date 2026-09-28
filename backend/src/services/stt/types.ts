export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SegmentTranscript {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface STTResult {
  text: string;
  segments: SegmentTranscript[];
  words: WordTimestamp[];
}

export interface SpeechToText {
  transcribe(audioFilePath: string, options?: { language?: string }): Promise<STTResult>;
}
