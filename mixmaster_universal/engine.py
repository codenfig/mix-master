from pathlib import Path
import subprocess
import tempfile
import numpy as np
import librosa
import soundfile as sf
from transitions import optimize_transition

SR = 22050
KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

def analyze(path):
    y, sr = librosa.load(str(path), sr=SR, mono=True)
    if len(y) < SR: raise ValueError(f'Track too short: {path}')
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    bpm = float(np.asarray(tempo).ravel()[0])
    beat_times = librosa.frames_to_time(beats, sr=sr)
    beat_offset = float(beat_times[0]) if len(beat_times) >= 3 else None
    chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
    scores = [(np.corrcoef(chroma, np.roll(profile, i))[0,1], KEYS[i] + mode)
              for i in range(12) for profile,mode in [(MAJOR,' major'),(MINOR,' minor')]]
    key = max(scores)[1]
    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.percentile(rms, 75))
    return {'path':str(path), 'name':Path(path).name, 'bpm':round(bpm,1),
            'key':key, 'energy':energy, 'duration':round(len(y)/sr,1),
            'beat_offset':round(beat_offset,4) if beat_offset is not None else None}

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
    # Materialize only when stretching is needed; memmaps cannot be passed
    # directly through all librosa processing stages.
    stretched = librosa.effects.time_stretch(np.asarray(audio.T, dtype=np.float32), rate=rate).T
    return stretched.astype(np.float32, copy=False), True


def _write_audio(out, audio, chunk_frames=65536):
    """Write float32 stereo PCM in bounded chunks."""
    for offset in range(0, len(audio), chunk_frames):
        out.write(np.asarray(audio[offset:offset + chunk_frames], dtype='<f4').tobytes())


def decode_stereo_disk(path, directory, sr=44100):
    """Decode through FFmpeg into a disk-backed array instead of stdout RAM."""
    destination = Path(directory) / 'decoded.f32'
    with destination.open('wb') as sink:
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path),
             '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
            stdout=sink, stderr=subprocess.PIPE, check=True,
        )
    samples = destination.stat().st_size // 8
    if not samples:
        raise ValueError('Decoded track contains no audio')
    return np.memmap(destination, dtype='<f4', mode='r', shape=(samples, 2))


def beat_aligned_trim(outgoing_duration, fade_seconds, outgoing_beat_offset,
                      incoming_beat_offset, bpm, max_trim=0.8):
    """Calculate a small trim that aligns estimated beat phases, not phrases."""
    if (bpm <= 0 or outgoing_beat_offset is None or incoming_beat_offset is None
            or not np.isfinite(bpm)):
        return 0.0
    period = 60.0 / bpm
    if not 0.25 <= period <= 2.0:
        return 0.0
    phase = (outgoing_duration - fade_seconds - outgoing_beat_offset) % period
    until_next = (-phase) % period
    trim = (incoming_beat_offset - until_next) % period
    return float(trim) if trim <= max_trim else 0.0


def evaluate_raw_mix(path, chunk_frames=65536):
    """Bounded-memory stereo PCM signal health metrics, not perceptual quality."""
    peak = 0.0
    squares = 0.0
    silent = 0
    frames = 0
    with Path(path).open('rb') as source:
        while True:
            block = np.fromfile(source, dtype='<f4', count=chunk_frames * 2)
            if not len(block):
                break
            if len(block) % 2:
                raise ValueError('Invalid stereo PCM')
            stereo = block.reshape(-1, 2)
            if not np.all(np.isfinite(stereo)):
                raise ValueError('Non-finite audio')
            peak = max(peak, float(np.max(np.abs(stereo))))
            squares += float(np.sum(np.square(stereo.astype(np.float64))))
            silent += int(np.count_nonzero(np.max(np.abs(stereo), axis=1) < 0.001))
            frames += len(stereo)
    if not frames:
        raise ValueError('Empty mix')
    return {
        'peak': round(peak, 5),
        'rms': round(float(np.sqrt(squares / (frames * 2))), 5),
        'near_silence_fraction': round(silent / frames, 4),
        'clipping_risk': peak > 0.99,
        'duration_seconds': round(frames / 44100, 2),
    }


def extract_kick_sample(path, sr=44100):
    """Sample a filtered bass transient, not a separated drum stem."""
    from scipy.signal import butter, sosfilt
    probe_sr = 11025
    decoded = subprocess.run(
        ['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-t', '60',
         '-ac', '1', '-ar', str(probe_sr), '-f', 'f32le', '-'],
        capture_output=True, check=True)
    audio = np.frombuffer(decoded.stdout, dtype='<f4')
    if len(audio) < probe_sr * 2:
        raise ValueError('Source song is too short for kick extraction')
    low = sosfilt(butter(4, [35, 180], btype='bandpass', fs=probe_sr, output='sos'), audio)
    hop = 110
    n = len(low) // hop
    rms = np.sqrt(np.mean(low[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-10)
    baseline = np.maximum(0.003, np.convolve(rms, np.ones(12) / 12, mode='same'))
    novelty = np.maximum(0, rms - np.roll(rms, 2)) / baseline
    novelty[:30] = 0
    novelty[-45:] = 0
    scores = novelty * np.minimum(1, rms / 0.018)
    onset = None
    for index in np.argsort(scores)[-100:][::-1]:
        start = max(0, index * hop - int(0.012 * probe_sr))
        if np.max(np.abs(low[start:start + int(0.16 * probe_sr)])) > 0.015:
            onset = start
            break
    if onset is None:
        raise ValueError('No suitable low-frequency transient in selected song')
    length = int(0.28 * probe_sr)
    sample = np.zeros(length, dtype=np.float32)
    available = low[onset:onset + length]
    sample[:len(available)] = available
    sample *= np.exp(-np.arange(length) / probe_sr * 15).astype(np.float32)
    peak = float(np.max(np.abs(sample)))
    if peak < 1e-5:
        raise ValueError('Extracted kick is too quiet')
    sample /= peak
    sample = librosa.resample(sample, orig_sr=probe_sr, target_sr=sr)
    fade = min(len(sample), int(0.025 * sr))
    sample[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return np.asarray(sample, dtype=np.float32), round(onset / probe_sr, 2)


def add_kick_to_raw(source, destination, bpm, level=0.16, style="soft", sr=44100, sample=None):
    """Overlay a globally phase-continuous synthetic four-on-the-floor kick.

    Stream in bounded chunks. Conservative level adaptation uses short-block
    RMS as a proxy for existing density; this is not kick-source separation.
    """
    if not 60 <= bpm <= 180 or not 0 <= level <= 0.35:
        raise ValueError("Invalid kick tempo or level")
    if style not in {"soft", "club"}:
        raise ValueError("Unknown kick style")
    length = round((0.19 if style == "soft" else 0.24) * sr)
    t = np.arange(length, dtype=np.float64) / sr
    freq = (58 if style == "soft" else 68) * np.exp(-t * (24 if style == "soft" else 28)) + (48 if style == "soft" else 44)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    envelope = (1 - np.exp(-t * 850)) * np.exp(-t * (27 if style == "soft" else 20))
    kick = (np.sin(phase) * envelope).astype(np.float32)
    if style == "club":
        kick += (0.12 * np.exp(-t * 120) * np.sin(2 * np.pi * 1400 * t)).astype(np.float32)
    if sample is not None:
        kick = np.asarray(sample, dtype=np.float32)
        length = len(kick)
        if length == 0 or not np.all(np.isfinite(kick)):
            raise ValueError("Invalid extracted kick sample")
    beat_frames = sr * 60.0 / bpm
    frame = 0
    with open(source, "rb") as inp, open(destination, "wb") as out:
        while True:
            block = np.fromfile(inp, dtype="<f4", count=65536 * 2)
            if block.size == 0:
                break
            if block.size % 2:
                raise ValueError("Invalid stereo PCM")
            stereo = block.reshape(-1, 2).copy()
            end = frame + len(stereo)
            first = max(0, int(np.ceil((frame - length + 1) / beat_frames)))
            last = int(np.floor((end - 1) / beat_frames))
            # Keep the kick's timing anchored to sample zero across every song.
            for beat in range(first, last + 1):
                onset = round(beat * beat_frames)
                a = max(frame, onset)
                b = min(end, onset + length)
                if b <= a:
                    continue
                section = stereo[a - frame:b - frame]
                density = float(np.sqrt(np.mean(section * section) + 1e-10))
                gain = level * (0.45 if density > 0.20 else 0.65 if density > 0.12 else 1.0)
                section += (gain * kick[a - onset:b - onset])[:, None]
            out.write(stereo.astype("<f4", copy=False).tobytes())
            frame = end


def render(tracks, output, transition=12, progress=None, beatmatch=True, optimize=True, mastering="balanced", kick_enabled=False, kick_style="soft", kick_level=0.16, mastering_options=None, kick_source_index=None, source_tracks=None):
    """Disk-backed crossfade renderer with optional conservative tempo matching.

    Unstretched tracks remain on disk. Stretching a track still uses RAM, so
    this is not yet a fully streaming time-stretch implementation.
    """
    sr = 44100
    fade = int(sr * transition)
    previous_bpm = None
    previous_beat_offset = None
    previous_duration = None
    transition_reports = []
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / 'mix.raw'
        with raw.open('wb') as out:
            tail = None
            for i, track in enumerate(tracks):
                # Each decoded track is scoped to its own directory, allowing
                # memmap handles to be discarded after processing.
                with tempfile.TemporaryDirectory(dir=tmp) as decoded_dir:
                    audio = decode_stereo_disk(track['path'], decoded_dir, sr)
                    current_bpm = float(track.get('bpm', 0))
                    applied = False
                    if beatmatch and previous_bpm is not None:
                        audio, applied = match_tempo(audio, current_bpm, previous_bpm)
                    effective_bpm = previous_bpm if applied else current_bpm
                    ratio = current_bpm / effective_bpm if applied and effective_bpm else 1.0
                    incoming_offset = track.get('beat_offset')
                    if incoming_offset is not None:
                        incoming_offset = float(incoming_offset) * ratio
                    trim_frames = 0
                    if (beatmatch and previous_bpm and previous_duration is not None
                            and effective_bpm > 0
                            and abs(effective_bpm - previous_bpm) / previous_bpm < 0.035):
                        trim_seconds = beat_aligned_trim(
                            previous_duration, transition, previous_beat_offset,
                            incoming_offset, effective_bpm)
                        trim_frames = round(trim_seconds * sr)
                    # The optimizer chooses the incoming song's entry point
                    # against the outgoing tail. Do not pre-trim to a fixed
                    # phrase location: that would discard viable candidates.
                    if trim_frames:
                        audio = audio[trim_frames:]
                        if incoming_offset is not None:
                            incoming_offset -= trim_frames / sr
                    if len(audio) < 2 * fade:
                        raise ValueError(f'Track must exceed {2 * transition} seconds: {track["name"]}')
                    if tail is None:
                        _write_audio(out, audio[:-fade])
                    else:
                        n = min(len(tail), fade)
                        if optimize:
                            extra, assessment, attempts = optimize_transition(
                                tail, audio, n, sr=sr, bpm=effective_bpm,
                                beat_offset=incoming_offset)
                            if extra and len(audio) - extra >= 2 * fade:
                                audio = audio[extra:]
                            transition_reports.append({
                                'from': tracks[i - 1]['name'], 'to': track['name'],
                                'proxy_score': assessment['score'],
                                'loudness_gap_db': assessment['loudness_gap_db'],
                                'attempts': attempts,
                                'selected_offset_seconds': round((trim_frames + extra) / sr, 3),
                            })
                        # Compute only the transition in memory.
                        phase = np.linspace(0, np.pi / 2, n, dtype=np.float32)[:, None]
                        overlap = tail[-n:] * np.cos(phase) + audio[:n] * np.sin(phase)
                        _write_audio(out, overlap)
                        _write_audio(out, audio[n:-fade])
                    tail = np.asarray(audio[-fade:], dtype=np.float32).copy()
                    previous_bpm = effective_bpm if effective_bpm > 0 else previous_bpm
                    previous_beat_offset = incoming_offset
                    previous_duration = len(audio) / sr
                if progress:
                    progress(i + 1, len(tracks))
            if tail is not None:
                _write_audio(out, tail)
        if kick_enabled:
            reference_bpm = float(tracks[0].get("bpm", 0)) if tracks else 0
            if not 60 <= reference_bpm <= 180:
                raise ValueError("Smart Kick requires an opening track between 60 and 180 BPM")
            with_kick = Path(tmp) / "mix_with_kick.raw"
            extracted = None
            kick_offset = None
            source_name = None
            if kick_source_index is not None:
                available = source_tracks if source_tracks is not None else tracks
                if not 0 <= kick_source_index < len(available):
                    raise ValueError("Kick source is outside the selected tracks")
                source_track = available[kick_source_index]
                source_name = source_track["name"]
                extracted, kick_offset = extract_kick_sample(source_track["path"], sr)
            add_kick_to_raw(raw, with_kick, reference_bpm, kick_level, kick_style, sr, sample=extracted)
            raw = with_kick
        report = evaluate_raw_mix(raw)
        report["kick"] = {"enabled": kick_enabled, "style": kick_style if kick_enabled else None,
                          "bpm": round(float(tracks[0].get("bpm", 0)), 1) if kick_enabled else None,
                          "level": kick_level if kick_enabled else None,
                          "source": source_name if kick_enabled else None,
                          "source_offset_seconds": kick_offset if kick_enabled else None}
        report['transitions'] = transition_reports
        report['transition_proxy_average'] = round(sum(t['proxy_score'] for t in transition_reports) / len(transition_reports), 1) if transition_reports else None
        # FFmpeg loudnorm performs EBU R128 loudness normalization and
        # true-peak limiting. Single-pass mode is intentionally conservative:
        # it does not pretend to restore fidelity lost in source recordings.
        profiles = {
            'off': None,
            'balanced': (-14.0, -1.5, 11.0),
            'club': (-12.0, -1.5, 9.0),
            'custom': None,
        }
        if mastering not in profiles:
            raise ValueError('Unknown mastering preset')
        opts = mastering_options or {}
        if mastering == 'custom':
            target = float(opts.get('target_lufs', -14))
            peak_limit = float(opts.get('true_peak', -1.5))
            bass = float(opts.get('bass_db', 0))
            treble = float(opts.get('treble_db', 0))
            compression = bool(opts.get('compression', False))
            if not (-20 <= target <= -9 and -3 <= peak_limit <= -0.5
                    and -6 <= bass <= 6 and -6 <= treble <= 6):
                raise ValueError('Invalid custom mastering settings')
            lra = 9.0 if compression else 11.0
        else:
            target, peak_limit, lra = profiles[mastering] if mastering != 'off' else (None, None, None)
            bass = treble = 0.0
            compression = False
        filters = ['highpass=f=25']
        if bass:
            filters.append(f'equalizer=f=110:t=o:w=1:g={bass:.2f}')
        if treble:
            filters.append(f'equalizer=f=8500:t=o:w=1:g={treble:.2f}')
        if compression:
            filters.append('acompressor=threshold=0.125:ratio=2:attack=20:release=250:makeup=1')
        if target is not None:
            filters.append(f'loudnorm=I={target}:TP={peak_limit}:LRA={lra}')
        else:
            filters.append('alimiter=limit=0.95')
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-nostdin', '-f', 'f32le',
             '-ar', str(sr), '-ac', '2', '-i', str(raw),
             '-af', ','.join(filters), '-ar', str(sr),
             '-codec:a', 'libmp3lame', '-b:a', '320k', str(output)], check=True,
        )
        report['mastering'] = {'preset': mastering, 'target_lufs': target, 'true_peak_limit_dbtp': peak_limit, 'bass_db': bass, 'treble_db': treble, 'compression': compression}
        return report
