"""Deterministic four-beat song arrangement planner (no audio synthesis)."""
import re

DEFAULT_SECTIONS = [
    ("Intro", 4), ("Verse 1", 8), ("Pre-Chorus", 4), ("Chorus", 8),
    ("Verse 2", 8), ("Chorus", 8), ("Bridge", 4), ("Final Chorus", 8), ("Outro", 4),
]
SECTION_RE = re.compile(r"^\s*\[\s*(intro|verse(?:\s*\d+)?|pre[ -]?chorus|chorus|bridge|final\s+chorus|outro|instrumental(?:\s+break)?)\s*\]\s*$", re.I)
ENERGY = {"intro": 0.3, "verse": 0.55, "pre-chorus": 0.72, "chorus": 0.95,
          "bridge": 0.5, "final chorus": 1.0, "outro": 0.25, "instrumental": 0.75}


def arrangement(lyrics: str, bpm: int, minutes: int) -> dict:
    """Return a bar-aligned section plan close to the requested duration."""
    headings = []
    for line in lyrics.splitlines():
        match = SECTION_RE.match(line)
        if match:
            label = match.group(1).strip().title()
            if label.lower().replace("-", "") == "prechorus":
                label = "Pre-Chorus"
            headings.append(label)
    defaults = {name.lower(): bars for name, bars in DEFAULT_SECTIONS}
    labels = headings[:24] or [name for name, _ in DEFAULT_SECTIONS]
    target_bars = max(len(labels), round(minutes * 60 * bpm / 240))
    weights = [defaults.get(label.lower(), 8) for label in labels]
    total = sum(weights)
    counts = [max(1, int(target_bars * weight / total)) for weight in weights]
    remainder = target_bars - sum(counts)
    i = 0
    while remainder > 0:
        counts[i % len(counts)] += 1
        remainder -= 1
        i += 1
    while remainder < 0:
        index = max((i for i, n in enumerate(counts) if n > 1), key=lambda i: counts[i], default=None)
        if index is None:
            break
        counts[index] -= 1
        remainder += 1
    sections = []
    start = 0
    for label, bars in zip(labels, counts):
        normalized = re.sub(r"\s*\d+$", "", label.lower())
        energy = ENERGY.get(normalized, 0.6)
        sections.append({"name": label, "start_bar": start + 1, "bars": bars,
                         "start_seconds": round(start * 240 / bpm, 2),
                         "duration_seconds": round(bars * 240 / bpm, 2),
                         "energy": energy})
        start += bars
    return {"time_signature": "4/4", "bpm": bpm, "target_seconds": minutes * 60,
            "estimated_seconds": round(start * 240 / bpm, 2), "total_bars": start,
            "sections": sections}
