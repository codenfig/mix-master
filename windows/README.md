# Windows desktop

The current Windows desktop application uses `mixmaster_universal/desktop.py` (pywebview + local FastAPI). It is **not yet a packaged .exe**.

From the repository root:

```powershell
cd mixmaster_universal
py -m pip install -r requirements.txt -r requirements-desktop.txt
py desktop.py
```

Install FFmpeg and ensure it is on PATH. Installer signing and automated Windows packaging are pending.
