from pathlib import Path
import subprocess
import tempfile
import numpy as np
import librosa
import soundfile as sf

SR = 22050
KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

def analyze(path):
    y, sr = librosa.load(str(path), sr=SR, mono=True)
    if len(y) < SR: raise ValueError(f'Track too short: {path}')
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    bpm = float(np.asarray(tempo).ravel()[0])
    chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
    scores = [(np.corrcoef(chroma, np.roll(profile, i))[0,1], KEYS[i] + mode)
              for i in range(12) for profile,mode in [(MAJOR,' major'),(MINOR,' minor')]]
    key = max(scores)[1]
    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.percentile(rms, 75))
    return {'path':str(path), 'name':Path(path).name, 'bpm':round(bpm,1),
            'key':key, 'energy':energy, 'duration':round(len(y)/sr,1)}

def arrange(tracks):
    # Ascending energy is the hard requirement; adjacent BPM/key affinity breaks near ties.
    ordered=[]
    pool=sorted(tracks,key=lambda x:x['energy'])
    while pool:
        if not ordered: chosen=pool[0]
        else:
            low=pool[0]['energy']
            candidates=[t for t in pool if t['energy'] <= low*1.12+0.0001]
            prev=ordered[-1]
            chosen=min(candidates,key=lambda t:abs(np.log2(max(t['bpm'],1)/max(prev['bpm'],1))))
        ordered.append(chosen); pool.remove(chosen)
    return ordered

def decode_stereo(path, sr=44100):
    # ffmpeg handles mp3, wav, flac and most standard codecs.
    proc=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','2','-ar',str(sr),'-'],
                        capture_output=True,check=True)
    return np.frombuffer(proc.stdout,dtype='<f4').reshape(-1,2).copy()

def match_tempo(audio, source_bpm, target_bpm, max_change=0.06):
    """Pitch-preserving time stretch for close tempos, avoiding extreme artifacts.

    Returns (audio, applied). Unreliable or distant BPM values are skipped.
    """
    if source_bpm <= 0 or target_bpm <= 0 or len(audio) == 0:
        return audio, False
    candidates = [source_bpm / 2, source_bpm, source_bpm * 2]
    source = min(candidates, key=lambda bpm: abs(np.log2(bpm / target_bpm)))
    rate = target_bpm / source
    if not (1 - max_change <= rate <= 1 + max_change):
        return audio, False
    if abs(rate - 1) < 0.003:
        return audio, False
    stretched = librosa.effects.time_stretch(audio.T, rate=rate).T
    return stretched.astype(np.float32, copy=False), True


def render(tracks, output, transition=12, progress=None, beatmatch=True):
    sr=44100
    fade=int(sr*transition)
    previous_bpm = None
    with tempfile.TemporaryDirectory() as tmp:
        raw=Path(tmp)/'mix.raw'
        with open(raw,'wb') as out:
            tail=None
            for i,t in enumerate(tracks):
                audio=decode_stereo(t['path'],sr)
                current_bpm = float(t.get('bpm', 0))
                if beatmatch and previous_bpm is not None:
                    audio, _ = match_tempo(audio, current_bpm, previous_bpm)
                if len(audio)<2*fade: raise ValueError(f'Track must exceed {2*transition} seconds: {t["name"]}')
                if tail is None:
                    out.write(audio[:-fade].astype('<f4').tobytes())
                else:
                    # Equal-power crossfade; optional conservative tempo matching.
                    # Beat-phase and phrase alignment are not implemented.
                    n=min(len(tail),fade)
                    phase=np.linspace(0,np.pi/2,n,dtype=np.float32)[:,None]
                    overlap=tail[-n:]*np.cos(phase)+audio[:n]*np.sin(phase)
                    out.write(overlap.astype('<f4').tobytes())
                    out.write(audio[n:-fade].astype('<f4').tobytes())
                tail=audio[-fade:]
                previous_bpm = current_bpm if current_bpm > 0 else previous_bpm
                if progress: progress(i+1,len(tracks))
            out.write(tail.astype('<f4').tobytes())
        # limiter via peak normalization avoids clipping at overlaps; preserve stereo.
        # ffmpeg loudnorm in two-pass mastering can be added in a later release.
        subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(sr),'-ac','2',
                        '-i',str(raw),'-af','alimiter=limit=0.95','-codec:a','libmp3lame',
                        '-b:a','320k',str(output)],check=True)
