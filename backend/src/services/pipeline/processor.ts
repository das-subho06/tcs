import path from 'path';
import { prisma } from '../../db';
import { storage } from '../storage';
import { diarizationClient } from '../diarization/client';
import { stt } from '../stt';
import { geminiStructuring } from '../llm/gemini';
import { assembleAndNormalizeAudio } from './audioAssembly';
import { selectCleanTurns, cutClip } from './clipGeneration';
import { assignSpeakersToTabSegments, mergeAndSortTracks, AlignedSegment } from './transcriptAlignment';
import { config } from '../../config';
import { sseManager } from '../sse';

export class PipelineProcessor {
  async processAudio(sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { audioChunks: true },
    });

    if (!session) throw new Error(`Session ${sessionId} not found`);

    try {
      await this.updateStatus(sessionId, 'DIARIZING', 'DIARIZING');

      const tabChunks = session.audioChunks.filter(c => c.track === 'tab');
      const micChunks = session.audioChunks.filter(c => c.track === 'mic');

      // Assemble tab track
      const tabWavName = `sessions/${sessionId}/tab.wav`;
      const tabWavFullPath = storage.getFilePath(tabWavName);

      const tabResult = await assembleAndNormalizeAudio(
        tabChunks.map(c => ({ sequenceNum: c.sequenceNum, path: c.path })),
        tabWavFullPath
      );

      // Save tab audio track record
      await prisma.audioTrack.upsert({
        where: { sessionId_track: { sessionId, track: 'tab' } },
        create: { sessionId, track: 'tab', path: tabWavFullPath },
        update: { path: tabWavFullPath },
      });

      // Update partial flag if chunks missing
      if (tabResult.isPartial) {
        await prisma.session.update({
          where: { id: sessionId },
          data: { partial: true },
        });
      }

      // Assemble mic track if present
      if (micChunks.length > 0) {
        const micWavName = `sessions/${sessionId}/mic.wav`;
        const micWavFullPath = storage.getFilePath(micWavName);
        await assembleAndNormalizeAudio(
          micChunks.map(c => ({ sequenceNum: c.sequenceNum, path: c.path })),
          micWavFullPath
        );
        await prisma.audioTrack.upsert({
          where: { sessionId_track: { sessionId, track: 'mic' } },
          create: { sessionId, track: 'mic', path: micWavFullPath },
          update: { path: micWavFullPath },
        });
      }

      // Run diarization on TAB track
      const turns = await diarizationClient.diarize(tabWavFullPath);

      // Select clean turns & generate clips
      const clipsMap = selectCleanTurns(turns);

      for (const [speakerLabel, clips] of clipsMap.entries()) {
        const clipPaths: string[] = [];
        for (let idx = 0; idx < clips.length; idx++) {
          const clip = clips[idx];
          const clipRelativePath = `sessions/${sessionId}/clips/${speakerLabel}_clip_${idx}.mp3`;
          const clipFullPath = storage.getFilePath(clipRelativePath);
          await cutClip(tabWavFullPath, clip.start, clip.duration, clipFullPath);
          clipPaths.push(storage.getPublicUrl(clipRelativePath));
        }

        await prisma.speaker.upsert({
          where: { sessionId_label: { sessionId, label: speakerLabel } },
          create: {
            sessionId,
            label: speakerLabel,
            displayName: speakerLabel,
            clipPaths: JSON.stringify(clipPaths),
          },
          update: {
            clipPaths: JSON.stringify(clipPaths),
          },
        });
      }

      // Ensure "You" speaker exists for MIC track
      await prisma.speaker.upsert({
        where: { sessionId_label: { sessionId, label: 'mic' } },
        create: {
          sessionId,
          label: 'mic',
          displayName: 'You',
          clipPaths: '[]',
        },
        update: {},
      });

      await this.updateStatus(sessionId, 'AWAITING_SPEAKER_NAMES');
    } catch (err: any) {
      console.error(`Pipeline error in processAudio for session ${sessionId}:`, err);
      await this.failSession(sessionId, err.message, 'DIARIZING');
      throw err;
    }
  }

  async resumeAfterSpeakerNaming(sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { speakers: true, audioTracks: true },
    });

    if (!session) throw new Error(`Session ${sessionId} not found`);

    try {
      await this.updateStatus(sessionId, 'TRANSCRIBING', 'TRANSCRIBING');

      const tabTrack = session.audioTracks.find(t => t.track === 'tab');
      const micTrack = session.audioTracks.find(t => t.track === 'mic');

      if (!tabTrack && !micTrack) {
        throw new Error('No audio tracks found to transcribe');
      }

      // Map labels to display names
      const speakerNameMap = new Map<string, string>();
      for (const sp of session.speakers) {
        speakerNameMap.set(sp.label, sp.displayName);
      }

      let alignedTabSegments: AlignedSegment[] = [];
      if (tabTrack) {
        const tabSttResult = await stt.transcribe(tabTrack.path);
        // Turns from diarization
        const turns = await diarizationClient.diarize(tabTrack.path);
        alignedTabSegments = assignSpeakersToTabSegments(tabSttResult.segments, turns, speakerNameMap);
      }

      let micTimedSegments: Array<{ start: number; end: number; text: string }> = [];
      const micSpeaker = session.speakers.find(s => s.label === 'mic')?.displayName || 'You';

      if (micTrack) {
        const micSttResult = await stt.transcribe(micTrack.path);
        micTimedSegments = micSttResult.segments;
      }

      // Merge tracks and filter acoustic echo
      const finalSegments = mergeAndSortTracks(alignedTabSegments, micTimedSegments, micSpeaker);

      // Save transcript segments into DB
      await prisma.transcriptSegment.deleteMany({ where: { sessionId } });
      for (const seg of finalSegments) {
        const matchedSpeaker = session.speakers.find(s => s.displayName === seg.speaker_name);
        await prisma.transcriptSegment.create({
          data: {
            sessionId,
            start: seg.start,
            end: seg.end,
            speakerName: seg.speaker_name,
            speakerId: matchedSpeaker?.id || null,
            text: seg.text,
          },
        });
      }

      // Step: Structuring with Gemini
      await this.updateStatus(sessionId, 'STRUCTURING', 'STRUCTURING');

      const speakerNames = session.speakers.map(s => s.displayName);
      const actionItems = await geminiStructuring.extractActionItems({
        transcript: finalSegments,
        meetingDate: session.meetingDate,
        speakerNames,
      });

      // Save action items to DB
      await prisma.actionItem.deleteMany({ where: { sessionId } });
      for (const item of actionItems) {
        await prisma.actionItem.create({
          data: {
            sessionId,
            action: item.action,
            owner: item.owner,
            dueRaw: item.due_raw,
            dueDate: item.due_date ? new Date(item.due_date) : null,
            assignedBy: item.assigned_by,
            sourceQuote: item.source_quote,
            timestamp: item.timestamp,
            confidence: item.confidence,
            done: false,
            edited: false,
          },
        });
      }

      // Retention cleanup if enabled
      if (config.privacy.deleteRawAudioAfterProcessing) {
        for (const track of session.audioTracks) {
          await storage.deleteFile(track.path).catch(() => {});
        }
      }

      await this.updateStatus(sessionId, 'REVIEW');
    } catch (err: any) {
      console.error(`Pipeline error in resumeAfterSpeakerNaming for session ${sessionId}:`, err);
      await this.failSession(sessionId, err.message, 'TRANSCRIBING');
      throw err;
    }
  }

  async processTranscriptUpload(
    sessionId: string,
    segments: AlignedSegment[],
    speakerNames: string[]
  ): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    try {
      await this.updateStatus(sessionId, 'STRUCTURING', 'STRUCTURING');

      // Save speakers
      for (const name of speakerNames) {
        await prisma.speaker.upsert({
          where: { sessionId_label: { sessionId, label: name } },
          create: { sessionId, label: name, displayName: name, clipPaths: '[]' },
          update: { displayName: name },
        });
      }

      // Save transcript segments
      await prisma.transcriptSegment.deleteMany({ where: { sessionId } });
      for (const seg of segments) {
        await prisma.transcriptSegment.create({
          data: {
            sessionId,
            start: seg.start,
            end: seg.end,
            speakerName: seg.speaker_name,
            text: seg.text,
          },
        });
      }

      // Extract action items
      const actionItems = await geminiStructuring.extractActionItems({
        transcript: segments,
        meetingDate: session.meetingDate,
        speakerNames,
      });

      await prisma.actionItem.deleteMany({ where: { sessionId } });
      for (const item of actionItems) {
        await prisma.actionItem.create({
          data: {
            sessionId,
            action: item.action,
            owner: item.owner,
            dueRaw: item.due_raw,
            dueDate: item.due_date ? new Date(item.due_date) : null,
            assignedBy: item.assigned_by,
            sourceQuote: item.source_quote,
            timestamp: item.timestamp,
            confidence: item.confidence,
            done: false,
            edited: false,
          },
        });
      }

      await this.updateStatus(sessionId, 'REVIEW');
    } catch (err: any) {
      console.error(`Pipeline error in processTranscriptUpload for session ${sessionId}:`, err);
      await this.failSession(sessionId, err.message, 'STRUCTURING');
      throw err;
    }
  }

  async retryStep(sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const step = session.retryableStep || 'DIARIZING';
    if (step === 'DIARIZING') {
      await this.processAudio(sessionId);
    } else if (step === 'TRANSCRIBING' || step === 'STRUCTURING') {
      await this.resumeAfterSpeakerNaming(sessionId);
    }
  }

  private async updateStatus(sessionId: string, status: any, retryableStep?: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status, error: null, retryableStep: retryableStep || null },
    });
    sseManager.broadcastSessionEvent(sessionId, {
      status,
      timestamp: Date.now(),
    });
  }

  private async failSession(sessionId: string, errorMessage: string, retryableStep: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'FAILED', error: errorMessage, retryableStep },
    });
    sseManager.broadcastSessionEvent(sessionId, {
      status: 'FAILED',
      error: errorMessage,
      retryableStep,
      timestamp: Date.now(),
    });
  }
}

export const pipelineProcessor = new PipelineProcessor();
