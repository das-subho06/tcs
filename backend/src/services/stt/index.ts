import { SpeechToText } from './types';
import { MockSpeechToText } from './mockStt';
import { WhisperSpeechToText } from './whisperStt';
import { deepgramService } from './deepgramService';
import { config } from '../../config';

class DeepgramSpeechToText implements SpeechToText {
  async transcribe(audioFilePath: string) {
    const res = await deepgramService.transcribeAndDiarize(audioFilePath);
    return {
      text: res.text,
      segments: res.segments,
      words: res.words,
    };
  }
}

let sttInstance: SpeechToText;

if (config.stt.provider === 'deepgram' || config.deepgram.apiKey || config.diarization.provider === 'deepgram') {
  sttInstance = new DeepgramSpeechToText();
} else if (config.stt.provider === 'whisper' && config.stt.apiKey) {
  sttInstance = new WhisperSpeechToText();
} else {
  sttInstance = new MockSpeechToText();
}

export const stt = sttInstance;
export * from './types';
export { deepgramService } from './deepgramService';
