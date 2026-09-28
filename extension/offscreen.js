// Offscreen document script handling dual-track audio recording and upload pipeline
let tabRecorder = null;
let micRecorder = null;
let audioContext = null;
let currentSessionId = null;
let currentToken = null;
let currentApiUrl = 'http://localhost:4000';

let tabSeq = 0;
let micSeq = 0;
let pendingUploads = new Set();
let isStopping = false;

// IndexedDB Queue Setup for Resilient Chunk Retries
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('audio_chunks_queue', 1);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueChunkInDB(track, seq, blob) {
  try {
    const db = await openDB();
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    await new Promise((res, rej) => {
      const req = store.add({
        sessionId: currentSessionId,
        track,
        seq,
        blob,
        timestamp: Date.now(),
      });
      req.onsuccess = res;
      req.onerror = rej;
    });
  } catch (err) {
    console.error('IndexedDB queue error:', err);
  }
}

async function uploadChunk(track, seq, blob) {
  const uploadKey = `${track}-${seq}`;
  pendingUploads.add(uploadKey);

  const url = `${currentApiUrl}/api/sessions/${currentSessionId}/audio/${track}?seq=${seq}`;

  const send = async () => {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/webm',
        Authorization: `Bearer ${currentToken}`,
      },
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  };

  try {
    await send();
    pendingUploads.delete(uploadKey);
    checkIfAllDone();
  } catch (err) {
    console.warn(`Chunk ${uploadKey} upload failed, queuing for retry:`, err);
    await queueChunkInDB(track, seq, blob);
    // Retry with backoff
    setTimeout(async () => {
      try {
        await send();
        pendingUploads.delete(uploadKey);
        checkIfAllDone();
      } catch (retryErr) {
        console.error(`Chunk ${uploadKey} retry failed:`, retryErr);
      }
    }, 2000);
  }
}

function checkIfAllDone() {
  if (isStopping && pendingUploads.size === 0) {
    chrome.runtime.sendMessage({
      type: 'ALL_CHUNKS_UPLOADED',
      sessionId: currentSessionId,
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECORDING') {
    startRecording(message.streamId, message.sessionId, message.token, message.apiUrl)
      .then(() => sendResponse({ status: 'started' }))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep channel open
  } else if (message.type === 'STOP_RECORDING') {
    stopRecording()
      .then(() => sendResponse({ status: 'stopping' }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function startRecording(streamId, sessionId, token, apiUrl) {
  currentSessionId = sessionId;
  currentToken = token;
  currentApiUrl = apiUrl || 'http://localhost:4000';
  tabSeq = 0;
  micSeq = 0;
  pendingUploads.clear();
  isStopping = false;

  // 1. Capture Tab Audio
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  });

  // Route tab audio back to user speakers
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(tabStream);
  source.connect(audioContext.destination);

  // 2. Capture Microphone Audio
  let micStream = null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (micErr) {
    console.warn('Microphone permission not granted or unavailable:', micErr);
  }

  // 3. Tab MediaRecorder
  tabRecorder = new MediaRecorder(tabStream, { mimeType: 'audio/webm;codecs=opus' });
  tabRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      const seq = tabSeq++;
      uploadChunk('tab', seq, event.data);
    }
  };
  tabRecorder.start(10000); // 10s timeslice

  // 4. Mic MediaRecorder
  if (micStream) {
    micRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' });
    micRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const seq = micSeq++;
        uploadChunk('mic', seq, event.data);
      }
    };
    micRecorder.start(10000);
  }

  console.log('Dual-track recording successfully initiated.');
}

async function stopRecording() {
  isStopping = true;

  if (tabRecorder && tabRecorder.state !== 'inactive') {
    tabRecorder.stop();
  }
  if (micRecorder && micRecorder.state !== 'inactive') {
    micRecorder.stop();
  }

  if (audioContext) {
    audioContext.close();
  }

  // Immediate check if all uploaded
  checkIfAllDone();
}
