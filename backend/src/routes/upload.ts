import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { storage } from '../services/storage';
import { parseTranscriptFile } from '../services/pipeline/transcriptParser';
import { pipelineProcessor } from '../services/pipeline/processor';
import { dispatchPipelineJob } from '../services/queue/queue';

export const uploadRouter = Router();

// Configure Multer for in-memory upload handling
const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedAudio = ['.mp3', '.wav', '.m4a', '.webm'];
    const allowedTranscript = ['.txt', '.srt', '.vtt', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedAudio.includes(ext) || allowedTranscript.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

// POST /api/upload/audio (Part B Audio Upload)
uploadRouter.post(
  '/upload/audio',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const userId = req.user!.id;
      const identifySpeakers = req.body.identifySpeakers === 'true' || req.body.identifySpeakers === true;
      const title = req.body.title || req.file.originalname.replace(/\.[^.]+$/, '');
      const meetingDate = req.body.meetingDate ? new Date(req.body.meetingDate) : new Date();

      // Create session
      const session = await prisma.session.create({
        data: {
          userId,
          title,
          source: 'upload_audio',
          status: 'UPLOADING',
          meetingDate,
        },
      });

      // Save file
      const ext = path.extname(req.file.originalname) || '.wav';
      const storageKey = `sessions/${session.id}/uploaded_audio${ext}`;
      const filePath = await storage.saveFile(storageKey, req.file.buffer);

      // Save audio track record
      await prisma.audioTrack.create({
        data: {
          sessionId: session.id,
          track: 'tab',
          path: filePath,
        },
      });

      // Also create an audio chunk so pipeline can assemble if needed
      await prisma.audioChunk.create({
        data: {
          sessionId: session.id,
          track: 'tab',
          sequenceNum: 0,
          path: filePath,
        },
      });

      if (identifySpeakers) {
        // Run Diarization & Speaker Naming first
        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'UPLOADED' },
        });
        await dispatchPipelineJob('PROCESS_AUDIO', session.id);
      } else {
        // Go straight to TRANSCRIBING
        await prisma.speaker.create({
          data: {
            sessionId: session.id,
            label: 'SPEAKER_00',
            displayName: 'Speaker',
            clipPaths: '[]',
          },
        });
        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'TRANSCRIBING' },
        });
        await dispatchPipelineJob('RESUME_SPEAKER_NAMING', session.id);
      }

      res.status(201).json({
        sessionId: session.id,
        status: identifySpeakers ? 'UPLOADED' : 'TRANSCRIBING',
        message: 'Audio uploaded successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/upload/transcript (Part B Transcript Upload)
uploadRouter.post(
  '/upload/transcript',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No transcript file provided' });
      }

      const userId = req.user!.id;
      const title = req.body.title || req.file.originalname.replace(/\.[^.]+$/, '');
      const meetingDate = req.body.meetingDate ? new Date(req.body.meetingDate) : new Date();

      // Create session
      const session = await prisma.session.create({
        data: {
          userId,
          title,
          source: 'upload_transcript',
          status: 'UPLOADING',
          meetingDate,
        },
      });

      // Parse transcript (.txt, .srt, .vtt, .docx)
      const parsed = await parseTranscriptFile(req.file.buffer, req.file.originalname);

      if (parsed.segments.length === 0) {
        return res.status(400).json({ error: 'No readable speech or segments found in the uploaded transcript' });
      }

      const speakerNames = parsed.hasSpeakerLabels
        ? parsed.speakerNames
        : ['Unknown'];

      // Process structuring directly or via queue
      await pipelineProcessor.processTranscriptUpload(session.id, parsed.segments, speakerNames);

      res.status(201).json({
        sessionId: session.id,
        status: 'STRUCTURING',
        segmentsCount: parsed.segments.length,
        speakersFound: speakerNames,
        message: 'Transcript uploaded and queued for Gemini structuring',
      });
    } catch (err) {
      next(err);
    }
  }
);
