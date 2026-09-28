import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { sseManager } from '../services/sse';
import { dispatchPipelineJob } from '../services/queue/queue';

export const sessionsRouter = Router();

const CreateSessionSchema = z.object({
  title: z.string().optional(),
  source: z.enum(['extension', 'upload_audio', 'upload_transcript']).optional(),
  meetingDate: z.string().optional(),
});

// List sessions for user (Dashboard)
sessionsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            actionItems: true,
            speakers: true,
          },
        },
      },
    });

    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

// Create new session
sessionsRouter.post('/', requireAuth, validateBody(CreateSessionSchema), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { title, source, meetingDate } = req.body;

    const session = await prisma.session.create({
      data: {
        userId,
        title: title || `Meeting on ${new Date().toLocaleDateString()}`,
        source: source || 'extension',
        status: 'RECORDING',
        meetingDate: meetingDate ? new Date(meetingDate) : new Date(),
      },
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// Get session details
sessionsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id, userId },
      include: {
        speakers: true,
        actionItems: { orderBy: { timestamp: 'asc' } },
        audioTracks: true,
        exports: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (err) {
    next(err);
  }
});

// Status check (polled every 3s as fallback)
sessionsRouter.get('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        partial: true,
        error: true,
        retryableStep: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (err) {
    next(err);
  }
});

// Server-Sent Events (SSE) for live updates
sessionsRouter.get('/:id/events', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    sseManager.addClient(id, res);
  } catch (err) {
    next(err);
  }
});

// Finalize session (Called by extension on Stop)
sessionsRouter.post('/:id/finalize', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await prisma.session.update({
      where: { id },
      data: { status: 'UPLOADED' },
    });

    // Dispatch processing job
    await dispatchPipelineJob('PROCESS_AUDIO', id);

    res.json({ message: 'Session finalized, processing started', sessionId: id });
  } catch (err) {
    next(err);
  }
});

// Retry failed step
sessionsRouter.post('/:id/retry', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'FAILED') {
      return res.status(400).json({ error: 'Session is not in a FAILED state' });
    }

    await dispatchPipelineJob('RETRY_STEP', id);

    res.json({ message: 'Retry initiated', sessionId: id });
  } catch (err) {
    next(err);
  }
});

// Delete session
sessionsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    await prisma.session.deleteMany({
      where: { id, userId },
    });

    res.json({ message: 'Session deleted' });
  } catch (err) {
    next(err);
  }
});
