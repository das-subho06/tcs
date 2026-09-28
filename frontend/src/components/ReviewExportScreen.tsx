import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';

interface ActionItem {
  id: string;
  action: string;
  owner: string;
  dueLabel: string;
  assignedBy: string;
  done: boolean;
  confidence: number;
}

interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

const KNOWN_SPEAKERS = ['Raj', 'Riya', 'Amit', 'You'];

const INITIAL_ITEMS: ActionItem[] = [
  { id: 'a1', action: 'Send updated pricing sheet', owner: 'Riya', dueLabel: 'Fri, Sep 26', assignedBy: 'Raj', done: false, confidence: 0.95 },
  { id: 'a2', action: 'Prepare Q3 report', owner: 'Amit', dueLabel: 'Mon, Sep 29', assignedBy: 'Raj', done: false, confidence: 0.9 },
  { id: 'a3', action: 'Share meeting notes', owner: 'Riya', dueLabel: 'Today', assignedBy: 'You', done: false, confidence: 0.55 },
  { id: 'a4', action: 'Follow up with client', owner: 'Amit', dueLabel: 'Wed, Oct 2', assignedBy: 'Riya', done: false, confidence: 0.8 },
  { id: 'a5', action: 'Update project plan', owner: 'You', dueLabel: 'Thu, Oct 3', assignedBy: 'Amit', done: false, confidence: 0.7 },
];

const TRANSCRIPT: TranscriptLine[] = [
  { time: '00:00', speaker: 'Raj', text: 'Riya, can you send the updated pricing sheet by Friday?' },
  { time: '00:04', speaker: 'Riya', text: "Yes, I'll do that." },
  { time: '00:07', speaker: 'Raj', text: "Also, let's prepare the Q3 report before Monday." },
  { time: '00:12', speaker: 'Amit', text: "I'll take care of that." },
  { time: '00:16', speaker: 'Riya', text: "I'll share the meeting notes after this call." },
  { time: '00:22', speaker: 'Amit', text: 'I can follow up with the client on Wednesday.' },
  { time: '00:28', speaker: 'You', text: "I'll update the project plan by Thursday." },
];

const STEPS = ['Upload', 'Speakers', 'Transcript', 'Review', 'Export'];

interface ReviewExportScreenProps {
  sessionTitle?: string;
  sessionMeta?: string;
  onBack?: () => void;
  onExported?: (type: 'excel' | 'notion') => void;
  onNavigate?: (route: 'dashboard' | 'sessions' | 'settings') => void;
}

const ReviewExportScreen: React.FC<ReviewExportScreenProps> = ({
  sessionTitle = 'Product Sync Meeting',
  sessionMeta = 'Sep 24, 2025 · 10:32 AM · 32 min',
  onBack,
  onExported,
  onNavigate,
}) => {
  const [items, setItems] = useState<ActionItem[]>(INITIAL_ITEMS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionItem | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'notion' | null>(null);
  const [notionConnected, setNotionConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleDone = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };

  const startEdit = (item: ActionItem) => {
    setEditingId(item.id);
    setDraft({ ...item });
    setExportMenuOpen(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!draft) return;
    setItems((prev) => prev.map((it) => (it.id === draft.id ? draft : it)));
    setEditingId(null);
    setDraft(null);
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (editingId === id) cancelEdit();
  };

  const addItem = () => {
    const id = `a${Date.now()}`;
    const newItem: ActionItem = {
      id,
      action: '',
      owner: KNOWN_SPEAKERS[0],
      dueLabel: '',
      assignedBy: KNOWN_SPEAKERS[0],
      done: false,
      confidence: 1,
    };
    setItems((prev) => [...prev, newItem]);
    startEdit(newItem);
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setToast('Changes saved');
    }, 700);
  };

  const handleExport = (type: 'excel' | 'notion') => {
    setExportMenuOpen(false);
    if (type === 'notion' && !notionConnected) {
      setExporting('notion');
      setTimeout(() => {
        setNotionConnected(true);
        setExporting(null);
        setToast('Notion connected — exporting…');
        setTimeout(() => {
          setToast('Exported to Notion');
          onExported?.('notion');
        }, 900);
      }, 1100);
      return;
    }
    setExporting(type);
    setTimeout(() => {
      setExporting(null);
      setToast(type === 'excel' ? 'Excel file downloaded' : 'Exported to Notion');
      onExported?.(type);
    }, 1200);
  };

  return (
    <View style={styles.root}>
      <View style={styles.topNav}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>◎</Text>
          </View>
          <Text style={styles.brandName}>Meet2Action</Text>
        </View>
        <View style={styles.navLinks}>
          <TouchableOpacity onPress={() => onNavigate?.('dashboard')}>
            <Text style={styles.navLink}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onNavigate?.('sessions')}>
            <Text style={[styles.navLink, styles.navLinkActive]}>Sessions</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onNavigate?.('settings')}>
            <Text style={styles.navLink}>Settings</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>P</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.stepper}>
          {STEPS.map((label, i) => {
            const stepIndex = i + 1;
            const isDone = stepIndex < 4;
            const isCurrent = stepIndex === 4;
            return (
              <React.Fragment key={label}>
                <View style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      isDone && styles.stepCircleDone,
                      isCurrent && styles.stepCircleCurrent,
                    ]}
                  >
                    <Text style={[styles.stepCircleText, (isDone || isCurrent) && styles.stepCircleTextActive]}>
                      {isDone ? '✓' : stepIndex}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]}>{label}</Text>
                </View>
                {i < STEPS.length - 1 && <View style={styles.stepConnector} />}
              </React.Fragment>
            );
          })}
        </View>

        <Text style={styles.heading}>Edit Action Items</Text>
        <Text style={styles.subheading}>Review the extracted action items and make any changes before exporting.</Text>

        {toast && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        <View style={styles.sessionCard}>
          <View style={styles.sessionCardIcon}>
            <Text style={{ fontSize: 16 }}>🎧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionCardTitle}>{sessionTitle}</Text>
            <Text style={styles.sessionCardMeta}>{sessionMeta}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>Completed</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Extracted Action Items</Text>
          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>+ Add Action</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: 26 }]}> </Text>
            <Text style={[styles.tableHeaderCell, { flex: 2.2 }]}>Action</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Owner</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Due Date</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Assigned By</Text>
            <Text style={[styles.tableHeaderCell, { width: 60 }]}> </Text>
          </View>

          {items.map((item) => {
            const isEditing = editingId === item.id;
            const lowConfidence = item.confidence < 0.6;
            if (isEditing && draft) {
              return (
                <View key={item.id} style={[styles.tableRow, styles.tableRowEditing]}>
                  <View style={{ width: 26 }} />
                  <TextInput
                    style={[styles.editInput, { flex: 2.2 }]}
                    value={draft.action}
                    onChangeText={(t) => setDraft({ ...draft, action: t })}
                    placeholder="Action"
                  />
                  <TextInput
                    style={[styles.editInput, { flex: 1 }]}
                    value={draft.owner}
                    onChangeText={(t) => setDraft({ ...draft, owner: t })}
                    placeholder="Owner"
                  />
                  <TextInput
                    style={[styles.editInput, { flex: 1 }]}
                    value={draft.dueLabel}
                    onChangeText={(t) => setDraft({ ...draft, dueLabel: t })}
                    placeholder="Due date"
                  />
                  <TextInput
                    style={[styles.editInput, { flex: 1 }]}
                    value={draft.assignedBy}
                    onChangeText={(t) => setDraft({ ...draft, assignedBy: t })}
                    placeholder="Assigned by"
                  />
                  <View style={{ width: 60, flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={saveEdit}>
                      <Text style={styles.editActionIcon}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={cancelEdit}>
                      <Text style={[styles.editActionIcon, { color: '#9CA3AF' }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }
            return (
              <View key={item.id} style={styles.tableRow}>
                <TouchableOpacity style={{ width: 26 }} onPress={() => toggleDone(item.id)}>
                  <View style={[styles.checkbox, item.done && styles.checkboxChecked]}>
                    {item.done && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 2.2 }}>
                  <Text style={[styles.cellText, item.done && styles.cellTextDone]}>{item.action || '—'}</Text>
                  {lowConfidence && <Text style={styles.lowConfidenceFlag}>Low confidence — please verify</Text>}
                </View>
                <Text style={[styles.cellText, { flex: 1 }]}>{item.owner || '—'}</Text>
                <Text style={[styles.cellText, { flex: 1 }]}>{item.dueLabel || '—'}</Text>
                <Text style={[styles.cellText, { flex: 1 }]}>{item.assignedBy || '—'}</Text>
                <View style={{ width: 60, flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => startEdit(item)}>
                    <Text style={styles.rowIcon}>✎</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(item.id)}>
                    <Text style={[styles.rowIcon, { color: '#B91C1C' }]}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {items.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No action items yet. Add one to get started.</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transcript Preview</Text>
          <TouchableOpacity onPress={() => setTranscriptExpanded((v) => !v)}>
            <Text style={styles.linkText}>{transcriptExpanded ? 'Show less' : 'View full transcript →'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transcriptBox}>
          {(transcriptExpanded ? TRANSCRIPT : TRANSCRIPT.slice(0, 5)).map((line, i) => (
            <View key={i} style={styles.transcriptLine}>
              <Text style={styles.transcriptTime}>{line.time}</Text>
              <Text style={styles.transcriptSpeaker}>{line.speaker}</Text>
              <Text style={styles.transcriptText}>{line.text}</Text>
            </View>
          ))}
          {!transcriptExpanded && TRANSCRIPT.length > 5 && <Text style={styles.transcriptMore}>···</Text>}
        </View>

        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => onBack?.()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#374151" /> : <Text style={styles.secondaryButtonText}>Save</Text>}
            </TouchableOpacity>

            <View>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setExportMenuOpen((v) => !v)}
                disabled={exporting !== null}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>⭳ Export →</Text>
                )}
              </TouchableOpacity>
              {exportMenuOpen && (
                <View style={styles.exportMenu}>
                  <TouchableOpacity style={styles.exportMenuItem} onPress={() => handleExport('excel')}>
                    <Text style={styles.exportMenuItemText}>Export to Excel (.xlsx)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.exportMenuItem} onPress={() => handleExport('notion')}>
                    <Text style={styles.exportMenuItemText}>
                      {notionConnected ? 'Export to Notion' : 'Connect & export to Notion'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FA', minHeight: '100%' as any },
  topNav: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', width: 200 },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  brandMarkText: { color: '#fff', fontSize: 13 },
  brandName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  navLinks: { flex: 1, flexDirection: 'row', gap: 24, justifyContent: 'center' },
  navLink: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  navLinkActive: { color: '#4338CA', fontWeight: '700' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  scrollContent: { padding: 32, maxWidth: 900, width: '100%', alignSelf: 'center' },

  stepper: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  stepItem: { alignItems: 'center', width: 84 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  stepCircleDone: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  stepCircleCurrent: { borderColor: '#4F46E5' },
  stepCircleText: { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  stepCircleTextActive: { color: '#4F46E5' },
  stepLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  stepLabelCurrent: { color: '#1F2937' },
  stepConnector: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginBottom: 20 },

  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subheading: { fontSize: 13, color: '#6B7280', marginBottom: 16 },

  toast: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  toastText: { color: '#047857', fontSize: 13, fontWeight: '600' },

  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 24,
  },
  sessionCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  sessionCardMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  statusBadge: { backgroundColor: '#ECFDF5', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#047857' },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  addButton: { backgroundColor: '#4F46E5', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  linkText: { fontSize: 12, color: '#4F46E5', fontWeight: '600' },

  table: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 28,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHeaderCell: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F4',
  },
  tableRowEditing: { backgroundColor: '#F5F5FF' },
  editInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  editActionIcon: { fontSize: 15, color: '#059669', fontWeight: '700' },
  cellText: { fontSize: 13, color: '#111827' },
  cellTextDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  lowConfidenceFlag: { fontSize: 10, color: '#C2410C', marginTop: 2, fontWeight: '600' },
  rowIcon: { fontSize: 14, color: '#6B7280' },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  checkboxTick: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyState: { paddingVertical: 28, alignItems: 'center' },
  emptyStateText: { fontSize: 12, color: '#9CA3AF' },

  transcriptBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 28,
  },
  transcriptLine: { flexDirection: 'row', marginBottom: 10, gap: 10 },
  transcriptTime: { fontSize: 11, color: '#9CA3AF', width: 40 },
  transcriptSpeaker: { fontSize: 12, fontWeight: '700', color: '#4F46E5', width: 50 },
  transcriptText: { fontSize: 12, color: '#374151', flex: 1 },
  transcriptMore: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40, position: 'relative', zIndex: 5 },
  backButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  backButtonText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  primaryButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 96,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#374151', fontSize: 13, fontWeight: '600' },

  exportMenu: {
    position: 'absolute',
    bottom: 46,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: 220,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 20px rgba(0,0,0,0.1)' } : {}),
  } as any,
  exportMenuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  exportMenuItemText: { fontSize: 12, color: '#374151', fontWeight: '600' },
});

export default ReviewExportScreen;