import { ActionItemSchema, ActionItemsResponseSchema } from '../src/services/llm/types';

describe('Gemini Structuring Schema Validation', () => {
  test('validates correct action item structure', () => {
    const raw = {
      action: 'Send updated pricing sheet',
      owner: 'Riya',
      due_raw: 'Friday',
      due_date: '2026-10-02',
      assigned_by: 'Raj',
      source_quote: 'Raj: Riya, can you send the updated pricing sheet by Friday?',
      timestamp: 12.5,
      confidence: 0.95,
    };

    const parsed = ActionItemSchema.parse(raw);
    expect(parsed.action).toBe('Send updated pricing sheet');
    expect(parsed.owner).toBe('Riya');
    expect(parsed.confidence).toBe(0.95);
  });

  test('validates array of action items with nullable due_date and due_raw', () => {
    const rawArray = [
      {
        action: 'Review security policies',
        owner: 'Alex',
        due_raw: null,
        due_date: null,
        assigned_by: 'Unassigned',
        source_quote: 'I will review security policies',
        timestamp: 45.0,
        confidence: 0.8,
      },
    ];

    const parsed = ActionItemsResponseSchema.parse(rawArray);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].due_date).toBeNull();
  });

  test('rejects items missing required fields', () => {
    const invalid = {
      action: 'Missing owner and source quote',
    };
    expect(() => ActionItemSchema.parse(invalid)).toThrow();
  });
});
