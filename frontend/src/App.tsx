import React, { useState, useEffect } from 'react';
import { api, getToken } from './api';
import { User } from './types';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { WaitingScreen } from './screens/WaitingScreen';
import { ReviewScreen } from './screens/ReviewScreen';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Simple URL parser for browser navigation & extension handoff
  const [path, setPath] = useState(window.location.pathname);
  const [searchParams, setSearchParams] = useState(new URLSearchParams(window.location.search));

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      setSearchParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (newPath: string) => {
    window.history.pushState({}, '', newPath);
    setPath(newPath);
    setSearchParams(new URLSearchParams(window.location.search));
  };

  // Check auth & handoff code exchange
  useEffect(() => {
    const initAuth = async () => {
      const handoffCode = searchParams.get('handoff');

      if (handoffCode) {
        try {
          // Exchange single-use 60s handoff code
          const exchanged = await api.exchangeHandoff(handoffCode);
          setCurrentUser(exchanged.user);

          // Strip handoff param from URL using history.replaceState (Section 5)
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
          setSearchParams(new URLSearchParams());
          setLoading(false);
          return;
        } catch (err: any) {
          console.warn('Handoff code exchange failed or expired:', err.message);
          // Fall through to regular auth check
        }
      }

      if (getToken()) {
        try {
          const res = await api.getMe();
          setCurrentUser(res.user);
        } catch (e) {
          api.logout();
          setCurrentUser(null);
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        Loading application...
      </div>
    );
  }

  // Not authenticated
  if (!currentUser) {
    return <LoginScreen onSuccess={(user) => setCurrentUser(user)} />;
  }

  // Route: /sessions/:id/speakers
  const speakersMatch = path.match(/^\/sessions\/([a-zA-Z0-9_-]+)\/speakers/);
  if (speakersMatch) {
    const sessionId = speakersMatch[1];
    return (
      <WaitingScreen
        sessionId={sessionId}
        onNavigateToReview={(id) => navigate(`/sessions/${id}/review`)}
        onBackToDashboard={() => navigate('/')}
      />
    );
  }

  // Route: /sessions/:id/review
  const reviewMatch = path.match(/^\/sessions\/([a-zA-Z0-9_-]+)\/review/);
  if (reviewMatch) {
    const sessionId = reviewMatch[1];
    return (
      <ReviewScreen
        sessionId={sessionId}
        onBackToDashboard={() => navigate('/')}
      />
    );
  }

  // Default Route: Dashboard
  return (
    <DashboardScreen
      user={currentUser}
      onOpenSession={(id, mode) => navigate(`/sessions/${id}/${mode}`)}
      onLogout={async () => {
        await api.logout();
        setCurrentUser(null);
      }}
    />
  );
};
