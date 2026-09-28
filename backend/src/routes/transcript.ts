import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

export const transcriptRouter = Router();

// GET /api/sessions/:id/transcript
transcriptRouter.get('/:id/transcript', requireAuth, async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: {
        transcript: {
          orderBy: { start: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session.transcript);
  } catch (err) {
    next(err);
  }
});
