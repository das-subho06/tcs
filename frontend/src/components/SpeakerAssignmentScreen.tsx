import React, { useEffect, useRef, useState } from 'react';
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

/**
 * SpeakerAssignmentScreen
 * Corresponds to sessions.status DIARIZING -> AWAITING_SPEAKER_NAMES.
 * Shows a waiting state while "diarization" runs, then lets the user
 * play each detected speaker's clip, name them, merge over-segmented
 * speakers, or skip one.
 */

type TrackTag = 'Tab (remote)' | 'Mic (local)';

interface Speaker {
  id: string;
  label: string;
  track: TrackTag;
  color: string;
  name: string;
  clipLength: string; // e.g. "0:08"
  skipped: boolean;
}

const INITIAL_SPEAKERS: Speaker[] = [
  { id: 'sp1', label: 'Speaker 1', track: 'Tab (remote)', color: '#4F46E5', name: '', clipLength: '0:08', skipped: false },
  { id: 'sp2', label: 'Speaker 2', track: 'Tab (remote)', color: '#0EA5E9', name: '', clipLength: '0:07', skipped: false },
  { id: 'sp3', label: 'Speaker 3', track: 'Mic (local)', color: '#10B981', name: 'You', clipLength: '0:06', skipped: false },
  { id: 'sp4', label: 'Speaker 4', track: 'Tab (remote)', color: '#A855F7', name: '', clipLength: '0:06', skipped: false },
];

const STEPS = ['Upload', 'Speakers', 'Transcript', 'Review', 'Export'];

interface SpeakerAssignmentScreenProps {
  sessionTitle?: string;
  sessionMeta?: string;
  onBack?: () => void;
  onContinue?: (speakers: { id: string; name: string }[]) => void;
  onNavigate?: (route: 'dashboard' | 'sessions' | 'settings') => void;
}

const SpeakerAssignmentScreen: React.FC<SpeakerAssignmentScreenProps> = ({
  sessionTitle = 'Product Sync Meeting',
  sessionMeta = 'Sep 24, 2025 · 10:32 AM · 32 min',
  onBack,
  onContinue,
  onNavigate,
}) => {
  const [ready, setReady] = useState(false); // false = still "Separating voices..."
  const [speakers, setSpeakers] = useState<Speaker[]>(INITIAL_SPEAKERS);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simulate diarization finishing.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (playTimer.current) clearTimeout(playTimer.current);
    };
  }, []);

  const visibleSpeakers = speakers.filter((s) => !s.skipped);

  const updateName = (id: string, name: string) => {
    setSpeakers((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    if (name.trim()) setErrors((prev) => ({ ...prev, [id]: false }));
  };

  const togglePlay = (id: string) => {
    if (playTimer.current) clearTimeout(playTimer.current);
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    // Auto-stop after ~2.5s to simulate a short clip finishing.
    playTimer.current = setTimeout(() => setPlayingId(null), 2500);
  };

  const skipSpeaker = (id: string) => {
    setSpeakers((prev) => prev.map((s) => (s.id === id ? { ...s, skipped: true } : s)));
    setOpenMenuId(null);
  };

  const toggleMergeSelection = (id: string) => {
    setMergeSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirmMerge = () => {
    if (mergeSelection.length < 2) {
      setMergeMode(false);
      setMergeSelection([]);
      return;
    }
    const [keepId, ...dropIds] = mergeSelection;
    setSpeakers((prev) => prev.filter((s) => !dropIds.includes(s.id)));
    setMergeMode(false);
    setMergeSelection([]);
    // The kept speaker retains its own name; user can still edit it.
    void keepId;
  };

  const handleContinue = () => {
    const missing: Record<string, boolean> = {};
    visibleSpeakers.forEach((s) => {
      if (!s.name.trim()) missing[s.id] = true;
    });
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }
    onContinue?.(visibleSpeakers.map((s) => ({ id: s.id, name: s.name.trim() })));
  };

  return (
    <View style={styles.root}>
      {/* Top nav */}
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
          <Text style={styles.avatarText}>U</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Stepper */}
        <View style={styles.stepper}>
          {STEPS.map((label, i) => {
            const stepIndex = i + 1;
            const isDone = stepIndex < 2;
            const isCurrent = stepIndex === 2;
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

        <Text style={styles.heading}>Assign Speakers</Text>
        <Text style={styles.subheading}>Listen to the clips and name each speaker. You can merge speakers if needed.</Text>

        {/* Session card */}
        <View style={styles.sessionCard}>
          <View style={styles.sessionCardIcon}>
            <Text style={{ fontSize: 16 }}>🎧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionCardTitle}>{sessionTitle}</Text>
            <Text style={styles.sessionCardMeta}>{sessionMeta}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: ready ? '#ECFDF5' : '#EEF2FF' }]}>
            <Text style={[styles.statusBadgeText, { color: ready ? '#047857' : '#4338CA' }]}>
              {ready ? 'Ready' : 'Processing'}
            </Text>
          </View>
        </View>

        {!ready ? (
          <View style={styles.waitingBox}>
            <ActivityIndicator color="#4F46E5" />
            <Text style={styles.waitingText}>Separating voices…</Text>
            <Text style={styles.waitingHint}>You can leave this page and come back — we'll keep working.</Text>
          </View>
        ) : (
          <>
            <View style={styles.detectedHeader}>
              <Text style={styles.detectedTitle}>
                Detected Speakers <Text style={styles.detectedCount}>({visibleSpeakers.length} speakers found)</Text>
              </Text>
              {!mergeMode ? (
                <TouchableOpacity style={styles.mergeButton} onPress={() => setMergeMode(true)}>
                  <Text style={styles.mergeButtonText}>⇄ Merge Speakers</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setMergeMode(false);
                      setMergeSelection([]);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, mergeSelection.length < 2 && styles.buttonDisabled]}
                    onPress={confirmMerge}
                    disabled={mergeSelection.length < 2}
                  >
                    <Text style={styles.primaryButtonText}>Merge Selected</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {visibleSpeakers.map((s) => {
              const isPlaying = playingId === s.id;
              const isSelectedForMerge = mergeSelection.includes(s.id);
              const hasError = !!errors[s.id];
              return (
                <View
                  key={s.id}
                  style={[
                    styles.speakerCard,
                    mergeMode && isSelectedForMerge && styles.speakerCardSelected,
                  ]}
                >
                  <View style={styles.speakerCardTop}>
                    <View style={styles.speakerLabelRow}>
                      {mergeMode && (
                        <TouchableOpacity
                          style={[styles.checkbox, isSelectedForMerge && styles.checkboxChecked]}
                          onPress={() => toggleMergeSelection(s.id)}
                        >
                          {isSelectedForMerge && <Text style={styles.checkboxTick}>✓</Text>}
                        </TouchableOpacity>
                      )}
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text style={styles.speakerLabel}>{s.label}</Text>
                    </View>
                    <View
                      style={[
                        styles.trackTag,
                        { backgroundColor: s.track === 'Mic (local)' ? '#ECFDF5' : '#EEF2FF' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.trackTagText,
                          { color: s.track === 'Mic (local)' ? '#047857' : '#4338CA' },
                        ]}
                      >
                        {s.track}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.speakerCardBody}>
                    <TouchableOpacity style={styles.playButton} onPress={() => togglePlay(s.id)}>
                      <Text style={styles.playButtonGlyph}>{isPlaying ? '❚❚' : '▶'}</Text>
                    </TouchableOpacity>
                    <View style={styles.waveform}>
                      {Array.from({ length: 24 }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.waveformBar,
                            {
                              height: 6 + ((i * 7) % 16),
                              backgroundColor: isPlaying && i < 10 ? s.color : '#D1D5DB',
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.clipTime}>{isPlaying ? '0:0' + Math.min(9, 1) : '0:00'} / {s.clipLength}</Text>
                  </View>

                  <View style={styles.nameRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nameLabel}>Name</Text>
                      <TextInput
                        value={s.name}
                        onChangeText={(t) => updateName(s.id, t)}
                        placeholder="Enter a name"
                        placeholderTextColor="#9CA3AF"
                        style={[styles.nameInput, hasError && styles.nameInputError]}
                      />
                      {hasError && <Text style={styles.errorText}>Please name this speaker to continue.</Text>}
                    </View>
                    <TouchableOpacity
                      style={styles.kebabButton}
                      onPress={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                    >
                      <Text style={styles.kebabText}>⋮</Text>
                    </TouchableOpacity>
                  </View>

                  {openMenuId === s.id && (
                    <View style={styles.speakerMenu}>
                      <TouchableOpacity
                        style={styles.speakerMenuItem}
                        onPress={() => {
                          setMergeMode(true);
                          setMergeSelection([s.id]);
                          setOpenMenuId(null);
                        }}
                      >
                        <Text style={styles.speakerMenuItemText}>Merge with another speaker…</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.speakerMenuItem} onPress={() => skipSpeaker(s.id)}>
                        <Text style={[styles.speakerMenuItemText, { color: '#B91C1C' }]}>Skip this speaker</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.backButton} onPress={() => onBack?.()}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
                <Text style={styles.primaryButtonText}>Continue →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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

  scrollContent: { padding: 32, maxWidth: 760, width: '100%', alignSelf: 'center' },

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
  subheading: { fontSize: 13, color: '#6B7280', marginBottom: 20 },

  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 20,
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
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  waitingBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 40,
    alignItems: 'center',
  },
  waitingText: { marginTop: 14, fontSize: 14, fontWeight: '600', color: '#374151' },
  waitingHint: { marginTop: 6, fontSize: 12, color: '#9CA3AF' },

  detectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detectedTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  detectedCount: { fontWeight: '400', color: '#9CA3AF' },
  mergeButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  mergeButtonText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  speakerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 14,
  },
  speakerCardSelected: { borderColor: '#4F46E5', backgroundColor: '#F5F5FF' },
  speakerCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  speakerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  speakerLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  trackTag: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999 },
  trackTagText: { fontSize: 10, fontWeight: '700' },

  speakerCardBody: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  playButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonGlyph: { fontSize: 11, color: '#374151' },
  waveform: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 22 },
  waveformBar: { width: 3, borderRadius: 2 },
  clipTime: { fontSize: 11, color: '#9CA3AF', width: 76, textAlign: 'right' },

  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nameLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: '600' },
  nameInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#fff',
  },
  nameInputError: { borderColor: '#EF4444' },
  errorText: { fontSize: 11, color: '#B91C1C', marginTop: 4 },
  kebabButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  kebabText: { fontSize: 16, color: '#9CA3AF' },

  speakerMenu: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F2F4',
    paddingTop: 8,
  },
  speakerMenuItem: { paddingVertical: 8 },
  speakerMenuItemText: { fontSize: 12, color: '#374151', fontWeight: '600' },

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

  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 40 },
  backButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  backButtonText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  primaryButton: { backgroundColor: '#4F46E5', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  secondaryButtonText: { color: '#374151', fontSize: 13, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});

export default SpeakerAssignmentScreen;
