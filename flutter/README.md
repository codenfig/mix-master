# Flutter client (iPhone, Android, optional desktop)

This is a **Flutter starter client**, not a published mobile app. It supports selecting 5/10/20 files and calling the existing /api/analyze endpoint. Mixing and saving MP3 files from Flutter remain TODO.

Install Flutter SDK, then in this folder run:

```bash
flutter create . --platforms=android,ios,windows,macos,linux
flutter pub get
flutter run
```

The generated platform directories are Flutter tooling outputs; do not confuse this starter with tested app-store packages. Configure the backend URL in the UI. A phone cannot access the developer machine using 127.0.0.1; use a reachable HTTPS endpoint. iOS builds require macOS/Xcode. Production needs authenticated API access, streaming upload, upload size limits and safe file saving.
