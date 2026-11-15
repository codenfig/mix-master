"""Launch the same UI in a desktop window (Windows/macOS/Linux)."""
import threading
import time
import urllib.request
import uvicorn

HOST, PORT = '127.0.0.1', 8765

def serve():
    uvicorn.run('server:app', host=HOST, port=PORT, log_level='warning')

if __name__ == '__main__':
    threading.Thread(target=serve, daemon=True).start()
    for _ in range(80):
        try:
            urllib.request.urlopen(f'http://{HOST}:{PORT}/health', timeout=.25)
            break
        except Exception:
            time.sleep(.15)
    else:
        raise RuntimeError('Local server did not start')
    try:
        import webview
        webview.create_window('MixMaster AI', f'http://{HOST}:{PORT}', width=1040, height=800, min_size=(620,520))
        webview.start()
    except ImportError:
        import webbrowser
        webbrowser.open(f'http://{HOST}:{PORT}')
        input('MixMaster AI is open in your browser. Press Enter to stop the server.\n')
