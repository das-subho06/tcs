import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { sessionsRouter } from './routes/sessions';
import { audioRouter } from './routes/audio';
import { speakersRouter } from './routes/speakers';
import { transcriptRouter } from './routes/transcript';
import { actionsRouter } from './routes/actions';
import { uploadRouter } from './routes/upload';
import { exportRouter } from './routes/export';

export function createApp() {
  const app = express();

  // CORS configuration allowing React Native Web app and Chrome Extensions
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or extension background)
        if (!origin) return callback(null, true);
        if (
          origin === config.appUrl ||
          origin.startsWith('chrome-extension://') ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );

  app.use(cookieParser());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, // limit each IP to 1000 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Parse JSON bodies (raw audio is handled per-route in audioRouter)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static directory for audio files and clips
  app.use('/uploads', express.static(config.storage.localDir));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'meeting-action-items-backend',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API routes
  app.use('/api/auth', authRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/sessions', audioRouter);
  app.use('/api/sessions', speakersRouter);
  app.use('/api/sessions', transcriptRouter);
  app.use('/api/sessions', actionsRouter);
  app.use('/api', uploadRouter);
  app.use('/api', exportRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
