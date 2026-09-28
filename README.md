# Meeting-to-Action-Items Application

An end-to-end production-grade system that transforms live meeting audio and tab recordings into structured, owner-assigned, due-dated action items using **pyannote.audio**, **Speech-to-Text**, and **Google Gemini LLM**, with export to **Excel (.xlsx)** and **Notion**.

---

## 1. System Architecture

- **Extension (Chrome Manifest V3)**: Captures remote meeting audio via `chrome.tabCapture` and local user mic via `getUserMedia` (with echo cancellation and noise suppression). Routes audio through user speakers so audio is uninterrupted. Slices audio into 10-second chunks using `MediaRecorder` (opus/webm) in an offscreen document and streams to `PUT /sessions/:id/audio/:track?seq=N` with an IndexedDB retry queue. Hand-offs securely using single-use 60-second authorization codes.
- **Backend API (Express + TypeScript + Zod)**: RESTful API managing users, sessions, chunk uploads, speaker names, transcripts, action items, and exports.
- **Database (PostgreSQL + Prisma)**: Schema tracking users, sessions, audio tracks, chunks, diarized speakers, transcript segments, action items, exports, integrations, and handoff codes.
- **Queue & Workers (BullMQ + Redis)**: Idempotent background jobs for audio assembly, diarization, speaker clip cutting, speech-to-text, acoustic echo filtering, and Gemini structuring.
- **Diarization Service (Python FastAPI + pyannote.audio)**: Containerized microservice performing neural speaker diarization on meeting tab tracks.
- **Speech-to-Text (`SpeechToText` Interface)**: Pluggable speech recognition interface returning word-level timestamps (supporting Whisper, cloud providers, and test mocks).
- **LLM Structuring (Google Gemini)**: Structured JSON output schema enforcing tasks, owners, verbatim spoken due dates (`due_raw`), ISO resolved due dates (`due_date`), source quotes, and confidence scores.
- **Frontend (React Native-Ready Stack)**: Simple, clean UI for rapid migration into the other user's React Native stack. Pre-wired with Server-Sent Events (SSE), 3s fallback polling, and modular typed API client ([`frontend/src/api.ts`](file:///Users/trishitghosh/Desktop/Files/projects/tcsithink/frontend/src/api.ts)).

---

## 2. Directory Structure

```
├── backend/
│   ├── prisma/schema.prisma         # Database schema
│   ├── src/
│   │   ├── config.ts                # App configuration
│   │   ├── app.ts & server.ts       # Express app & HTTP server
│   │   ├── db.ts                    # Prisma client
│   │   ├── middleware/              # Auth, Zod validation, error handling
│   │   ├── routes/                  # Auth, Sessions, Audio, Speakers, Actions, Uploads, Exports
│   │   └── services/
│   │       ├── storage/             # Local volume & S3-swappable storage
│   │       ├── stt/                 # SpeechToText interface & implementations
│   │       ├── llm/                 # Gemini structuring service with retry & chunking
│   │       ├── diarization/         # Diarization HTTP client
│   │       ├── export/              # Excel (exceljs dropdowns) & Notion OAuth/Blocks
│   │       ├── pipeline/            # Assembly, clip selection, echo cancellation, transcript parsing
│   │       └── queue/               # BullMQ queue & worker process
│   └── tests/                       # Unit & pipeline test suites
├── diarization-service/             # FastAPI pyannote.audio container
├── extension/                       # Chrome Manifest V3 extension
├── frontend/                        # Clean test harness UI ready for React Native migration
├── docker-compose.yml               # Multi-container production stack
└── .env.example                     # Environment variables template
```

---

## 3. Quickstart with Docker Compose

Run all 5 containers (PostgreSQL, Redis, Diarization, API, Worker) with one command:

```bash
cp .env.example .env
docker compose up --build
```

- API runs at: `http://localhost:4000`
- Diarization service runs at: `http://localhost:8000`
- PostgreSQL at port `5432`, Redis at port `6379`

To start the frontend test harness:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in Chrome.

---

## 4. Loading the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** ON (top right corner).
3. Click **Load unpacked** (top left).
4. Select the `extension/` directory from this repository.
5. In the extension popup:
   - Accept the one-time recording consent notice.
   - Enter your JWT token from logging into the app (or log in directly).
   - Click **Start Recording** on any active meeting tab (Google Meet, Zoom Web, Teams Web).
   - On clicking **Stop Recording**, the extension automatically requests a 60-second handoff code and redirects your browser to `${APP_URL}/sessions/:id/speakers?handoff=<code>`.

---

## 5. React Native Frontend Migration Guide

The frontend was designed with minimal UI complexity and a strictly decoupled API layer to make integration with the user's React Native stack fast and smooth:

1. **Direct File Copy**:
   - Copy [`frontend/src/api.ts`](file:///Users/trishitghosh/Desktop/Files/projects/tcsithink/frontend/src/api.ts) and [`frontend/src/types.ts`](file:///Users/trishitghosh/Desktop/Files/projects/tcsithink/frontend/src/types.ts) directly into your React Native project.
   - For React Native AsyncStorage instead of `localStorage`, swap `localStorage.getItem('token')` with `AsyncStorage.getItem('token')` inside `setToken`/`getToken`.
2. **Screen Contracts**:
   - **Login / Register**: `api.login(email, password)` / `api.register(email, password)`
   - **Dashboard**: `api.listSessions()`, `api.uploadAudio(...)`, `api.uploadTranscript(...)`
   - **Waiting & Speaker Naming Screen** (`/sessions/:id/speakers`):
     - SSE stream: `new EventSource('/api/sessions/:id/events')` with polling fallback `api.getSessionStatus(sessionId)`
     - Audio clips: `sp.clipPaths` contains audio sample URLs
     - Speaker naming submission: `api.updateSpeakers(sessionId, speakers)`
   - **Review Screen** (`/sessions/:id/review`):
     - Instant inline item updates: `api.updateActionItem(sessionId, actionId, updates)`
     - Delete item: `api.deleteActionItem(sessionId, actionId)`
     - Add new item: `api.createActionItem(sessionId, item)`
     - Downloads: `api.getExcelDownloadUrl(sessionId)` and `api.exportToNotion(sessionId, parentPageId)`

---

## 6. Manual API Integration Steps

To connect external cloud services and live production credentials, perform the following manual steps:

### A. Google Gemini API Integration (`GEMINI_API_KEY`)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API key** -> **Create API key**.
4. Copy the generated API key.
5. In your `.env` file, set:
   ```env
   GEMINI_API_KEY="AIzaSy..."
   GEMINI_MODEL="gemini-1.5-flash"
   ```

### B. Hugging Face Access Token for Pyannote Diarization (`HF_TOKEN`)
Pyannote audio models require accepting their user conditions on Hugging Face:
1. Create or log in to your account at [Hugging Face](https://huggingface.co/).
2. Visit the model pages and click **Agree and access repository**:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
3. Go to **Settings** -> **Access Tokens** -> **New Token** (Role: `Read`).
4. In your `.env` file, set:
   ```env
   HF_TOKEN="hf_..."
   ```
*(Note: If `HF_TOKEN` is left empty during development, the service automatically uses its internal turn generator so all features remain testable without blocking).*

### C. Notion OAuth Public Integration (`NOTION_CLIENT_ID` & `NOTION_CLIENT_SECRET`)
1. Go to the [Notion Integrations Portal](https://www.notion.so/my-integrations).
2. Click **+ New integration**.
3. Choose **Public Integration** (required for user OAuth flow):
   - Company name: `Meeting Action Items App`
   - Website URL: `http://localhost:3000`
   - Redirect URI: `http://localhost:4000/api/integrations/notion/callback`
4. Under **Capabilities**, select:
   - Read content
   - Update content
   - Insert content
5. Copy your **Client ID** and **Client Secret**.
6. In your `.env` file, set:
   ```env
   NOTION_CLIENT_ID="your-notion-client-id"
   NOTION_CLIENT_SECRET="your-notion-client-secret"
   NOTION_REDIRECT_URI="http://localhost:4000/api/integrations/notion/callback"
   ```

### D. All-in-One Cloud Diarization & Speech-to-Text (Deepgram Nova-2) - *Recommended*
To eliminate running PyTorch, torchaudio, and Python containers on your local machine:
1. Sign up at [Deepgram Console](https://console.deepgram.com/) ($200 free credits provided on signup).
2. Create an API Key under **API Keys** → **Create a Key**.
3. In your `.env` file, set:
   ```env
   DIARIZATION_PROVIDER=deepgram
   DEEPGRAM_API_KEY="your-deepgram-api-key"
   DEEPGRAM_MODEL="nova-2"
   STT_PROVIDER=deepgram
   ```
*This performs both speaker diarization and word-level speech-to-text simultaneously via a single fast cloud API call in ~1–2 seconds, requiring zero local ML packages.*

### E. Speech-to-Text (Whisper or Mock)
If you prefer not to use Deepgram for STT:
1. `STT_PROVIDER=mock`: Default offline mock with realistic timestamps.
2. `STT_PROVIDER=whisper`: Set `STT_API_KEY="sk-..."` with your OpenAI key.

---

## 7. Known Limits

- **Browser Tab Audio Only**: The Chrome extension captures audio exclusively from active browser tabs using `chrome.tabCapture`. Only browser-based meetings (e.g. Google Meet web, Zoom Web Client, Microsoft Teams in browser) are supported; desktop Zoom or Teams native apps cannot be captured by browser extensions.
- **Chrome / Chromium Only**: The extension requires Chromium APIs (`chrome.tabCapture`, `chrome.offscreen`) available on Google Chrome, Brave, and Edge.
