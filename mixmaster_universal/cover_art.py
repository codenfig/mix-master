"""Embed cover artwork and ID3 metadata into a finished MP3 using FFmpeg."""
from pathlib import Path
import subprocess


def embed_cover(mp3: Path, cover: Path | None, title: str, artist: str, album: str, year: str):
    """Remux audio without re-encoding; attach JPEG/PNG as ID3 front cover."""
    output = mp3.with_name("tagged.mp3")
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(mp3)]
    if cover is not None:
        cmd += ["-i", str(cover), "-map", "0:a:0", "-map", "1:v:0", "-c:a", "copy",
                "-c:v", "mjpeg" if cover.suffix.lower() in {".jpg", ".jpeg"} else "png",
                "-disposition:v:0", "attached_pic"]
    else:
        cmd += ["-map", "0:a:0", "-c:a", "copy"]
    cmd += ["-id3v2_version", "3",
            "-metadata", f"title={title}", "-metadata", f"artist={artist}",
            "-metadata", f"album={album}"]
    if year:
        cmd += ["-metadata", f"date={year}"]
    cmd += [str(output)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode or not output.is_file() or not output.stat().st_size:
        raise RuntimeError("Unable to embed cover art and MP3 metadata.")
    output.replace(mp3)
