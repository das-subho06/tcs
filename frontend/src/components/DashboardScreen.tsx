import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';

/**
 * DashboardScreen
 * Start screen of the app: upload an audio file or a transcript file,
 * see past sessions and their status, and read a quick "how it works" guide.
 *
 * This file is self-contained (no external navigation library assumed).
 * Wire `onOpenSession` / `onSessionCreated` to your router if you have one.
 */

type SessionStatus =
  | 'UPLOADING'
  | 'DIARIZING'
  | 'AWAITING_SPEAKER_NAMES'
  | 'TRANSCRIBING'
  | 'STRUCTURING'
  | 'REVIEW'
  | 'EXPORTED'
  | 'FAILED';

interface SessionSummary {
  id: string;
  title: string;
  date: string;
  duration: string;
  status: SessionStatus;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  UPLOADING: 'Uploading',
  DIARIZING: 'Separating voices',
  AWAITING_SPEAKER_NAMES: 'Needs speaker names',
  TRANSCRIBING: 'Transcribing',
  STRUCTURING: 'Extracting action items',
  REVIEW: 'In review',
  EXPORTED: 'Completed',
  FAILED: 'Failed',
};

const STATUS_COLOR: Record<SessionStatus, { bg: string; fg: string }> = {
  UPLOADING: { bg: '#EEF2FF', fg: '#4F46E5' },
  DIARIZING: { bg: '#EEF2FF', fg: '#4F46E5' },
  AWAITING_SPEAKER_NAMES: { bg: '#FFF7ED', fg: '#C2410C' },
  TRANSCRIBING: { bg: '#EEF2FF', fg: '#4F46E5' },
  STRUCTURING: { bg: '#EEF2FF', fg: '#4F46E5' },
  REVIEW: { bg: '#FEF9C3', fg: '#854D0E' },
  EXPORTED: { bg: '#ECFDF5', fg: '#047857' },
  FAILED: { bg: '#FEF2F2', fg: '#B91C1C' },
};

const MOCK_SESSIONS: SessionSummary[] = [
  { id: 's1', title: 'Product Sync Meeting', date: 'Sep 24, 2025 · 10:32 AM', duration: '32 min', status: 'EXPORTED' },
  { id: 's2', title: 'Client Onboarding Call', date: 'Sep 22, 2025 · 3:10 PM', duration: '18 min', status: 'AWAITING_SPEAKER_NAMES' },
  { id: 's3', title: 'Design Review', date: 'Sep 19, 2025 · 11:00 AM', duration: '41 min', status: 'REVIEW' },
];

// Minimal cross-platform file picker: renders a hidden native <input type="file">
// on web (react-native-web) and exposes an `openPicker` function to trigger it.
const FileInput: React.FC<{
  accept: string;
  onSelect: (file: { name: string }) => void;
  children: (openPicker: () => void) => React.ReactNode;
}> = ({ accept, onSelect, children }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (Platform.OS === 'web' && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleChange = (e: any) => {
    const file = e?.target?.files?.[0];
    if (file) onSelect(file);
    if (e?.target) e.target.value = '';
  };

  return (
    <>
      {children(openPicker)}
      {Platform.OS === 'web' &&
        // @ts-ignore -- raw DOM element, valid under react-native-web
        React.createElement('input', {
          ref: inputRef,
          type: 'file',
          accept,
          style: { display: 'none' },
          onChange: handleChange,
        })}
    </>
  );
};

interface DashboardScreenProps {
  userName?: string;
  onSessionCreated?: (sessionId: string, kind: 'audio' | 'transcript') => void;
  onOpenSession?: (sessionId: string) => void;
  onNavigate?: (route: 'dashboard' | 'sessions' | 'settings') => void;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({
  userName = 'User',
  onSessionCreated,
  onOpenSession,
  onNavigate,
}) => {
  const [booting, setBooting] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>(MOCK_SESSIONS);
  const [uploadingKind, setUploadingKind] = useState<'audio' | 'transcript' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'sessions' | 'settings'>('dashboard');

  const fade = useRef(new Animated.Value(0)).current;

  // Splash screen: simulate fetching the user's session list on mount.
  useEffect(() => {
    const t = setTimeout(() => {
      setBooting(false);
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: Platform.OS !== 'web' }).start();
    }, 700);
    return () => clearTimeout(t);
  }, [fade]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const handleNav = (route: 'dashboard' | 'sessions' | 'settings') => {
    setActiveNav(route);
    onNavigate?.(route);
  };

  const handleFileSelected = (kind: 'audio' | 'transcript', file: { name: string }) => {
    setUploadingKind(kind);
    // Simulate upload + session creation.
    setTimeout(() => {
      const id = `s${Date.now()}`;
      const newSession: SessionSummary = {
        id,
        title: file.name.replace(/\.[^/.]+$/, '') || 'Untitled Meeting',
        date: 'Just now',
        duration: '—',
        status: kind === 'audio' ? 'TRANSCRIBING' : 'STRUCTURING',
      };
      setSessions((prev) => [newSession, ...prev]);
      setUploadingKind(null);
      setToast(
        kind === 'audio'
          ? 'Audio uploaded — processing started'
          : 'Transcript uploaded — extracting action items'
      );
      onSessionCreated?.(id, kind);
    }, 1400);
  };

  if (booting) {
    return (
      <View style={styles.splash}>
        <View style={styles.splashLogo}>
          <Text style={styles.splashLogoGlyph}>◎</Text>
        </View>
        <Text style={styles.splashTitle}>Meet2Action</Text>
        <ActivityIndicator style={{ marginTop: 18 }} color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>◎</Text>
          </View>
          <Text style={styles.brandName}>Meet2Action</Text>
        </View>

        <NavItem label="Dashboard" active={activeNav === 'dashboard'} onPress={() => handleNav('dashboard')} />
        <NavItem label="Sessions" active={activeNav === 'sessions'} onPress={() => handleNav('sessions')} />
        <NavItem label="Settings" active={activeNav === 'settings'} onPress={() => handleNav('settings')} />
      </View>

      {/* Main column */}
      <View style={styles.main}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View />
          <TouchableOpacity style={styles.userMenuTrigger} onPress={() => setMenuOpen((v) => !v)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{userName.charAt(0)}</Text>
            </View>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.chevron}>{menuOpen ? '▴' : '▾'}</Text>
          </TouchableOpacity>
        </View>
        {menuOpen && (
          <View style={styles.userMenu}>
            <TouchableOpacity style={styles.userMenuItem} onPress={() => setMenuOpen(false)}>
              <Text style={styles.userMenuItemText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.userMenuItem} onPress={() => setMenuOpen(false)}>
              <Text style={styles.userMenuItemText}>Log out</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Animated.View style={{ opacity: fade }}>
            <Text style={styles.welcome}>Welcome, {userName}! 👋</Text>
            <Text style={styles.subtitle}>Turn your meetings into clear action items.</Text>

            {toast && (
              <View style={styles.toast}>
                <Text style={styles.toastText}>{toast}</Text>
              </View>
            )}

            {/* Upload cards */}
            <View style={styles.cardRow}>
              <View style={styles.uploadCard}>
                <View style={styles.uploadIconCircle}>
                  <Text style={styles.uploadIconGlyph}>🎙</Text>
                </View>
                <Text style={styles.uploadTitle}>Upload Audio File</Text>
                <Text style={styles.uploadHint}>Upload a meeting recording{'\n'}(e.g. MP3, M4A, WAV)</Text>
                <FileInput accept="audio/*" onSelect={(f) => handleFileSelected('audio', f)}>
                  {(openPicker) => (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={openPicker}
                      disabled={uploadingKind !== null}
                    >
                      {uploadingKind === 'audio' ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Choose File</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </FileInput>
              </View>

              <View style={styles.uploadCard}>
                <View style={[styles.uploadIconCircle, { backgroundColor: '#EEF2FF' }]}>
                  <Text style={styles.uploadIconGlyph}>📄</Text>
                </View>
                <Text style={styles.uploadTitle}>Upload Transcript</Text>
                <Text style={styles.uploadHint}>Continue from an existing{'\n'}transcript file (TXT, DOCX, etc.)</Text>
                <FileInput accept=".txt,.srt,.vtt,.docx" onSelect={(f) => handleFileSelected('transcript', f)}>
                  {(openPicker) => (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={openPicker}
                      disabled={uploadingKind !== null}
                    >
                      {uploadingKind === 'transcript' ? (
                        <ActivityIndicator color="#4F46E5" size="small" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>Choose File</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </FileInput>
              </View>
            </View>

            {/* How it works */}
            <View style={styles.infoBox}>
              <View style={styles.infoBoxHeader}>
                <Text style={styles.infoBoxIcon}>💡</Text>
                <Text style={styles.infoBoxTitle}>How it works</Text>
              </View>
              {[
                'Upload or record your meeting.',
                'Assign speaker names.',
                'Review and edit action items.',
                'Export to Excel or Notion.',
              ].map((step, i) => (
                <View key={step} style={styles.infoStepRow}>
                  <Text style={styles.infoStepIndex}>{i + 1}.</Text>
                  <Text style={styles.infoStepText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Sessions list */}
            {/* <View style={styles.sessionsHeader}>
              <Text style={styles.sessionsTitle}>Recent sessions</Text>
              <TouchableOpacity onPress={() => handleNav('sessions')}>
                <Text style={styles.sessionsSeeAll}>See all →</Text>
              </TouchableOpacity>
            </View> */}

            {/* <View style={styles.sessionsList}>
              {sessions.map((s) => {
                const c = STATUS_COLOR[s.status];
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.sessionRow}
                    onPress={() => onOpenSession?.(s.id)}
                  >
                    <View style={styles.sessionRowIcon}>
                      <Text style={{ fontSize: 16 }}>🎧</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionRowTitle}>{s.title}</Text>
                      <Text style={styles.sessionRowMeta}>
                        {s.date} · {s.duration}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: c.fg }]}>{STATUS_LABEL[s.status]}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View> */}
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
};

const NavItem: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.navItem, active && styles.navItemActive]} onPress={onPress}>
    <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#F7F8FA', minHeight: '100%' as any },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
    minHeight: '100vh' as any,
  },
  splashLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  splashLogoGlyph: { color: '#fff', fontSize: 26 },
  splashTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },

  sidebar: {
    width: 220,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 6 },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandMarkText: { color: '#fff', fontSize: 15 },
  brandName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },

  navItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 2 },
  navItemActive: { backgroundColor: '#EEF2FF' },
  navItemText: { fontSize: 14, color: '#4B5563', fontWeight: '500' },
  navItemTextActive: { color: '#4338CA', fontWeight: '700' },

  main: { flex: 1 },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  userMenuTrigger: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  userName: { fontSize: 13, color: '#374151', fontWeight: '600', marginRight: 4 },
  chevron: { fontSize: 10, color: '#9CA3AF' },
  userMenu: {
    position: 'absolute',
    top: 56,
    right: 28,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 4,
    width: 140,
    zIndex: 20,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 20px rgba(0,0,0,0.08)' } : {}),
  } as any,
  userMenuItem: { paddingVertical: 8, paddingHorizontal: 12 },
  userMenuItemText: { fontSize: 13, color: '#374151' },

  scrollContent: { padding: 32, maxWidth: 920 },

  welcome: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },

  toast: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  toastText: { color: '#047857', fontSize: 13, fontWeight: '600' },

  cardRow: { flexDirection: 'row', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  uploadCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 22,
    alignItems: 'flex-start',
  },
  uploadIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  uploadIconGlyph: { fontSize: 20 },
  uploadTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  uploadHint: { fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 18 },
  primaryButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 108,
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
    minWidth: 108,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#374151', fontSize: 13, fontWeight: '600' },

  infoBox: {
    backgroundColor: '#F5F6FF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 28,
  },
  infoBoxHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoBoxIcon: { fontSize: 15, marginRight: 8 },
  infoBoxTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  infoStepRow: { flexDirection: 'row', marginBottom: 6 },
  infoStepIndex: { fontSize: 13, color: '#4F46E5', fontWeight: '700', width: 20 },
  infoStepText: { fontSize: 13, color: '#374151', flex: 1 },

  sessionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sessionsTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sessionsSeeAll: { fontSize: 12, color: '#4F46E5', fontWeight: '600' },

  sessionsList: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F4',
  },
  sessionRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionRowTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  sessionRowMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
});

export default DashboardScreen;
