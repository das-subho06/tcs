import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../../config';
import { pipelineProcessor } from '../pipeline/processor';

let redisConnection: IORedis | null = null;
let pipelineQueue: Queue | null = null;

try {
  redisConnection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying to avoid hanging in tests
      return Math.min(times * 100, 1000);
    },
    lazyConnect: true,
  });

  redisConnection.on('error', (err) => {
    // Graceful warning if Redis is not currently running
    // console.warn('Redis connection issue, falling back to direct asynchronous processing');
  });

  pipelineQueue = new Queue('meeting-pipeline', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
} catch (e) {
  console.warn('BullMQ initialization skipped, direct processing enabled');
}

export type JobType = 'PROCESS_AUDIO' | 'RESUME_SPEAKER_NAMING' | 'RETRY_STEP';

export async function dispatchPipelineJob(type: JobType, sessionId: string, data?: any): Promise<void> {
  let queued = false;

  if (pipelineQueue && redisConnection && redisConnection.status === 'ready') {
    try {
      await pipelineQueue.add(type, { sessionId, ...data }, { jobId: `${type}-${sessionId}-${Date.now()}` });
      queued = true;
    } catch (e) {
      console.warn('Queue add failed, executing directly in background:', e);
    }
  }

  if (!queued) {
    // Direct asynchronous execution fallback
    setImmediate(async () => {
      try {
        if (type === 'PROCESS_AUDIO') {
          await pipelineProcessor.processAudio(sessionId);
        } else if (type === 'RESUME_SPEAKER_NAMING') {
          await pipelineProcessor.resumeAfterSpeakerNaming(sessionId);
        } else if (type === 'RETRY_STEP') {
          await pipelineProcessor.retryStep(sessionId);
        }
      } catch (err) {
        console.error(`Direct pipeline processing error for session ${sessionId}:`, err);
      }
    });
  }
}

export { pipelineQueue, redisConnection };
