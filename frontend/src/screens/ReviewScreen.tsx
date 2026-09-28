import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { ActionItem, TranscriptSegment } from '../types';

interface ReviewScreenProps {
  sessionId: string;
  onBackToDashboard: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ sessionId, onBackToDashboard }) => {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quote source modal
  const [activeQuote, setActiveQuote] = useState<{ quote: string; timestamp: number } | null>(null);

  // Notion Export Modal
  const [showNotionModal, setShowNotionModal] = useState(false);
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedParentPage, setSelectedParentPage] = useState<string>('');
  const [exportingNotion, setExportingNotion] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [actionsRes, transcriptRes] = await Promise.all([
        api.getActionItems(sessionId),
        api.getTranscript(sessionId).catch(() => []),
      ]);
      setItems(actionsRes.actionItems);
      setSpeakers(actionsRes.speakers || []);
      setTranscript(transcriptRes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const handleUpdateItem = async (actionId: string, updates: Partial<ActionItem>) => {
    // Optimistic UI update
    setItems(prev => prev.map(item => item.id === actionId ? { ...item, ...updates } : item));
    try {
      await api.updateActionItem(sessionId, actionId, updates);
    } catch (err: any) {
      alert(`Failed to save edit: ${err.message}`);
      loadData();
    }
  };

  const handleDeleteItem = async (actionId: string) => {
    setItems(prev => prev.filter(item => item.id !== actionId));
    try {
      await api.deleteActionItem(sessionId, actionId);
    } catch (err: any) {
      alert(`Failed to delete item: ${err.message}`);
      loadData();
    }
  };

  const handleAddItem = async () => {
    try {
      const newItem = await api.createActionItem(sessionId, {
        action: 'New action item',
        owner: speakers[0] || 'Unassigned',
        assignedBy: 'Unassigned',
        confidence: 1.0,
      });
      setItems(prev => [...prev, newItem]);
    } catch (err: any) {
      alert(`Failed to add action item: ${err.message}`);
    }
  };

  const handleExportExcel = () => {
    window.location.href = api.getExcelDownloadUrl(sessionId);
  };

  const handleOpenNotionExport = async () => {
    try {
      const res = await api.getNotionPages();
      setNotionPages(res.pages);
      if (res.pages.length > 0) setSelectedParentPage(res.pages[0].id);
      setShowNotionModal(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleConfirmNotionExport = async () => {
    if (!selectedParentPage) {
      alert('Please select a Notion parent page.');
      return;
    }
    setExportingNotion(true);
    try {
      const res = await api.exportToNotion(sessionId, selectedParentPage);
      alert('Action items successfully exported to Notion!');
      setShowNotionModal(false);
    } catch (err: any) {
      alert(`Notion export error: ${err.message}`);
    } finally {
      setExportingNotion(false);
    }
  };

  return (
    <div style={{ maxWidth: 1040, margin: '30px auto', padding: '0 16px' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button
          onClick={onBackToDashboard}
          style={{ background: 'none', border: '1px solid #475569', color: '#cbd5e1', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          ← Back to Dashboard
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleExportExcel}
            style={{ padding: '8px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            📊 Export to Excel (.xlsx)
          </button>
          <button
            onClick={handleOpenNotionExport}
            style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            📝 Export to Notion
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Action Items Review</h2>
        <button
          onClick={handleAddItem}
          style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          + Add Action Item
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading action items...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: '#1e293b', borderRadius: 8, color: '#94a3b8' }}>
          No action items detected. Click "+ Add Action Item" to add one manually.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => {
            const isLowConfidence = item.confidence < 0.85;

            return (
              <div
                key={item.id}
                style={{
                  background: '#1e293b',
                  padding: 14,
                  borderRadius: 8,
                  border: isLowConfidence ? '1px solid #f59e0b' : '1px solid #334155',
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 140px 180px 140px 90px 40px',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                {/* Done Checkbox */}
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => handleUpdateItem(item.id, { done: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />

                {/* Action Input */}
                <div>
                  <input
                    type="text"
                    value={item.action}
                    onChange={(e) => handleUpdateItem(item.id, { action: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 4,
                      border: '1px solid #475569',
                      background: '#0f172a',
                      color: item.done ? '#94a3b8' : '#fff',
                      textDecoration: item.done ? 'line-through' : 'none',
                      fontSize: 13,
                    }}
                  />
                  {isLowConfidence && (
                    <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 3 }}>
                      ⚠️ Low confidence ({Math.round(item.confidence * 100)}%)
                    </div>
                  )}
                </div>

                {/* Owner Dropdown */}
                <select
                  value={item.owner}
                  onChange={(e) => handleUpdateItem(item.id, { owner: e.target.value })}
                  style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 12 }}
                >
                  <option value="Unassigned">Unassigned</option>
                  {speakers.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  {!speakers.includes(item.owner) && item.owner !== 'Unassigned' && (
                    <option value={item.owner}>{item.owner}</option>
                  )}
                </select>

                {/* Due Date & due_raw hint */}
                <div>
                  <input
                    type="date"
                    value={item.dueDate ? item.dueDate.split('T')[0] : ''}
                    onChange={(e) => handleUpdateItem(item.id, { dueDate: e.target.value || null })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 12 }}
                  />
                  {item.dueRaw && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Hint: "{item.dueRaw}"
                    </div>
                  )}
                </div>

                {/* Assigned By */}
                <input
                  type="text"
                  value={item.assignedBy}
                  placeholder="Assigned By"
                  onChange={(e) => handleUpdateItem(item.id, { assignedBy: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 12 }}
                />

                {/* Jump to Source */}
                <button
                  onClick={() => setActiveQuote({ quote: item.sourceQuote, timestamp: item.timestamp })}
                  style={{ background: 'none', border: '1px solid #38bdf8', color: '#38bdf8', padding: '4px 6px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                >
                  Source ({item.timestamp.toFixed(0)}s)
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer' }}
                  title="Delete Item"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Quote Preview Modal */}
      {activeQuote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, maxWidth: 500, width: '90%', border: '1px solid #475569' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Source Quote (at {activeQuote.timestamp.toFixed(1)}s)</h3>
            <blockquote style={{ margin: '0 0 16px 0', padding: '10px 14px', background: '#0f172a', borderLeft: '4px solid #38bdf8', fontStyle: 'italic', color: '#e2e8f0' }}>
              "{activeQuote.quote}"
            </blockquote>
            <button
              onClick={() => setActiveQuote(null)}
              style={{ padding: '6px 14px', background: '#334155', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Notion Export Modal */}
      {showNotionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, maxWidth: 440, width: '90%', border: '1px solid #475569' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Export to Notion</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 14px 0' }}>
              Choose a parent page in your Notion workspace to create an Action Items page.
            </p>
            <select
              value={selectedParentPage}
              onChange={(e) => setSelectedParentPage(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff', marginBottom: 16 }}
            >
              {notionPages.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowNotionModal(false)}
                style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNotionExport}
                disabled={exportingNotion}
                style={{ padding: '6px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                {exportingNotion ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
