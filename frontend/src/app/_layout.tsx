import React from 'react';
import { Stack } from 'expo-router';

/**
 * Root layout for the app directory (Expo Router).
 * Headers are hidden because DashboardScreen, SpeakerAssignmentScreen and
 * ReviewExportScreen each render their own top bar / nav already.
 */
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="explore" />
    </Stack>
  );
}
