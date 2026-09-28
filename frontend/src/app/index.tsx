import React from 'react';
import { useRouter } from 'expo-router';
import DashboardScreen from '../components/DashboardScreen';

/**
 * Route: "/" — the app's start screen.
 * Uploading a file (or tapping an existing session) hands off to the
 * "/explore" route, which carries the speaker-naming and review steps.
 */
export default function Index() {
  const router = useRouter();

  return (
    <DashboardScreen
      onSessionCreated={(sessionId) => {
        router.push({ pathname: '/explore', params: { sessionId } });
      }}
      onOpenSession={(sessionId) => {
        router.push({ pathname: '/explore', params: { sessionId } });
      }}
      onNavigate={(route) => {
        if (route === 'sessions') {
          router.push('/explore');
        }
        // 'dashboard' and 'settings' have no separate route yet —
        // add more Stack.Screen entries in _layout.tsx when you build them.
      }}
    />
  );
}