import { parseTextLines, parseSrt } from '../src/services/pipeline/transcriptParser';

describe('Transcript Parser (Part B)', () => {
  test('parseTextLines extracts speaker names, text, and timestamps', () => {
    const raw = `
[00:01:05] Raj: Riya, can you send the updated pricing sheet by Friday?
[00:01:12] Riya: Yes, I'll do that before lunch.
[00:01:18] Alex: I will check the customer feedback report.
`;
    const res = parseTextLines(raw);
    expect(res.hasSpeakerLabels).toBe(true);
    expect(res.speakerNames).toEqual(expect.arrayContaining(['Raj', 'Riya', 'Alex']));
    expect(res.segments).toHaveLength(3);
    expect(res.segments[0].speaker_name).toBe('Raj');
    expect(res.segments[0].text).toBe('Riya, can you send the updated pricing sheet by Friday?');
    expect(res.segments[0].start).toBe(65);
  });

  test('parseTextLines handles transcript with no speaker names gracefully', () => {
    const raw = `
Can someone please update the production cluster?
I am currently working on that ticket.
`;
    const res = parseTextLines(raw);
    expect(res.hasSpeakerLabels).toBe(false);
    expect(res.segments).toHaveLength(2);
    expect(res.segments[0].speaker_name).toBe('Unknown');
  });

  test('parseSrt parses subtitle blocks with timestamps and speakers', () => {
    const srt = `
1
00:00:01,500 --> 00:00:04,200
Raj: Can you deploy the new release?

2
00:00:05,000 --> 00:00:07,500
Riya: Yes, I will deploy it this afternoon.
`;
    const res = parseSrt(srt);
    expect(res.hasSpeakerLabels).toBe(true);
    expect(res.speakerNames).toEqual(['Raj', 'Riya']);
    expect(res.segments).toHaveLength(2);
    expect(res.segments[0].start).toBeCloseTo(1.5);
    expect(res.segments[0].end).toBeCloseTo(4.2);
  });
});
