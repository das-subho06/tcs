import { DeepgramService } from '../src/services/stt/deepgramService';

describe('Deepgram All-in-One Cloud Diarization and STT', () => {
  const service = new DeepgramService();

  test('parseDeepgramResponse correctly extracts speaker turns, word timestamps, and segments', () => {
    const mockApiResponse = {
      results: {
        channels: [
          {
            alternatives: [
              {
                transcript: 'Riya can you send the document. Sure Raj I will send it.',
                words: [
                  { word: 'riya', start: 0.5, end: 0.9, speaker: 0, confidence: 0.99 },
                  { word: 'can', start: 1.0, end: 1.2, speaker: 0, confidence: 0.98 },
                  { word: 'you', start: 1.3, end: 1.5, speaker: 0, confidence: 0.98 },
                  { word: 'send', start: 1.6, end: 1.9, speaker: 0, confidence: 0.97 },
                  { word: 'the', start: 2.0, end: 2.1, speaker: 0, confidence: 0.99 },
                  { word: 'document', start: 2.2, end: 2.7, speaker: 0, confidence: 0.95 },
                  { word: 'sure', start: 3.5, end: 3.8, speaker: 1, confidence: 0.99 },
                  { word: 'raj', start: 3.9, end: 4.1, speaker: 1, confidence: 0.97 },
                  { word: 'i', start: 4.2, end: 4.3, speaker: 1, confidence: 0.98 },
                  { word: 'will', start: 4.4, end: 4.6, speaker: 1, confidence: 0.99 },
                  { word: 'send', start: 4.7, end: 5.0, speaker: 1, confidence: 0.98 },
                  { word: 'it', start: 5.1, end: 5.3, speaker: 1, confidence: 0.97 },
                ],
              },
            ],
          },
        ],
        utterances: [
          {
            speaker: 0,
            start: 0.5,
            end: 2.7,
            transcript: 'Riya, can you send the document?',
            words: [
              { word: 'Riya,', start: 0.5, end: 0.9, speaker: 0 },
              { word: 'can', start: 1.0, end: 1.2, speaker: 0 },
              { word: 'you', start: 1.3, end: 1.5, speaker: 0 },
              { word: 'send', start: 1.6, end: 1.9, speaker: 0 },
              { word: 'the', start: 2.0, end: 2.1, speaker: 0 },
              { word: 'document?', start: 2.2, end: 2.7, speaker: 0 },
            ],
          },
          {
            speaker: 1,
            start: 3.5,
            end: 5.3,
            transcript: "Sure Raj, I will send it.",
            words: [
              { word: 'Sure', start: 3.5, end: 3.8, speaker: 1 },
              { word: 'Raj,', start: 3.9, end: 4.1, speaker: 1 },
              { word: 'I', start: 4.2, end: 4.3, speaker: 1 },
              { word: 'will', start: 4.4, end: 4.6, speaker: 1 },
              { word: 'send', start: 4.7, end: 5.0, speaker: 1 },
              { word: 'it.', start: 5.1, end: 5.3, speaker: 1 },
            ],
          },
        ],
      },
    };

    const parsed = service.parseDeepgramResponse(mockApiResponse);

    expect(parsed.numSpeakers).toBe(2);
    expect(parsed.turns).toHaveLength(2);
    expect(parsed.turns[0].speaker_label).toBe('SPEAKER_00');
    expect(parsed.turns[0].start).toBe(0.5);
    expect(parsed.turns[0].end).toBe(2.7);

    expect(parsed.turns[1].speaker_label).toBe('SPEAKER_01');
    expect(parsed.turns[1].start).toBe(3.5);
    expect(parsed.turns[1].end).toBe(5.3);

    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[0].text).toContain('Riya, can you send');
    expect(parsed.segments[1].text).toContain('Sure Raj, I will send');
  });
});
