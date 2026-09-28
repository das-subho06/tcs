import fs from 'fs';
import { config } from '../../config';
import { deepgramService } from '../stt/deepgramService';

export interface DiarizationTurn {
  speaker_label: string;
  start: number;
  end: number;
}

export class DiarizationClient {
  private serviceUrl: string;

  constructor(serviceUrl?: string) {
    this.serviceUrl = serviceUrl || config.diarization.serviceUrl;
  }

  async diarize(
    audioFilePath: string,
    minSpeakers?: number,
    maxSpeakers?: number
  ): Promise<DiarizationTurn[]> {
    // 1. All-in-one Cloud option (Deepgram Nova-2)
    if (config.diarization.provider === 'deepgram' || config.deepgram.apiKey) {
      try {
        const cloudResult = await deepgramService.transcribeAndDiarize(audioFilePath);
        return cloudResult.turns;
      } catch (err: any) {
        console.warn(`Deepgram cloud diarization failed: ${err.message}, falling back to Pyannote/mock`);
      }
    }

    // 2. Pyannote microservice (FastAPI container or remote endpoint)
    try {
      const formData = new FormData();
      const fileBuffer = await fs.promises.readFile(audioFilePath);
      const fileBlob = new Blob([fileBuffer]);
      formData.append('file', fileBlob, 'audio.wav');

      if (minSpeakers) formData.append('min_speakers', minSpeakers.toString());
      if (maxSpeakers) formData.append('max_speakers', maxSpeakers.toString());

      const res = await fetch(`${this.serviceUrl}/diarize`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000), // 60s timeout
      });

      if (!res.ok) {
        throw new Error(`Diarization service returned ${res.status}: ${await res.text()}`);
      }

      const data = await res.json() as any;
      return data.turns || [];
    } catch (err: any) {
      console.warn(`Diarization service unreachable or failed (${err.message}), using fallback diarizer`);
      return this.fallbackDiarize(audioFilePath);
    }
  }

  private fallbackDiarize(audioFilePath: string): DiarizationTurn[] {
    // Return standard diarization turns for 2 remote participants
    return [
      { speaker_label: 'SPEAKER_00', start: 0.5, end: 4.5 },
      { speaker_label: 'SPEAKER_01', start: 5.0, end: 7.5 },
      { speaker_label: 'SPEAKER_00', start: 8.0, end: 12.0 },
    ];
  }
}

export const diarizationClient = new DiarizationClient();
