import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-for-development-change-in-prod-12345678',
  jwtExpiresIn: '7d',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 32 bytes hex
  
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/meeting_actions?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
    localDir: process.env.STORAGE_LOCAL_DIR || path.join(__dirname, '../../uploads'),
  },

  diarization: {
    provider: (process.env.DIARIZATION_PROVIDER || 'deepgram') as 'deepgram' | 'pyannote' | 'mock',
    serviceUrl: process.env.DIARIZATION_SERVICE_URL || 'http://localhost:8000',
    hfToken: process.env.HF_TOKEN || '',
  },

  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || '',
    model: process.env.DEEPGRAM_MODEL || 'nova-2',
  },

  stt: {
    provider: (process.env.STT_PROVIDER || 'deepgram') as 'deepgram' | 'mock' | 'whisper' | 'cloud',
    apiKey: process.env.STT_API_KEY || '',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  },

  notion: {
    clientId: process.env.NOTION_CLIENT_ID || '',
    clientSecret: process.env.NOTION_CLIENT_SECRET || '',
    redirectUri: process.env.NOTION_REDIRECT_URI || 'http://localhost:4000/api/integrations/notion/callback',
  },

  privacy: {
    deleteRawAudioAfterProcessing: process.env.DELETE_RAW_AUDIO === 'true',
    audioRetentionHours: parseInt(process.env.AUDIO_RETENTION_HOURS || '24', 10),
  }
};
