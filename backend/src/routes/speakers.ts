import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { dispatchPipelineJob } from '../services/queue/queue';

export const speakersRouter = Router();

const UpdateSpeakersSchema = z.object({
  speakers: z.array(
    z.object({
      label: z.string(),
      displayName: z.string(),
      mergeInto: z.string().optional(), // if merging over-segmented speaker
      skip: z.boolean().optional(),
    })
  ),
});

// GET /api/sessions/:id/speakers
speakersRouter.get('/:id/speakers', requireAuth, async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: { speakers: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const formattedSpeakers = session.speakers.map(s => ({
      id: s.id,
      label: s.label,
      displayName: s.displayName,
      clipPaths: JSON.parse(s.clipPaths || '[]'),
    }));

    res.json({
      sessionId,
      status: session.status,
      speakers: formattedSpeakers,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/speakers (Submit speaker naming & merge)
speakersRouter.post(
  '/:id/speakers',
  requireAuth,
  validateBody(UpdateSpeakersSchema),
  async (req, res, next) => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user!.id;
      const { speakers } = req.body;

      const session = await prisma.session.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Update speaker display names & handle merges
      for (const sp of speakers) {
        const finalDisplayName = sp.mergeInto ? sp.mergeInto : (sp.displayName || sp.label);
        
        await prisma.speaker.upsert({
          where: { sessionId_label: { sessionId, label: sp.label } },
          create: {
            sessionId,
            label: sp.label,
            displayName: sp.skip ? '[Skipped]' : finalDisplayName,
            clipPaths: '[]',
          },
          update: {
            displayName: sp.skip ? '[Skipped]' : finalDisplayName,
          },
        });
      }

      // Dispatch resume job to proceed to TRANSCRIBING & STRUCTURING
      await dispatchPipelineJob('RESUME_SPEAKER_NAMING', sessionId);

      res.json({ message: 'Speaker names updated, transcription started', sessionId });
    } catch (err) {
      next(err);
    }
  }
);
