import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { SessionStatus, Speaker } from '../types';

interface WaitingScreenProps {
  sessionId: string;
  onNavigateToReview: (sessionId: string) => void;
  onBackToDashboard: () => void;
}

export const WaitingScreen: React.FC<WaitingScreenProps> = ({
  sessionId,
  onNavigateToReview,
  onBackToDashboard,
}) => {
  const [status, setStatus] = useState<SessionStatus>('UPLOADED');
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [merges, setMerges] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Status check & speaker fetch
  const fetchStatusAndSpeakers = async () => {
    try {
      const statusRes = await api.getSessionStatus(sessionId);
      setStatus(statusRes.status);
      setError(statusRes.error);

      if (statusRes.status === 'REVIEW' || statusRes.status === 'EXPORTED') {
        onNavigateToReview(sessionId);
        return;
      }

      if (statusRes.status === 'AWAITING_SPEAKER_NAMES') {
        const spRes = await api.getSpeakers(sessionId);
        setSpeakers(spRes.speakers);
        // Pre-populate display names
        const initialNames: Record<string, string> = {};
        spRes.speakers.forEach(s => {
          initialNames[s.label] = s.displayName || s.label;
        });
        setNames(prev => ({ ...initialNames, ...prev }));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchStatusAndSpeakers();

    // 1. Server-Sent Events (SSE)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/sessions/${sessionId}/events`);
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status) {
            setStatus(data.status);
            if (data.error) setError(data.error);
            if (data.status === 'AWAITING_SPEAKER_NAMES') {
              fetchStatusAndSpeakers();
            } else if (data.status === 'REVIEW' || data.status === 'EXPORTED') {
              onNavigateToReview(sessionId);
            }
          }
        } catch (err) {
          // ignore parse error
        }
      };
    } catch (e) {
      console.warn('SSE failed, relying on polling fallback');
    }

    // 2. 3-second Polling Fallback
    const interval = setInterval(fetchStatusAndSpeakers, 3000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, [sessionId]);

  const handleSubmitSpeakers = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = speakers.map(s => ({
        label: s.label,
        displayName: names[s.label] || s.label,
        mergeInto: merges[s.label] || undefined,
        skip: !!skipped[s.label],
      }));

      await api.updateSpeakers(sessionId, payload);
      setStatus('TRANSCRIBING');
    } catch (err: any) {
      alert(`Failed to save speaker names: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.retrySession(sessionId);
      setError(null);
      await fetchStatusAndSpeakers();
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px' }}>
      <button
        onClick={onBackToDashboard}
        style={{ marginBottom: 16, background: 'none', border: '1px solid #475569', color: '#cbd5e1', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
      >
        ← Back to Dashboard
      </button>

      {/* STATE 1: UPLOADING */}
      {status === 'UPLOADING' && (
        <div style={{ background: '#1e293b', padding: 30, borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
          <h2 style={{ margin: '0 0 10px 0' }}>Uploading your recording...</h2>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Audio chunks are being transferred from the browser recorder.</p>
          <div style={{ width: '100%', height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden', marginTop: 20 }}>
            <div style={{ width: '60%', height: '100%', background: '#3b82f6', animation: 'pulse 1s infinite' }} />
          </div>
        </div>
      )}

      {/* STATE 2: UPLOADED / DIARIZING */}
      {(status === 'UPLOADED' || status === 'DIARIZING') && (
        <div style={{ background: '#1e293b', padding: 36, borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎙️</div>
          <h2 style={{ margin: '0 0 8px 0' }}>Separating voices...</h2>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 20px 0' }}>
            pyannote AI is detecting speaker turns across your meeting track.
          </p>
          <div style={{ display: 'inline-block', padding: '8px 16px', background: '#0f172a', borderRadius: 20, fontSize: 13, color: '#38bdf8' }}>
            ℹ️ You may close this tab and return anytime — your session is saved on your dashboard.
          </div>
        </div>
      )}

      {/* STATE 3: AWAITING_SPEAKER_NAMES */}
      {status === 'AWAITING_SPEAKER_NAMES' && (
        <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, border: '1px solid #334155' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20 }}>Name the Meeting Speakers</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 20px 0' }}>
            Listen to clean voice snippets extracted from each speaker turn, then provide their real names or merge duplicates.
          </p>

          <form onSubmit={handleSubmitSpeakers}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {speakers.map((sp) => {
                const isSkipped = !!skipped[sp.label];
                return (
                  <div
                    key={sp.label}
                    style={{
                      background: '#0f172a',
                      padding: 16,
                      borderRadius: 8,
                      border: '1px solid #334155',
                      opacity: isSkipped ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: 14, color: '#f8fafc' }}>
                        {sp.label === 'mic' ? 'You (Microphone)' : `Voice: ${sp.label}`}
                      </strong>
                      <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isSkipped}
                          onChange={(e) => setSkipped({ ...skipped, [sp.label]: e.target.checked })}
                        />
                        Skip speaker
                      </label>
                    </div>

                    {/* Audio Clips */}
                    {sp.clipPaths && sp.clipPaths.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Audio Samples:</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {sp.clipPaths.map((clipUrl, idx) => (
                            <audio key={idx} controls src={clipUrl} style={{ height: 32, maxWidth: 220 }} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Speaker Name Input & Merge Selector */}
                    {!isSkipped && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={names[sp.label] || ''}
                            onChange={(e) => setNames({ ...names, [sp.label]: e.target.value })}
                            placeholder={`e.g. Raj, Riya, Alex`}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: 13 }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                            Merge into another speaker (Optional)
                          </label>
                          <select
                            value={merges[sp.label] || ''}
                            onChange={(e) => setMerges({ ...merges, [sp.label]: e.target.value })}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: 13 }}
                          >
                            <option value="">-- No Merge (Independent) --</option>
                            {speakers.filter(other => other.label !== sp.label).map(other => (
                              <option key={other.label} value={names[other.label] || other.label}>
                                Merge into {names[other.label] || other.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 20,
                width: '100%',
                padding: 12,
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              {submitting ? 'Submitting...' : 'Confirm Names & Begin Transcription'}
            </button>
          </form>
        </div>
      )}

      {/* STATE 4: TRANSCRIBING & STRUCTURING */}
      {(status === 'TRANSCRIBING' || status === 'STRUCTURING') && (
        <div style={{ background: '#1e293b', padding: 36, borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚙️</div>
          <h2 style={{ margin: '0 0 8px 0' }}>
            {status === 'TRANSCRIBING' ? 'Transcribing Audio...' : 'Extracting Action Items with Gemini...'}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            {status === 'TRANSCRIBING'
              ? 'Converting speech to text and aligning word timestamps with your speaker names.'
              : 'Gemini LLM is extracting structured action items, owners, and due dates.'}
          </p>
        </div>
      )}

      {/* STATE 5: FAILED */}
      {status === 'FAILED' && (
        <div style={{ background: '#450a0a', padding: 24, borderRadius: 8, border: '1px solid #991b1b', textAlign: 'center' }}>
          <h2 style={{ color: '#fca5a5', margin: '0 0 8px 0' }}>Pipeline Step Failed</h2>
          <p style={{ color: '#fecaca', fontSize: 14, margin: '0 0 16px 0' }}>
            {error || 'An unexpected error occurred during processing.'}
          </p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
          >
            {retrying ? 'Retrying...' : 'Retry Failed Step'}
          </button>
        </div>
      )}
    </div>
  );
};
