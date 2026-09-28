import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SpeakerAssignmentScreen from '../components/SpeakerAssignmentScreen';
import ReviewExportScreen from '../components/ReviewExportScreen';

/**
 * Route: "/explore" — carries a session through the remaining steps:
 * naming speakers, then reviewing and exporting action items.
 * Kept as one route (rather than two) so the wizard's Back button can
 * step from Review to Speakers without a full route change; Back from
 * Speakers returns to the dashboard via router.back().
 */
export default function Explore() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [step, setStep] = useState<'speakers' | 'review'>('speakers');

  console.log('Session in progress:', sessionId);

  const handleNavigate = (route: 'dashboard' | 'sessions' | 'settings') => {
    if (route === 'dashboard') {
      router.replace('/');
    }
    // 'sessions' is where we already are; 'settings' has no route yet.
  };

  if (step === 'review') {
    return (
      <ReviewExportScreen
        onBack={() => setStep('speakers')}
        onExported={() => router.replace('/')}
        onNavigate={handleNavigate}
      />
    );
  }

  return (
    <SpeakerAssignmentScreen
      onBack={() => router.back()}
      onContinue={() => setStep('review')}
      onNavigate={handleNavigate}
    />
  );
}