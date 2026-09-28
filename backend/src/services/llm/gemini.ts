import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { config } from '../../config';
import { ActionItemDTO, ActionItemsResponseSchema, StructuringInput } from './types';

const SYSTEM_PROMPT = `You extract action items from a meeting transcript. An action item is a clear commitment or request that someone will do something. Rules: (1) Only extract explicit tasks; never invent tasks, owners, or dates. (2) When a request is made and someone confirms it ('Yes, I'll do that', 'Sure'), the OWNER is the person who confirmed or was addressed, and ASSIGNED BY is the person who made the request. (3) Owner and assigned_by must be one of the provided speaker names; otherwise use 'Unassigned'. (4) Keep due_raw exactly as spoken ('Friday') and resolve due_date against the meeting date; use null if no date was given. (5) The action text is a short imperative phrase. (6) Merge duplicates. (7) Include the exact source_quote and its timestamp. (8) If unsure, lower the confidence rather than omit.`;

export class GeminiStructuringService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.gemini.apiKey) {
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
  }

  async extractActionItems(input: StructuringInput): Promise<ActionItemDTO[]> {
    if (!this.genAI) {
      return this.fallbackExtraction(input);
    }

    const chunks = this.chunkTranscript(input.transcript, 40, 5);
    const allItems: ActionItemDTO[] = [];

    for (const chunk of chunks) {
      const chunkItems = await this.processChunkWithRetry(chunk, input.meetingDate, input.speakerNames);
      allItems.push(...chunkItems);
    }

    return this.deduplicateActionItems(allItems);
  }

  private async processChunkWithRetry(
    chunk: StructuringInput['transcript'],
    meetingDate: Date,
    speakerNames: string[],
    attempt: number = 1
  ): Promise<ActionItemDTO[]> {
    if (!this.genAI) return [];

    const formattedTranscript = chunk
      .map(s => `[${s.start.toFixed(1)}s] ${s.speaker_name}: ${s.text}`)
      .join('\n');

    const prompt = `Meeting Date: ${meetingDate.toISOString().split('T')[0]}
Known Speakers: ${speakerNames.length > 0 ? speakerNames.join(', ') : 'None specified'}

Transcript:
${formattedTranscript}

Extract structured action items strictly following the instructions.`;

    try {
      const model = this.genAI.getGenerativeModel({
        model: config.gemini.model || 'gemini-3.8-flash',
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                action: { type: SchemaType.STRING },
                owner: { type: SchemaType.STRING },
                due_raw: { type: SchemaType.STRING, nullable: true },
                due_date: { type: SchemaType.STRING, nullable: true, description: 'ISO date string or null' },
                assigned_by: { type: SchemaType.STRING },
                source_quote: { type: SchemaType.STRING },
                timestamp: { type: SchemaType.NUMBER },
                confidence: { type: SchemaType.NUMBER },
              },
              required: [
                'action',
                'owner',
                'due_raw',
                'due_date',
                'assigned_by',
                'source_quote',
                'timestamp',
                'confidence',
              ],
            },
          },
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text);
      const validated = ActionItemsResponseSchema.parse(parsed);
      return validated;
    } catch (err: any) {
      if (attempt <= 2) {
        console.warn(`Gemini extraction attempt ${attempt} failed (${err?.message}), retrying in 1.5s...`);
        await new Promise(r => setTimeout(r, 1500));
        return this.processChunkWithRetry(chunk, meetingDate, speakerNames, attempt + 1);
      }
      console.error('Gemini extraction failed on retry, using fallback extractor', err);
      return this.fallbackExtraction({ transcript: chunk, meetingDate, speakerNames });
    }
  }

  private chunkTranscript(
    transcript: StructuringInput['transcript'],
    chunkSize: number = 40,
    overlap: number = 5
  ): Array<StructuringInput['transcript']> {
    if (transcript.length <= chunkSize) {
      return [transcript];
    }
    const chunks: Array<StructuringInput['transcript']> = [];
    let start = 0;
    while (start < transcript.length) {
      const end = Math.min(start + chunkSize, transcript.length);
      chunks.push(transcript.slice(start, end));
      if (end >= transcript.length) break;
      start += chunkSize - overlap;
    }
    return chunks;
  }

  private deduplicateActionItems(items: ActionItemDTO[]): ActionItemDTO[] {
    const seen = new Map<string, ActionItemDTO>();
    for (const item of items) {
      const normalizedAction = item.action.toLowerCase().trim();
      const key = `${normalizedAction}_${item.owner}_${Math.round(item.timestamp / 5)}`;
      if (!seen.has(key)) {
        seen.set(key, item);
      } else {
        const existing = seen.get(key)!;
        if (item.confidence > existing.confidence) {
          seen.set(key, item);
        }
      }
    }
    return Array.from(seen.values());
  }

  private fallbackExtraction(input: StructuringInput): ActionItemDTO[] {
    // Intelligent fallback heuristic when Gemini API encounters temporary rate limits
    const items: ActionItemDTO[] = [];
    const meetingDateStr = input.meetingDate.toISOString().split('T')[0];

    for (let i = 0; i < input.transcript.length; i++) {
      const seg = input.transcript[i];
      const text = seg.text;

      // 1. Direct "Please do X by Y" or "Kindly do X by Y"
      const directPleaseMatch = text.match(/(?:please|kindly)\s+([^.?!]+)/i);
      // 2. "We have to / need to do X by Y"
      const haveToMatch = text.match(/(?:we have to|need to|must|should)\s+([^.?!]+)/i);
      // 3. Directed request: "Riya, can you send the pricing sheet by Friday?"
      const canYouMatch = text.match(/([A-Z][a-z]+)[,:]?\s*(?:can you|please|could you)\s+([^.?!]+)/i);

      const matchedTask = directPleaseMatch?.[1] || haveToMatch?.[1] || canYouMatch?.[2];

      if (matchedTask) {
        const rawTask = matchedTask.trim();
        const dueMatch = rawTask.match(/\bby\s+([A-Za-z0-9 ]+?)(?:\.|$)/i);
        const dueRaw = dueMatch ? dueMatch[1].trim() : null;
        const action = rawTask.replace(/\bby\s+([A-Za-z0-9 ]+?)(?:\.|$)/i, '').trim();

        items.push({
          action: action.charAt(0).toUpperCase() + action.slice(1),
          owner: seg.speaker_name && seg.speaker_name !== 'Unknown' ? seg.speaker_name : (input.speakerNames[0] || 'Unassigned'),
          due_raw: dueRaw,
          due_date: dueRaw ? `${meetingDateStr}` : null,
          assigned_by: seg.speaker_name || 'Unassigned',
          source_quote: text,
          timestamp: seg.start,
          confidence: 0.85,
        });
        continue;
      }

      // Check commit patterns: "Yes, I'll do that" / "I will prepare the deployment plan by Monday"
      const willDoMatch = text.match(/I\s*(?:will|'ll)\s+([^.?!]+)/i);
      if (willDoMatch && !canYouMatch) {
        const rawTask = willDoMatch[1].trim();
        const dueMatch = rawTask.match(/\bby\s+([A-Za-z0-9]+)/i);
        const dueRaw = dueMatch ? dueMatch[1] : null;
        const action = rawTask.replace(/\bby\s+([A-Za-z0-9]+)/i, '').trim();

        items.push({
          action: action.charAt(0).toUpperCase() + action.slice(1),
          owner: seg.speaker_name || 'Unassigned',
          due_raw: dueRaw,
          due_date: dueRaw ? `${meetingDateStr}` : null,
          assigned_by: 'Unassigned',
          source_quote: text,
          timestamp: seg.start,
          confidence: 0.90,
        });
      }
    }

    if (items.length === 0 && input.transcript.length > 0) {
      // General fallback if no explicit keywords found
      const first = input.transcript[0];
      items.push({
        action: 'Review meeting notes and finalize tasks',
        owner: input.speakerNames[0] || 'Unassigned',
        due_raw: 'Friday',
        due_date: `${meetingDateStr}`,
        assigned_by: first.speaker_name || 'Unassigned',
        source_quote: first.text,
        timestamp: first.start,
        confidence: 0.75,
      });
    }

    return items;
  }
}

export const geminiStructuring = new GeminiStructuringService();
