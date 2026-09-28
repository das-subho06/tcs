const API_URL = 'http://localhost:4000';

let timerInterval = null;
let startTime = null;

const consentBanner = document.getElementById('consentBanner');
const consentBtn = document.getElementById('consentBtn');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const loggedInView = document.getElementById('loggedInView');
const loginFormView = document.getElementById('loginFormView');
const userEmailEl = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');

const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const tokenInput = document.getElementById('tokenInput');

let currentToken = '';

// 1. Initial State Check
chrome.storage.local.get(['hasConsented', 'authToken', 'userEmail', 'recordingStartTime'], async (res) => {
  if (!res.hasConsented) {
    consentBanner.style.display = 'block';
  }
  if (res.authToken) {
    currentToken = res.authToken;
    tokenInput.value = res.authToken;
    verifyToken(res.authToken, res.userEmail);
  }
  if (res.recordingStartTime) {
    startTimer(res.recordingStartTime);
    setRecordingUI(true);
  }
});

// Consent acceptance
consentBtn.addEventListener('click', () => {
  chrome.storage.local.set({ hasConsented: true }, () => {
    consentBanner.style.display = 'none';
  });
});

// Verify token with backend
async function verifyToken(token, cachedEmail) {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      currentToken = token;
      userEmailEl.innerText = data.user?.email || cachedEmail || 'Authenticated';
      loggedInView.style.display = 'block';
      loginFormView.style.display = 'none';
      chrome.storage.local.set({ authToken: token, userEmail: data.user?.email });
      return true;
    }
  } catch (e) {
    console.warn('Token verify error:', e);
  }
  loggedInView.style.display = 'none';
  loginFormView.style.display = 'block';
  return false;
}

// Direct Login inside extension
loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }

  loginBtn.innerText = 'Signing in...';
  loginBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    currentToken = data.token;
    tokenInput.value = data.token;
    chrome.storage.local.set({ authToken: data.token, userEmail: data.user.email });
    verifyToken(data.token, data.user.email);
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  } finally {
    loginBtn.innerText = 'Sign In to Extension';
    loginBtn.disabled = false;
  }
});

// Logout / Change Token in extension
logoutBtn.addEventListener('click', () => {
  currentToken = '';
  chrome.storage.local.remove(['authToken', 'userEmail']);
  tokenInput.value = '';
  loggedInView.style.display = 'none';
  loginFormView.style.display = 'block';
});

// Paste Token handler
tokenInput.addEventListener('change', () => {
  const val = tokenInput.value.trim();
  if (val) {
    currentToken = val;
    chrome.storage.local.set({ authToken: val });
    verifyToken(val);
  }
});

// Poll background status
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
  if (res && res.recording) {
    setRecordingUI(true);
  }
});

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function startTimer(savedStart) {
  startTime = savedStart || Date.now();
  chrome.storage.local.set({ recordingStartTime: startTime });
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
    timerEl.innerText = formatTime(elapsedSecs);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerEl.innerText = '00:00';
  chrome.storage.local.remove('recordingStartTime');
}

function setRecordingUI(isRecording) {
  if (isRecording) {
    statusContainer.classList.add('recording');
    statusText.innerText = 'Recording Meeting & Mic...';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
  } else {
    statusContainer.classList.remove('recording');
    statusText.innerText = 'Ready to Record';
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
  }
}

// Start Recording
startBtn.addEventListener('click', async () => {
  if (!currentToken) {
    alert('Please sign in or paste an auth token first.');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    alert('No active tab found to record.');
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: 'START',
      tabId: tab.id,
      token: currentToken,
    },
    (response) => {
      if (response && response.error) {
        alert(`Failed to start recording: ${response.error}`);
      } else {
        setRecordingUI(true);
        startTimer();
      }
    }
  );
});

// Stop Recording
stopBtn.addEventListener('click', () => {
  stopTimer();
  setRecordingUI(false);
  chrome.runtime.sendMessage({ type: 'STOP' }, () => {
    window.close();
  });
});
