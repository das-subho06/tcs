let timerInterval = null;
let startTime = null;

const consentBanner = document.getElementById('consentBanner');
const consentBtn = document.getElementById('consentBtn');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const tokenInput = document.getElementById('tokenInput');

// 1. Check one-time consent
chrome.storage.local.get(['hasConsented', 'authToken', 'recordingStartTime'], (res) => {
  if (!res.hasConsented) {
    consentBanner.style.display = 'block';
  }
  if (res.authToken) {
    tokenInput.value = res.authToken;
  }
  if (res.recordingStartTime) {
    startTimer(res.recordingStartTime);
    setRecordingUI(true);
  }
});

consentBtn.addEventListener('click', () => {
  chrome.storage.local.set({ hasConsented: true }, () => {
    consentBanner.style.display = 'none';
  });
});

tokenInput.addEventListener('change', () => {
  chrome.storage.local.set({ authToken: tokenInput.value.trim() });
});

// 2. Poll initial background status
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

// 3. Start Button Click
startBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    alert('Please enter a valid Auth Token first (or log in via the app tab).');
    return;
  }

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    alert('No active tab found to record.');
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: 'START',
      tabId: tab.id,
      token,
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

// 4. Stop Button Click
stopBtn.addEventListener('click', () => {
  stopTimer();
  setRecordingUI(false);
  chrome.runtime.sendMessage({ type: 'STOP' }, (response) => {
    window.close(); // Close extension popup; handoff opens in new tab
  });
});
