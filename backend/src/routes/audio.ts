import { Router } from 'express';
import express from 'express';
import { prisma } from '../db';
import { storage } from '../services/storage';
import { requireAuth } from '../middleware/auth';

export const audioRouter = Router();

// PUT /api/sessions/:id/audio/:track?seq=N
// Handles raw binary audio or octet-stream
audioRouter.put(
  '/:id/audio/:track',
  requireAuth,
  express.raw({ type: ['audio/*', 'application/octet-stream', 'video/webm'], limit: '50mb' }),
  async (req, res, next) => {
    try {
      const { id: sessionId, track } = req.params;
      const seqStr = req.query.seq as string;
      const userId = req.user!.id;

      if (!['tab', 'mic'].includes(track)) {
        return res.status(400).json({ error: 'Track must be "tab" or "mic"' });
      }

      if (seqStr === undefined) {
        return res.status(400).json({ error: 'Query parameter "seq" is required' });
      }

      const sequenceNum = parseInt(seqStr, 10);
      if (isNaN(sequenceNum)) {
        return res.status(400).json({ error: 'Query parameter "seq" must be a number' });
      }

      // Verify session exists and belongs to user
      const session = await prisma.session.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const chunkBuffer = req.body as Buffer;
      if (!chunkBuffer || chunkBuffer.length === 0) {
        return res.status(400).json({ error: 'Empty audio chunk' });
      }

      // Save file to storage
      const chunkFileName = `sessions/${sessionId}/chunks/${track}_chunk_${sequenceNum}.webm`;
      const fullPath = await storage.saveFile(chunkFileName, chunkBuffer);

      // Record chunk in DB (idempotent upsert)
      await prisma.audioChunk.upsert({
        where: {
          sessionId_track_sequenceNum: {
            sessionId,
            track,
            sequenceNum,
          },
        },
        create: {
          sessionId,
          track,
          sequenceNum,
          path: fullPath,
        },
        update: {
          path: fullPath,
          receivedAt: new Date(),
        },
      });

      // Update session status to UPLOADING if currently RECORDING
      if (session.status === 'RECORDING') {
        await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'UPLOADING' },
        });
      }

      res.status(200).json({
        acknowledged: true,
        sessionId,
        track,
        sequenceNum,
        bytes: chunkBuffer.length,
      });
    } catch (err) {
      next(err);
    }
  }
);
