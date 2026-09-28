import { SpeechToText } from './types';
import { MockSpeechToText } from './mockStt';
import { WhisperSpeechToText } from './whisperStt';
import { config } from '../../config';

let sttInstance: SpeechToText;

if (config.stt.provider === 'whisper' && config.stt.apiKey) {
  sttInstance = new WhisperSpeechToText();
} else {
  sttInstance = new MockSpeechToText();
}

export const stt = sttInstance;
export * from './types';
