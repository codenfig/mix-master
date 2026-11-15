from pathlib import Path
from tempfile import TemporaryDirectory
import json, shutil, uuid
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from engine import analyze, arrange, render

ROOT = Path(__file__).resolve().parent
app = FastAPI(title='MixMaster AI Universal')
app.mount('/static', StaticFiles(directory=ROOT/'static'), name='static')
SUPPORTED = {'.mp3','.wav','.flac','.m4a','.ogg','.aac'}
MAX_FILE_BYTES = 200 * 1024 * 1024

@app.get('/')
def index():
    return FileResponse(ROOT/'static'/'index.html')

@app.get('/health')
def health():
    return {'ok': True}

@app.post('/api/analyze')
def analyze_songs(songs: list[UploadFile] = File(...)):
    if len(songs) != 10:
        raise HTTPException(400, 'Select exactly 10 audio files.')
    with TemporaryDirectory(prefix='mixmaster_analysis_') as temp:
        tmp = Path(temp)
        tracks = []
        names = []
        for idx, song in enumerate(songs):
            name = song.filename or f'Track {idx + 1}'
            ext = Path(name).suffix.lower()
            if ext not in SUPPORTED:
                raise HTTPException(400, f'Unsupported audio format: {name}')
            dest = tmp / f'{idx:02d}{ext}'
            size = 0
            with dest.open('wb') as output:
                while chunk := song.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise HTTPException(413, f'File too large: {name}')
                    output.write(chunk)
            tracks.append(dest)
            names.append(name)
        try:
            results = [analyze(path) for path in tracks]
            for result, name in zip(results, names):
                result['name'] = name
            order = [track['name'] for track in arrange(results)]
            return {'tracks': [{k:v for k,v in t.items() if k != 'path'} for t in results], 'order': order}
        except Exception as exc:
            raise HTTPException(422, f'Audio analysis failed: {exc}') from exc

@app.post('/api/mix')
def mix(songs: list[UploadFile] = File(...)):
    if len(songs) != 10:
        raise HTTPException(400, 'Select exactly 10 audio files.')
    with TemporaryDirectory(prefix='mixmaster_') as temp:
        tmp = Path(temp)
        tracks = []
        for idx, song in enumerate(songs):
            ext = Path(song.filename or '').suffix.lower()
            if ext not in SUPPORTED:
                raise HTTPException(400, f'Unsupported audio format: {song.filename}')
            dest = tmp/f'{idx:02d}{ext}'
            size = 0
            with dest.open('wb') as output:
                while chunk := song.file.read(1024*1024):
                    size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise HTTPException(413, f'File too large: {song.filename}')
                    output.write(chunk)
            tracks.append(dest)
        try:
            analysis = [analyze(path) for path in tracks]
            ordered = arrange(analysis)
            out = tmp/'MixMaster_AI_Nonstop.mp3'
            render(ordered, out, transition=12)
            # Streaming responses cannot reference files removed when the request ends.
            # A temporary artifact copy is cleaned after the response is sent.
            from starlette.background import BackgroundTask
            from fastapi.responses import FileResponse
            import tempfile
            saved = Path(tempfile.gettempdir())/f'mixmaster_{uuid.uuid4().hex}.mp3'
            shutil.copyfile(out, saved)
            return FileResponse(saved, media_type='audio/mpeg', filename='MixMaster_AI_Nonstop.mp3', background=BackgroundTask(lambda: saved.unlink(missing_ok=True)), headers={'X-MixMaster-Track-Count':'10'})
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(422, f'Audio processing failed: {exc}') from exc
