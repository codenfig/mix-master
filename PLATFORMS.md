# MixMaster AI platform organization

| Folder | Purpose | State |
| --- | --- | --- |
| `flutter/` | Flutter mobile client source (Android/iOS, potentially desktop) | Starter, analysis request only |
| `web/` | Web entry point and instructions; UI remains in `mixmaster_universal/static/` | Existing responsive web MVP |
| `windows/` | Windows launcher and packaging instructions | Existing shared launcher, no installer |
| `mac/` | macOS launcher and packaging instructions | Existing shared launcher, no installer |
| `linux/` | Linux launcher and packaging instructions | Existing shared launcher, no installer |
| `mixmaster_universal/` | Shared FastAPI backend, DSP engine, UI assets and desktop launcher | Working-source MVP, requires integration tests |

We intentionally keep a **single Python audio engine** to prevent platform divergence. Flutter and the browser act as clients to that engine. Desktop wrappers launch the same local service.

## Important gaps
Flutter mixing/export, platform-specific packaging, true beatmatching, background jobs, authentication, production hosting and real-device testing are not complete.
