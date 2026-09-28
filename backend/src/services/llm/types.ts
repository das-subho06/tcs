import { z } from 'zod';

export const ActionItemSchema = z.object({
  action: z.string(),
  owner: z.string(),
  due_raw: z.string().nullable(),
  due_date: z.string().nullable(), // ISO string
  assigned_by: z.string(),
  source_quote: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
});

export const ActionItemsResponseSchema = z.array(ActionItemSchema);

export type ActionItemDTO = z.infer<typeof ActionItemSchema>;

export interface StructuringInput {
  transcript: Array<{
    speaker_name: string;
    text: string;
    start: number;
    end: number;
  }>;
  meetingDate: Date;
  speakerNames: string[];
}
