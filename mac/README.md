# macOS desktop

The current macOS desktop application uses `mixmaster_universal/desktop.py` (pywebview + local FastAPI). It is **not yet a signed .app or .dmg**.

```bash
cd mixmaster_universal
python3 -m pip install -r requirements.txt -r requirements-desktop.txt
python3 desktop.py
```

Install FFmpeg first. Apple signing/notarization and installer packaging are pending.
