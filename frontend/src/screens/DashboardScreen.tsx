import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Session, User } from '../types';

interface DashboardScreenProps {
  user: User;
  onOpenSession: (sessionId: string, mode: 'speakers' | 'review') => void;
  onLogout: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ user, onOpenSession, onLogout }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload Audio State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioTitle, setAudioTitle] = useState('');
  const [identifySpeakers, setIdentifySpeakers] = useState(true);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  // Upload Transcript State
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptTitle, setTranscriptTitle] = useState('');
  const [uploadingTranscript, setUploadingTranscript] = useState(false);

  // Notion Status
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionWorkspace, setNotionWorkspace] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sessList, notionRes] = await Promise.all([
        api.listSessions(),
        api.getNotionStatus().catch(() => ({ connected: false, workspaceName: null })),
      ]);
      setSessions(sessList);
      setNotionConnected(notionRes.connected);
      setNotionWorkspace(notionRes.workspaceName || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAudioUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) return;

    try {
      setUploadingAudio(true);
      const res = await api.uploadAudio(audioFile, identifySpeakers, audioTitle || undefined);
      setAudioFile(null);
      setAudioTitle('');
      onOpenSession(res.sessionId, identifySpeakers ? 'speakers' : 'review');
    } catch (err: any) {
      alert(`Audio upload failed: ${err.message}`);
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleTranscriptUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcriptFile) return;

    try {
      setUploadingTranscript(true);
      const res = await api.uploadTranscript(transcriptFile, transcriptTitle || undefined);
      setTranscriptFile(null);
      setTranscriptTitle('');
      onOpenSession(res.sessionId, 'review');
    } catch (err: any) {
      alert(`Transcript upload failed: ${err.message}`);
    } finally {
      setUploadingTranscript(false);
    }
  };

  const handleConnectNotion = async () => {
    try {
      const { authUrl } = await api.getNotionAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const [tokenCopied, setTokenCopied] = useState(false);

  const handleCopyToken = () => {
    const token = localStorage.getItem('token') || '';
    if (!token) {
      alert('No auth token found in session.');
      return;
    }
    navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2500);
  };

  return (
    <div style={{ maxWidth: 960, margin: '30px auto', padding: '0 16px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #334155' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#f8fafc' }}>Meeting Action Items Dashboard</h1>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Signed in as: <strong>{user.email}</strong></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleCopyToken}
            style={{
              fontSize: 12,
              background: tokenCopied ? '#059669' : '#3b82f6',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {tokenCopied ? '✓ Token Copied!' : '🔑 Copy Extension Token'}
          </button>
          {notionConnected ? (
            <span style={{ fontSize: 12, background: '#065f46', color: '#6ee7b7', padding: '4px 8px', borderRadius: 4 }}>
              ✓ Notion Connected ({notionWorkspace || 'Workspace'})
            </span>
          ) : (
            <button
              onClick={handleConnectNotion}
              style={{ fontSize: 12, background: '#1e293b', border: '1px solid #475569', color: '#f8fafc', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
            >
              Connect Notion
            </button>
          )}
          <button
            onClick={onLogout}
            style={{ fontSize: 12, background: '#334155', border: 'none', color: '#f8fafc', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Part B: Upload Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 32 }}>
        {/* Audio Upload */}
        <div style={{ background: '#1e293b', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Upload Audio File</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px 0' }}>Supports .mp3, .wav, .m4a, .webm</p>
          <form onSubmit={handleAudioUpload} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              placeholder="Meeting Title (optional)"
              value={audioTitle}
              onChange={(e) => setAudioTitle(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 13 }}
            />
            <input
              type="file"
              accept=".mp3,.wav,.m4a,.webm"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              required
              style={{ fontSize: 13, color: '#cbd5e1' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={identifySpeakers}
                onChange={(e) => setIdentifySpeakers(e.target.checked)}
              />
              Identify speakers (run voice separation & naming)
            </label>
            <button
              type="submit"
              disabled={uploadingAudio || !audioFile}
              style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >
              {uploadingAudio ? 'Uploading...' : 'Upload & Process Audio'}
            </button>
          </form>
        </div>

        {/* Transcript Upload */}
        <div style={{ background: '#1e293b', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Upload Transcript File</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px 0' }}>Supports .txt, .srt, .vtt, .docx</p>
          <form onSubmit={handleTranscriptUpload} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              placeholder="Meeting Title (optional)"
              value={transcriptTitle}
              onChange={(e) => setTranscriptTitle(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 13 }}
            />
            <input
              type="file"
              accept=".txt,.srt,.vtt,.docx"
              onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
              required
              style={{ fontSize: 13, color: '#cbd5e1' }}
            />
            <button
              type="submit"
              disabled={uploadingTranscript || !transcriptFile}
              style={{ marginTop: 24, padding: '8px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >
              {uploadingTranscript ? 'Uploading...' : 'Extract Action Items from Transcript'}
            </button>
          </form>
        </div>
      </div>

      {/* Past Sessions List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Past Sessions</h2>
          <button
            onClick={loadData}
            style={{ fontSize: 12, background: 'none', border: '1px solid #475569', color: '#cbd5e1', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, background: '#1e293b', borderRadius: 8, color: '#94a3b8' }}>
            No sessions found. Record with Chrome extension or upload a file above!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map((sess) => {
              const isAwaitingNaming = sess.status === 'AWAITING_SPEAKER_NAMES';
              const isReadyForReview = sess.status === 'REVIEW' || sess.status === 'EXPORTED';
              const isProcessing = ['UPLOADING', 'UPLOADED', 'DIARIZING', 'TRANSCRIBING', 'STRUCTURING'].includes(sess.status);

              return (
                <div
                  key={sess.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 18px',
                    background: '#1e293b',
                    borderRadius: 8,
                    border: '1px solid #334155',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#f8fafc' }}>
                      {sess.title}
                      {sess.partial && (
                        <span style={{ marginLeft: 8, fontSize: 11, background: '#78350f', color: '#fde68a', padding: '2px 6px', borderRadius: 4 }}>
                          Partial Audio
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Date: {new Date(sess.meetingDate).toLocaleDateString()} | Source: {sess.source} | Action Items: {sess._count?.actionItems ?? 0}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                        background:
                          isAwaitingNaming ? '#f59e0b' :
                          isReadyForReview ? '#10b981' :
                          sess.status === 'FAILED' ? '#ef4444' : '#64748b',
                        color: isAwaitingNaming ? '#000' : '#fff',
                      }}
                    >
                      {isAwaitingNaming ? 'Needs speaker names' : sess.status}
                    </span>

                    {isAwaitingNaming && (
                      <button
                        onClick={() => onOpenSession(sess.id, 'speakers')}
                        style={{ padding: '6px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Name Speakers
                      </button>
                    )}

                    {isReadyForReview && (
                      <button
                        onClick={() => onOpenSession(sess.id, 'review')}
                        style={{ padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Review Items
                      </button>
                    )}

                    {isProcessing && (
                      <button
                        onClick={() => onOpenSession(sess.id, 'speakers')}
                        style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
                      >
                        View Progress
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
