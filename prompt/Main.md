# MASTER PROMPT: Meeting-to-Action-Items App

You are a senior full-stack engineer. Build the application described below. Before writing code, list the assumptions you are making. Then build milestone by milestone (section 13) and stop after each milestone for review. Write production-quality TypeScript with tests for the pipeline logic.

## 1. PRODUCT
An app that turns meeting audio into structured action items.
- Part A (browser extension + app): the user clicks Start in the extension to record microphone and meeting audio. On Stop, the user is sent to the app in a new tab. The audio is diarized, the user names each speaker, the audio is transcribed with those names, Gemini extracts action items, the user edits them, and exports them to Excel or Notion.
- Part B (dashboard): the app opens on a Dashboard screen where the user uploads an audio file (the pipeline continues from speech-to-text) or a transcript file (the pipeline continues from the Gemini step).

Example of the core transformation:
Input: "Raj: Riya, can you send the updated pricing sheet by Friday? ... Riya: Yes, I'll do that"
Output: Action: Send updated pricing sheet | Owner: Riya | Due: Friday | Assigned By: Raj

## 2. TECH STACK AND CONSTRAINTS
- Frontend: React Native with TypeScript. The React Native Web target is REQUIRED, because the extension opens the session screens in a normal browser tab. All session screens (waiting, speaker naming, review, export) must be reachable by URL in a browser.
- Extension: plain TypeScript, Chrome Manifest V3 (React only for the popup, if wanted). React Native cannot produce a browser extension.
- API: Express (TypeScript), REST + JSON, zod validation, JWT auth.
- Database: PostgreSQL running as a Docker container, with a migration tool (Prisma or node-pg-migrate).
- Job queue: BullMQ + Redis (add a Redis container).
- Diarization service: a small Python (FastAPI) container using pyannote.audio, called over HTTP by a worker.
- Speech-to-text: behind a `SpeechToText` interface that returns word-level timestamps. Do not hard-code one vendor (WhisperX or a cloud provider are both acceptable implementations).
- LLM: Gemini through the official SDK, using structured output (JSON schema).
- docker-compose services: postgres, redis, api, worker, diarization. Audio files live on a mounted volume behind a `Storage` interface (swappable for S3 later).

Known limits to document in the README:
- The extension can only capture audio from a browser tab, so only browser-based meetings are supported (not desktop Zoom or Teams apps).
- Chrome/Chromium only.

## 3. PART A: BROWSER EXTENSION
- Popup with Start and Stop buttons, a timer, and a visible "Recording" indicator.
- On Start (user gesture): capture tab audio with `chrome.tabCapture` and microphone audio with `getUserMedia` (echoCancellation and noiseSuppression on). Hold the streams in an offscreen document. Route tab audio back to the speakers so the user still hears the meeting.
- Record the two sources as SEPARATE tracks: "tab" (remote participants) and "mic" (the local user), sharing one start timestamp.
- Use MediaRecorder (opus/webm) with a 10-second timeslice. Upload each chunk with a sequence number to `PUT /sessions/:id/audio/:track?seq=N`. If an upload fails, queue the chunk in IndexedDB and retry.
- Show a one-time consent notice on first use explaining that other participants are not notified automatically.

Stop behavior (on Stop click, or when the meeting tab closes):
1. Stop both recorders and flush the final chunk.
2. Do NOT wait for processing. Call `POST /sessions/:id/finalize`, then open the app in a NEW tab at `${APP_URL}/sessions/:id/speakers?handoff=<code>` with `chrome.tabs.create`. If a tab for this session is already open, focus it instead of opening another.
3. Keep uploading remaining chunks from the offscreen document in the background, even if the user closes the meeting tab or the app tab. Close the offscreen document only after every chunk is acknowledged.
4. If recording stopped because the meeting tab closed, set the extension badge to "!" and open the same URL when the user clicks the icon.

## 4. PIPELINE (Part A)
State machine on `sessions.status`:
RECORDING -> UPLOADING -> UPLOADED -> DIARIZING -> AWAITING_SPEAKER_NAMES -> TRANSCRIBING -> STRUCTURING -> REVIEW -> EXPORTED, plus FAILED with the error and the retryable step. Every step is idempotent and retryable.

1. Assemble chunks in sequence order, detect gaps (mark the session partial), and normalize with ffmpeg to 16 kHz mono WAV.
2. Diarize the TAB track with pyannote. Output turns as {speaker_label, start, end}, and accept optional min/max speaker hints. The MIC track is the local user, labeled "You" (editable), with no diarization.
3. Clip generation: for each detected speaker, cut 2-3 clean clips (3-8 seconds, longest non-overlapping turns) and store them. Set status to AWAITING_SPEAKER_NAMES.
4. Speaker naming (frontend): for each speaker, play the clips and enter a name. Support merging two speakers (over-segmentation) and skipping a speaker. Store names per session in `speakers`.
5. Transcribe the full tab track once with word timestamps, and the mic track separately. Assign each word/segment to the diarization turn with the greatest overlap, then attach the user-provided speaker name.
6. Echo handling: drop a mic segment if a tab segment overlaps it in time and the text is highly similar (the user was on speakers).
7. Merge both tracks by timestamp into one transcript, `[{start, end, speaker_name, text}]`, and save it to Postgres.
8. Send the transcript to Gemini (section 7).

## 5. HANDOFF AND WAITING SCREEN
Authentication handoff:
- The extension must never put a JWT in a URL. It calls `POST /auth/handoff`, which returns a single-use code that is tied to the user and session and expires in 60 seconds.
- The app page exchanges the code with `POST /auth/handoff/exchange` for a normal session (httpOnly cookie), then removes the code from the URL with `history.replaceState`. If the code is invalid or expired and the user has no valid session, redirect to login and return to the same session URL afterwards.

Route `/sessions/:id/speakers` renders one screen whose state follows `sessions.status`:
- UPLOADING: "Uploading your recording..." with progress.
- UPLOADED / DIARIZING: "Separating voices..." with an indeterminate progress indicator and a note that the user may leave and come back.
- AWAITING_SPEAKER_NAMES: switch automatically, with no reload, to the speaker naming UI.
- FAILED: show the error and a Retry button for the failed step.
- TRANSCRIBING / STRUCTURING / REVIEW: show progress, or redirect to the review screen.

Live updates: `GET /sessions/:id/events` (Server-Sent Events) emits status changes, with `GET /sessions/:id/status` polled every 3 seconds as a fallback.
Resilience: if the user closes the tab, the session stays on the dashboard with a "Needs speaker names" badge that reopens this route. The route is idempotent (a refresh always shows the current state) and only the session owner can load it (403 otherwise).

## 6. PART B: DASHBOARD
- The dashboard is the app's start screen: an upload area, a list of past sessions with their status, and the Notion connection status.
- Audio upload (mp3, wav, m4a, webm): create a session with source `upload_audio` and go straight to TRANSCRIBING. Add an optional "Identify speakers" toggle; if on, run diarization and the naming steps first.
- Transcript upload (txt, srt, vtt, docx): parse it into the transcript format and go straight to STRUCTURING. Recognize "Name: text" lines. If there are no speaker labels, tell Gemini so.
- Both paths converge on the same review screen and export logic as Part A.

## 7. GEMINI STRUCTURING
Input: transcript lines as "Speaker Name: text" with timestamps, plus the meeting date (to resolve relative dates) and the list of known speaker names.
Use structured output with this schema per item:
{ action: string, owner: string, due_raw: string|null, due_date: ISO date|null, assigned_by: string, source_quote: string, timestamp: number, confidence: number 0-1 }

System prompt to use:
"You extract action items from a meeting transcript. An action item is a clear commitment or request that someone will do something. Rules: (1) Only extract explicit tasks; never invent tasks, owners, or dates. (2) When a request is made and someone confirms it ('Yes, I'll do that', 'Sure'), the OWNER is the person who confirmed or was addressed, and ASSIGNED BY is the person who made the request. (3) Owner and assigned_by must be one of the provided speaker names; otherwise use 'Unassigned'. (4) Keep due_raw exactly as spoken ('Friday') and resolve due_date against the meeting date; use null if no date was given. (5) The action text is a short imperative phrase. (6) Merge duplicates. (7) Include the exact source_quote and its timestamp. (8) If unsure, lower the confidence rather than omit."

For long transcripts, chunk with overlap and deduplicate afterwards. Validate the output against the schema and retry once on invalid JSON. Never send audio to Gemini.

## 8. REVIEW SCREEN
A list-style screen with one row per action item: checkbox, action, owner (dropdown of speakers), due date picker (showing due_raw as a hint), and assigned by. Inline editing, delete, and add-new-item. Each row has a "jump to source" link that shows the quote and timestamp in the transcript. Low-confidence items are visually flagged. Edits persist immediately.

## 9. EXPORT
- Excel: generate an .xlsx (exceljs) with columns Done | Action | Owner | Due | Assigned By | Source Meeting. The Done column is a data-validation dropdown (☐/☑) with conditional formatting that strikes through completed rows (true Excel cell checkboxes are not reliably supported by libraries). The file downloads to the device.
- Notion: public integration with OAuth, tokens encrypted at rest. On export, let the user choose a parent page, create a NEW page titled "Action Items - <meeting title/date>", and append `to_do` blocks: "<Action> - Owner: X - Due: Y - Assigned by: Z". Send at most 100 blocks per request, respect roughly 3 requests per second, and retry on HTTP 429 using Retry-After. Store the created page ID on the export record. If access is revoked, prompt the user to reconnect.

## 10. DATABASE (Postgres)
users, sessions (id, user_id, source, status, meeting_date, title, partial, error), audio_tracks (session_id, track, path, duration), speakers (session_id, label, display_name, clip_paths), transcript_segments (session_id, start, end, speaker_id, text), action_items (session_id, action, owner, due_raw, due_date, assigned_by, source_quote, timestamp, confidence, done, edited), exports (session_id, type, external_id, created_at), integrations (user_id, provider, encrypted_token, workspace_id), handoff_codes (code_hash, user_id, session_id, expires_at, used_at).

## 11. API (Express)
Auth (register/login, JWT), POST /auth/handoff, POST /auth/handoff/exchange, sessions CRUD, chunk upload, finalize, GET /sessions/:id/status, GET /sessions/:id/events (SSE), speaker clips and naming, transcript get, action items CRUD, export (excel and notion), Notion OAuth start/callback, and file upload endpoints for Part B. Validate everything with zod, and scope every session to its owner.

## 12. NON-FUNCTIONAL
- Privacy: delete raw audio after successful transcription (configurable retention); never log audio or transcript text; HTTPS only.
- Reliability: resumable uploads, idempotent jobs, clear FAILED states with retry.
- Observability: structured logs with session IDs, and job duration metrics.
- Security: encrypt integration tokens, rate-limit endpoints, and restrict upload file types and sizes.

## 13. MILESTONES (stop for review after each)
1. docker-compose, DB schema, auth (including handoff endpoints), session + chunk upload API.
2. Extension: capture, dual-track recording, upload, and the Stop handoff (new tab + handoff code exchange).
3. Diarization service, clip generation, the waiting screen with all state transitions, and the speaker naming UI.
4. Speech-to-text, speaker assignment, merge, and echo handling.
5. Gemini structuring and the review screen.
6. Excel export and Notion OAuth/export.
7. Part B dashboard (audio and transcript upload) and the shared routing.
8. Tests, error handling, and a README with setup steps and the known limits.