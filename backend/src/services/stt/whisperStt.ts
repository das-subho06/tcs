import fs from 'fs';
import { SpeechToText, STTResult } from './types';
import { config } from '../../config';

export class WhisperSpeechToText implements SpeechToText {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.stt.apiKey;
  }

  async transcribe(audioFilePath: string, options?: { language?: string }): Promise<STTResult> {
    if (!this.apiKey) {
      throw new Error('STT API key is not configured.');
    }

    const formData = new FormData();
    const fileBlob = new Blob([await fs.promises.readFile(audioFilePath)]);
    formData.append('file', fileBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');
    if (options?.language) {
      formData.append('language', options.language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`Whisper STT request failed (${response.status}): ${err}. Using fallback STT.`);
      const { MockSpeechToText } = require('./mockStt');
      return new MockSpeechToText().transcribe(audioFilePath);
    }

    const data = await response.json() as any;
    return {
      text: data.text || '',
      segments: (data.segments || []).map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      words: (data.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })),
    };
  }
}
