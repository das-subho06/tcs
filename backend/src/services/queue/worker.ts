import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../../config';
import { pipelineProcessor } from '../pipeline/processor';
import { JobType } from './queue';

const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const worker = new Worker(
  'meeting-pipeline',
  async (job: Job<{ sessionId: string } & any, void, JobType>) => {
    const { sessionId } = job.data;
    const startTime = Date.now();
    console.log(`[Worker] Starting job ${job.name} for session: ${sessionId}`);

    try {
      switch (job.name) {
        case 'PROCESS_AUDIO':
          await pipelineProcessor.processAudio(sessionId);
          break;
        case 'RESUME_SPEAKER_NAMING':
          await pipelineProcessor.resumeAfterSpeakerNaming(sessionId);
          break;
        case 'RETRY_STEP':
          await pipelineProcessor.retryStep(sessionId);
          break;
        default:
          console.warn(`[Worker] Unknown job type: ${job.name}`);
      }
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Worker] Completed job ${job.name} for session: ${sessionId} in ${duration}s`);
    } catch (err: any) {
      console.error(`[Worker] Failed job ${job.name} for session: ${sessionId}:`, err);
      throw err;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on('ready', () => {
  console.log('[Worker] BullMQ Worker is ready and listening for jobs.');
});

worker.on('error', (err) => {
  console.error('[Worker] Error:', err);
});
