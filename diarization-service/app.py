import os
import shutil
import tempfile
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Diarization Service (pyannote.audio)")

HF_TOKEN = os.getenv("HF_TOKEN", "")

# Try loading pyannote pipeline if token is provided
pipeline = None
if HF_TOKEN:
    try:
        from pyannote.audio import Pipeline
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=HF_TOKEN
        )
        print("Successfully loaded pyannote.audio pipeline.")
    except Exception as e:
        print(f"Warning: Failed to load pyannote pipeline with HF_TOKEN: {e}")

class Turn(BaseModel):
    speaker_label: str
    start: float
    end: float

class DiarizeResponse(BaseModel):
    turns: List[Turn]
    num_speakers: int

@app.get("/health")
def health():
    return {
        "status": "ok",
        "pyannote_loaded": pipeline is not None,
        "hf_token_configured": bool(HF_TOKEN)
    }

@app.post("/diarize", response_model=DiarizeResponse)
async def diarize(
    file: UploadFile = File(...),
    min_speakers: Optional[int] = Form(None),
    max_speakers: Optional[int] = Form(None)
):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        turns: List[Turn] = []

        if pipeline is not None:
            # Run real Pyannote diarization
            params = {}
            if min_speakers: params["min_speakers"] = min_speakers
            if max_speakers: params["max_speakers"] = max_speakers

            diarization = pipeline(tmp_path, **params)
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                turns.append(Turn(
                    speaker_label=speaker,
                    start=round(float(turn.start), 2),
                    end=round(float(turn.end), 2)
                ))
        else:
            # Fallback/mock turn generator based on audio length
            # Enables testing without mandatory HuggingFace API key
            import wave
            duration = 15.0
            try:
                with wave.open(tmp_path, 'rb') as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate()
                    if rate > 0:
                        duration = max(5.0, frames / float(rate))
            except Exception:
                duration = 15.0

            # Generate speaker turns
            num_speakers = min_speakers or 2
            half = duration / 2.0
            turns = [
                Turn(speaker_label="SPEAKER_00", start=0.5, end=round(half - 0.5, 2)),
                Turn(speaker_label="SPEAKER_01", start=round(half, 2), end=round(duration - 0.5, 2)),
            ]

        speakers_set = set(t.speaker_label for t in turns)
        return DiarizeResponse(
            turns=turns,
            num_speakers=len(speakers_set)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
