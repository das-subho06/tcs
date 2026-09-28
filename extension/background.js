// Chrome Extension Background Service Worker
const APP_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:4000';

let activeSession = null;
// activeSession: { sessionId, meetingTabId, appTabId, token, handoffUrl }

// Manage offscreen document
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capturing and recording tab and microphone audio streams',
  });
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

// Start Recording
async function handleStartRecording(meetingTabId, token) {
  await ensureOffscreenDocument();

  // Create session in API
  const sessionRes = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: 'Meeting Recording',
      source: 'extension',
    }),
  });

  if (!sessionRes.ok) {
    throw new Error('Failed to create recording session');
  }

  const session = await sessionRes.json();
  const sessionId = session.id;

  // Obtain stream ID for the meeting tab
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: meetingTabId,
  });

  // Message offscreen document to begin recording
  await chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    streamId,
    sessionId,
    token,
    apiUrl: API_URL,
  });

  activeSession = {
    sessionId,
    meetingTabId,
    appTabId: null,
    token,
    handoffUrl: null,
  };

  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });

  return { sessionId };
}

// Stop Recording
async function handleStopRecording(reason = 'user_click') {
  if (!activeSession) return;

  const { sessionId, token, appTabId } = activeSession;

  // 1. Tell offscreen recorder to stop
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  } catch (e) {
    console.warn('Offscreen stop message error:', e);
  }

  // 2. Call POST /sessions/:id/finalize
  try {
    await fetch(`${API_URL}/api/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (e) {
    console.error('Finalize call failed:', e);
  }

  // 3. Obtain single-use 60s handoff code
  let handoffCode = null;
  try {
    const handoffRes = await fetch(`${API_URL}/api/auth/handoff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId }),
    });
    if (handoffRes.ok) {
      const data = await handoffRes.json();
      handoffCode = data.code;
    }
  } catch (e) {
    console.error('Handoff generation failed:', e);
  }

  const destinationUrl = `${APP_URL}/sessions/${sessionId}/speakers?handoff=${handoffCode || ''}`;
  activeSession.handoffUrl = destinationUrl;

  if (reason === 'tab_closed') {
    // If tab closed, set badge to "!"
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  } else {
    // Open or focus app tab
    chrome.action.setBadgeText({ text: '' });
    await openOrFocusAppTab(destinationUrl);
  }
}

async function openOrFocusAppTab(url) {
  if (activeSession && activeSession.appTabId) {
    try {
      const tab = await chrome.tabs.get(activeSession.appTabId);
      if (tab) {
        await chrome.tabs.update(activeSession.appTabId, { active: true, url });
        return;
      }
    } catch (e) {
      // Tab might have been closed
    }
  }

  const newTab = await chrome.tabs.create({ url });
  if (activeSession) {
    activeSession.appTabId = newTab.id;
  }
}

// Listen for tab close (meeting tab closed during recording)
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
  if (activeSession && activeSession.meetingTabId === closedTabId) {
    console.log('Meeting tab closed by user, auto-stopping recording...');
    await handleStopRecording('tab_closed');
  }
});

// Listen for clicking icon when badge is "!"
chrome.action.onClicked.addListener(async () => {
  if (activeSession && activeSession.handoffUrl) {
    chrome.action.setBadgeText({ text: '' });
    await openOrFocusAppTab(activeSession.handoffUrl);
  }
});

// Messages from popup or offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START') {
    handleStartRecording(message.tabId, message.token)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  } else if (message.type === 'STOP') {
    handleStopRecording('user_click')
      .then(() => sendResponse({ status: 'stopped' }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  } else if (message.type === 'GET_STATUS') {
    sendResponse({
      recording: !!activeSession,
      sessionId: activeSession ? activeSession.sessionId : null,
    });
    return true;
  } else if (message.type === 'ALL_CHUNKS_UPLOADED') {
    console.log('All remaining chunks successfully acknowledged. Closing offscreen document.');
    closeOffscreenDocument();
    activeSession = null;
    return true;
  }
});
