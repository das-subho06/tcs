export type SessionStatus =
  | 'RECORDING'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'DIARIZING'
  | 'AWAITING_SPEAKER_NAMES'
  | 'TRANSCRIBING'
  | 'STRUCTURING'
  | 'REVIEW'
  | 'EXPORTED'
  | 'FAILED';

export interface User {
  id: string;
  email: string;
}

export interface Session {
  id: string;
  userId: string;
  source: 'extension' | 'upload_audio' | 'upload_transcript';
  status: SessionStatus;
  meetingDate: string;
  title: string;
  partial: boolean;
  error?: string | null;
  retryableStep?: string | null;
  createdAt: string;
  _count?: {
    actionItems: number;
    speakers: number;
  };
}

export interface Speaker {
  id: string;
  label: string;
  displayName: string;
  clipPaths: string[];
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  start: number;
  end: number;
  speakerName: string;
  text: string;
}

export interface ActionItem {
  id: string;
  sessionId: string;
  action: string;
  owner: string;
  dueRaw?: string | null;
  dueDate?: string | null;
  assignedBy: string;
  sourceQuote: string;
  timestamp: number;
  confidence: number;
  done: boolean;
  edited: boolean;
}
