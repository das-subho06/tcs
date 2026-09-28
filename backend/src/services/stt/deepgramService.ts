import fs from 'fs';
import { config } from '../../config';
import { WordTimestamp, SegmentTranscript, STTResult } from './types';
import { DiarizationTurn } from '../diarization/client';

export interface DeepgramDiarizeResult extends STTResult {
  turns: DiarizationTurn[];
  numSpeakers: number;
}

export class DeepgramService {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = config.deepgram.apiKey;
    this.model = config.deepgram.model || 'nova-2';
  }

  async transcribeAndDiarize(audioFilePath: string): Promise<DeepgramDiarizeResult> {
    if (!this.apiKey) {
      console.warn('Deepgram API Key not set. Using intelligent simulated cloud diarization & STT.');
      return this.fallbackDeepgram();
    }

    const audioBuffer = await fs.promises.readFile(audioFilePath);

    const url = new URL('https://api.deepgram.com/v1/listen');
    url.searchParams.set('model', this.model);
    url.searchParams.set('diarize', 'true');
    url.searchParams.set('punctuate', 'true');
    url.searchParams.set('utterances', 'true');
    url.searchParams.set('smart_format', 'true');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: audioBuffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Deepgram API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as any;
    return this.parseDeepgramResponse(data);
  }

  parseDeepgramResponse(data: any): DeepgramDiarizeResult {
    const channel = data?.results?.channels?.[0]?.alternatives?.[0];
    const utterances = data?.results?.utterances || [];

    const turns: DiarizationTurn[] = [];
    const segments: SegmentTranscript[] = [];
    const words: WordTimestamp[] = [];
    const speakerSet = new Set<string>();

    if (utterances.length > 0) {
      for (const utt of utterances) {
        const speakerLabel = `SPEAKER_0${utt.speaker ?? 0}`;
        speakerSet.add(speakerLabel);

        turns.push({
          speaker_label: speakerLabel,
          start: Math.round(utt.start * 100) / 100,
          end: Math.round(utt.end * 100) / 100,
        });

        segments.push({
          start: Math.round(utt.start * 100) / 100,
          end: Math.round(utt.end * 100) / 100,
          text: utt.transcript.trim(),
          words: (utt.words || []).map((w: any) => ({
            word: w.punctuated_word || w.word,
            start: Math.round(w.start * 100) / 100,
            end: Math.round(w.end * 100) / 100,
            confidence: w.confidence,
          })),
        });
      }
    } else if (channel) {
      // Fallback if utterances is empty, parse from words
      const rawWords = channel.words || [];
      let currentSpeaker = -1;
      let currentTurn: DiarizationTurn | null = null;
      let currentText: string[] = [];

      for (const w of rawWords) {
        const spk = w.speaker ?? 0;
        const spkLabel = `SPEAKER_0${spk}`;
        speakerSet.add(spkLabel);

        words.push({
          word: w.punctuated_word || w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        });

        if (spk !== currentSpeaker) {
          if (currentTurn) {
            turns.push(currentTurn);
            segments.push({
              start: currentTurn.start,
              end: currentTurn.end,
              text: currentText.join(' '),
            });
          }
          currentSpeaker = spk;
          currentTurn = { speaker_label: spkLabel, start: w.start, end: w.end };
          currentText = [w.punctuated_word || w.word];
        } else {
          if (currentTurn) {
            currentTurn.end = w.end;
            currentText.push(w.punctuated_word || w.word);
          }
        }
      }

      if (currentTurn) {
        turns.push(currentTurn);
        segments.push({
          start: currentTurn.start,
          end: currentTurn.end,
          text: currentText.join(' '),
        });
      }
    }

    const fullText = channel?.transcript || segments.map(s => s.text).join(' ');

    return {
      text: fullText,
      turns,
      segments,
      words,
      numSpeakers: speakerSet.size,
    };
  }

  private fallbackDeepgram(): DeepgramDiarizeResult {
    const turns: DiarizationTurn[] = [
      { speaker_label: 'SPEAKER_00', start: 1.0, end: 4.5 },
      { speaker_label: 'SPEAKER_01', start: 5.0, end: 7.5 },
      { speaker_label: 'SPEAKER_00', start: 8.0, end: 12.0 },
    ];

    const segments: SegmentTranscript[] = [
      {
        start: 1.0,
        end: 4.5,
        text: 'Riya, can you send the updated pricing sheet by Friday?',
        words: [
          { word: 'Riya,', start: 1.0, end: 1.4 },
          { word: 'can', start: 1.5, end: 1.7 },
          { word: 'you', start: 1.8, end: 2.0 },
          { word: 'send', start: 2.1, end: 2.4 },
          { word: 'the', start: 2.5, end: 2.6 },
          { word: 'updated', start: 2.7, end: 3.1 },
          { word: 'pricing', start: 3.2, end: 3.6 },
          { word: 'sheet', start: 3.7, end: 3.9 },
          { word: 'by', start: 4.0, end: 4.1 },
          { word: 'Friday?', start: 4.2, end: 4.5 },
        ],
      },
      {
        start: 5.0,
        end: 7.5,
        text: "Yes, I'll do that before the end of the day.",
        words: [
          { word: 'Yes,', start: 5.0, end: 5.3 },
          { word: "I'll", start: 5.4, end: 5.6 },
          { word: 'do', start: 5.7, end: 5.9 },
          { word: 'that', start: 6.0, end: 6.2 },
          { word: 'before', start: 6.3, end: 6.5 },
          { word: 'the', start: 6.6, end: 6.7 },
          { word: 'end', start: 6.8, end: 6.9 },
          { word: 'of', start: 7.0, end: 7.1 },
          { word: 'the', start: 7.2, end: 7.3 },
          { word: 'day.', start: 7.4, end: 7.5 },
        ],
      },
      {
        start: 8.0,
        end: 12.0,
        text: 'Great. Also Alex, please prepare the deployment plan by Monday.',
        words: [
          { word: 'Great.', start: 8.0, end: 8.4 },
          { word: 'Also', start: 8.6, end: 8.9 },
          { word: 'Alex,', start: 9.0, end: 9.4 },
          { word: 'please', start: 9.5, end: 9.8 },
          { word: 'prepare', start: 9.9, end: 10.3 },
          { word: 'the', start: 10.4, end: 10.5 },
          { word: 'deployment', start: 10.6, end: 11.0 },
          { word: 'plan', start: 11.1, end: 11.3 },
          { word: 'by', start: 11.4, end: 11.5 },
          { word: 'Monday.', start: 11.6, end: 12.0 },
        ],
      },
    ];

    const words = segments.flatMap(s => s.words || []);
    const text = segments.map(s => s.text).join(' ');

    return {
      text,
      turns,
      segments,
      words,
      numSpeakers: 2,
    };
  }
}

export const deepgramService = new DeepgramService();
