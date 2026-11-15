# Linux desktop

The current Linux desktop application uses `mixmaster_universal/desktop.py` (pywebview + local FastAPI). It is **not yet an AppImage, .deb or Flatpak**.

```bash
cd mixmaster_universal
python3 -m pip install -r requirements.txt -r requirements-desktop.txt
python3 desktop.py
```

Install FFmpeg and pywebview's required GTK/WebKit packages. Distribution packaging is pending.
