# Web application

The existing responsive PWA lives at `../mixmaster_universal/static/`, served by `../mixmaster_universal/server.py`. This folder is the web-platform entry point and documentation; no second frontend copy is maintained.

Run:

```bash
cd mixmaster_universal
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000
```

Requires FFmpeg installed. Do not publicly expose the development server.
