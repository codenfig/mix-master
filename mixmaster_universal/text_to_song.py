"""Offline, deterministic, rule-based instrumental composer (no AI or network)."""
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic
import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from generated_storage import save_generated, song_identity

router = APIRouter()
RATE = 22050
GENRES = {"afrobeat", "amapiano", "bongo", "hiphop", "house", "pop"}
SCALES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


class SongRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    genre: str = "afrobeat"
    bpm: int = Field(default=110, ge=60, le=180)
    key: str = "A"
    bars: int = Field(default=16, ge=4, le=32)
    output: str = "instrumental"


def tone(buffer, start, duration, midi, amp, shape="soft"):
    start = int(start * RATE)
    n = min(int(duration * RATE), len(buffer) - start)
    if n <= 0 or start < 0:
        return
    t = np.arange(n, dtype=np.float32) / RATE
    hz = 440 * 2 ** ((midi - 69) / 12)
    wave = np.sin(2 * np.pi * hz * t)
    if shape == "bass":
        wave += .18 * np.sin(4 * np.pi * hz * t)
        env = np.exp(-t * 5)
    else:
        wave += .25 * np.sin(4 * np.pi * hz * t)
        env = np.minimum(1, t * 55) * np.minimum(1, (duration - t) * 12)
    buffer[start:start+n] += (amp * wave * np.maximum(env, 0)).astype(np.float32)


def percussion(buffer, start, kind, rng):
    pos = int(start * RATE)
    length = {"kick": .27, "snare": .16, "hat": .075}[kind]
    n = min(int(length * RATE), len(buffer) - pos)
    if n <= 0:
        return
    t = np.arange(n, dtype=np.float32) / RATE
    if kind == "kick":
        phase = 2 * np.pi * (53 * t + 65 * (1 - np.exp(-t * 32)) / 32)
        sound = .52 * np.sin(phase) * np.exp(-t * 17)
    else:
        noise = rng.standard_normal(n).astype(np.float32)
        # First difference suppresses low frequencies for bright percussion.
        bright = noise - np.roll(noise, 1)
        sound = (.12 if kind == "snare" else .042) * bright * np.exp(-t * (23 if kind == "snare" else 70))
    buffer[pos:pos+n] += sound.astype(np.float32)


def compose(request: SongRequest, destination: Path):
    if request.genre not in GENRES or request.key not in SCALES or request.output != "instrumental":
        raise ValueError("Choose a supported genre, key and instrumental output.")
    seed = int.from_bytes(sha256(f'{request.text}|{request.genre}|{request.bpm}|{request.key}'.encode()).digest()[:8], 'big')
    deadline = monotonic() + 45
    rng = np.random.default_rng(seed)
    beat = 60 / request.bpm
    bar = 4 * beat
    duration = request.bars * bar + 1
    if duration > 130:
        raise ValueError("Song duration is too long.")
    audio = np.zeros(int(duration * RATE), dtype=np.float32)
    root = 36 + SCALES[request.key]  # C2=36, A2=45: correct MIDI pitch classes
    # Minor pentatonic melody; four-chord loop, genre-specific rhythmic accents.
    progression = [0, 5, 3, 4]
    scale = [0, 3, 5, 7, 10, 12, 15]
    patterns = {
        "afrobeat": ([0, 1.5, 2.5, 3.5], [1, 3], [0, .5, 1, 1.5, 2, 2.5, 3, 3.5]),
        "amapiano": ([0, 2.5, 3.5], [1, 3], [0, .75, 1.5, 2.25, 3]),
        "bongo": ([0, 1.5, 2.75], [1, 3], [0, .5, 1.5, 2, 3, 3.5]),
        "hiphop": ([0, 2.75], [1, 3], [0, 1, 2, 3]),
        "house": ([0, 1, 2, 3], [1, 3], [0, .5, 1, 1.5, 2, 2.5, 3, 3.5]),
        "pop": ([0, 2], [1, 3], [0, 1, 2, 3]),
    }
    kicks, snares, hats = patterns[request.genre]
    for i in range(request.bars):
        if monotonic() > deadline:
            raise TimeoutError('Instrumental generation exceeded 45 seconds. Try fewer bars.')
        base = i * bar
        chord = progression[i % 4]
        # Chord pad on beats 0 and 2; bass follows roots with syncopation.
        for offset in (0, 2):
            for interval in (0, 3, 7):
                tone(audio, base + offset * beat, 1.75 * beat, root + 12 + chord + interval, .035)
        for offset in (0, 1.5, 2.5, 3.5):
            tone(audio, base + offset * beat, .40 * beat, root + chord, .22, "bass")
        for offset in kicks:
            percussion(audio, base + offset * beat, "kick", rng)
        for offset in snares:
            percussion(audio, base + offset * beat, "snare", rng)
        for offset in hats:
            percussion(audio, base + offset * beat, "hat", rng)
        # Text affects deterministic note choices, but is not sung or spoken.
        for step in range(8):
            if rng.random() < .68:
                note = root + 24 + chord + scale[int(rng.integers(0, len(scale)))]
                tone(audio, base + step * .5 * beat, .38 * beat, note, .065)
    peak = float(np.max(np.abs(audio)))
    if peak:
        audio *= min(.90 / peak, 1.0)
    sf.write(destination, audio, RATE, subtype="PCM_16")
    return round(request.bars * bar, 2)


@router.post("/api/text-to-song")
def text_to_song(request: SongRequest):
    if not request.text.strip():
        raise HTTPException(400, "Enter lyrics or a description.")
    if request.genre not in GENRES or request.key not in SCALES or request.output != "instrumental":
        raise HTTPException(400, "Unsupported genre, key, or output type.")
    temp = TemporaryDirectory(prefix="mixmaster_composer_")
    try:
        path = Path(temp.name) / "MixMaster_Text_to_Song.wav"
        try:
            compose(request, path)
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        song_title, artwork = song_identity("", request.text, request.genre.title())
        filename = "".join(ch if ch.isalnum() or ch in "-_ " else "" for ch in song_title).strip().replace(" ", "_")[:90] or "MixMaster_Song"
        saved = save_generated(path, "text_to_song", filename + ".wav", "audio/wav", song_title=song_title, artwork_svg=artwork)
        return {"file": saved, "download_url": f"/api/generated-files/{saved['id']}/download"}
    finally:
        temp.cleanup()
