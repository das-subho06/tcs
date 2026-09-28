import { SpeechToText, STTResult } from './types';

export class MockSpeechToText implements SpeechToText {
  async transcribe(audioFilePath: string): Promise<STTResult> {
    // Generates simulated word-level timestamps for demonstration and automated testing
    const sampleSegments = [
      {
        start: 1.0,
        end: 4.5,
        text: "Raj: Riya, can you send the updated pricing sheet by Friday?",
        words: [
          { word: "Riya,", start: 1.0, end: 1.5 },
          { word: "can", start: 1.6, end: 1.8 },
          { word: "you", start: 1.9, end: 2.1 },
          { word: "send", start: 2.2, end: 2.5 },
          { word: "the", start: 2.6, end: 2.7 },
          { word: "updated", start: 2.8, end: 3.2 },
          { word: "pricing", start: 3.3, end: 3.7 },
          { word: "sheet", start: 3.8, end: 4.0 },
          { word: "by", start: 4.1, end: 4.2 },
          { word: "Friday?", start: 4.3, end: 4.5 }
        ]
      },
      {
        start: 5.0,
        end: 7.2,
        text: "Riya: Yes, I'll do that before the end of the day.",
        words: [
          { word: "Yes,", start: 5.0, end: 5.3 },
          { word: "I'll", start: 5.4, end: 5.6 },
          { word: "do", start: 5.7, end: 5.9 },
          { word: "that", start: 6.0, end: 6.2 },
          { word: "before", start: 6.3, end: 6.5 },
          { word: "the", start: 6.6, end: 6.7 },
          { word: "end", start: 6.8, end: 6.9 },
          { word: "of", start: 7.0, end: 7.05 },
          { word: "the", start: 7.1, end: 7.15 },
          { word: "day.", start: 7.16, end: 7.2 }
        ]
      },
      {
        start: 8.0,
        end: 11.5,
        text: "Raj: Great. Also Alex, please prepare the deployment plan by Monday.",
        words: [
          { word: "Great.", start: 8.0, end: 8.4 },
          { word: "Also", start: 8.6, end: 8.9 },
          { word: "Alex,", start: 9.0, end: 9.4 },
          { word: "please", start: 9.5, end: 9.8 },
          { word: "prepare", start: 9.9, end: 10.3 },
          { word: "the", start: 10.4, end: 10.5 },
          { word: "deployment", start: 10.6, end: 11.0 },
          { word: "plan", start: 11.1, end: 11.2 },
          { word: "by", start: 11.3, end: 11.4 },
          { word: "Monday.", start: 11.45, end: 11.5 }
        ]
      }
    ];

    const allWords = sampleSegments.flatMap(s => s.words);
    const fullText = sampleSegments.map(s => s.text).join(' ');

    return {
      text: fullText,
      segments: sampleSegments,
      words: allWords
    };
  }
}
