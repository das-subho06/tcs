import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const actionsRouter = Router();

const ActionItemCreateSchema = z.object({
  action: z.string().min(1),
  owner: z.string().default('Unassigned'),
  dueRaw: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assignedBy: z.string().default('Unassigned'),
  sourceQuote: z.string().default(''),
  timestamp: z.number().default(0),
  confidence: z.number().default(1.0),
});

const ActionItemUpdateSchema = z.object({
  action: z.string().optional(),
  owner: z.string().optional(),
  dueRaw: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assignedBy: z.string().optional(),
  done: z.boolean().optional(),
});

// GET /api/sessions/:id/actions
actionsRouter.get('/:id/actions', requireAuth, async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: {
        actionItems: { orderBy: { timestamp: 'asc' } },
        speakers: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      actionItems: session.actionItems,
      speakers: session.speakers.map(s => s.displayName),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/actions (Add new action item)
actionsRouter.post('/:id/actions', requireAuth, validateBody(ActionItemCreateSchema), async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;
    const body = req.body;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const item = await prisma.actionItem.create({
      data: {
        sessionId,
        action: body.action,
        owner: body.owner,
        dueRaw: body.dueRaw || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        assignedBy: body.assignedBy,
        sourceQuote: body.sourceQuote,
        timestamp: body.timestamp,
        confidence: body.confidence,
        done: false,
        edited: true,
      },
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/sessions/:id/actions/:actionId (Update action item)
actionsRouter.patch('/:id/actions/:actionId', requireAuth, validateBody(ActionItemUpdateSchema), async (req, res, next) => {
  try {
    const { id: sessionId, actionId } = req.params;
    const userId = req.user!.id;
    const body = req.body;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const item = await prisma.actionItem.findFirst({
      where: { id: actionId, sessionId },
    });

    if (!item) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    const updateData: any = { edited: true };
    if (body.action !== undefined) updateData.action = body.action;
    if (body.owner !== undefined) updateData.owner = body.owner;
    if (body.dueRaw !== undefined) updateData.dueRaw = body.dueRaw;
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assignedBy !== undefined) updateData.assignedBy = body.assignedBy;
    if (body.done !== undefined) updateData.done = body.done;

    const updated = await prisma.actionItem.update({
      where: { id: actionId },
      data: updateData,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sessions/:id/actions/:actionId
actionsRouter.delete('/:id/actions/:actionId', requireAuth, async (req, res, next) => {
  try {
    const { id: sessionId, actionId } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await prisma.actionItem.deleteMany({
      where: { id: actionId, sessionId },
    });

    res.json({ message: 'Action item deleted' });
  } catch (err) {
    next(err);
  }
});
