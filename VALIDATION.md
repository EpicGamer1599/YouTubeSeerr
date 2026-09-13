# Validation record

Validated locally on Windows on 13 September 2026 with Node 22.15.1.

| Check                                       | Result                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Backend and frontend TypeScript compilation | Passed                                                                       |
| Vite production build                       | Passed                                                                       |
| Automated backend and downloader tests      | 35 passed, no skips                                                          |
| Desktop browser workflow                    | Passed: setup, login, search, request, approval, queue, settings             |
| Mobile browser workflow                     | Passed at 390px: login, navigation, requests, dialog, no horizontal overflow |
| Real offline download integration           | Passed with actual yt-dlp 2026.08.19 and FFmpeg                              |
| Live YouTube smoke download                 | Passed: video and audio streams downloaded and merged to MKV                 |
| Docker Compose configuration                | Passed validation using official Compose CLI                                 |
| SQLite migrations and WAL                   | Passed                                                                       |
| SQLite backup and integrity check           | Passed                                                                       |
| Formatting                                  | Passed                                                                       |
| Production dependency audit                 | Zero reported vulnerabilities                                                |
| Native web and worker processes             | Started successfully on port 5056                                            |

The frontend redesign preserved the existing backend: all 13 server TypeScript files match their pre-redesign SHA-256 hashes. The browser suite now contains **12 passing tests**, covering the original workflows, collection scopes, queue actions, settings, and responsive checks. Screenshots were reviewed at **1920×1080, 1440×900, 1280×720, 1024×768, 768×1024, 480×640, and 390×844**. See [DESIGN.md](DESIGN.md) and the local [screenshot gallery](test-results/visual/index.html).

The offline integration test generates a real audiovisual file with FFmpeg, downloads it over HTTP using the actual yt-dlp executable, observes progress, remuxes it, publishes it through the worker, writes NFO metadata, verifies decoding, and invokes the Jellyfin refresh adapter. Its external authentication and metadata services are test fixtures.

Browser fixtures exist only in tests/ui-server.ts and disposable test databases. The normal application database remains ready for first-run setup.

## Deployment checks still needed

- **Docker image build/start:** Docker Engine is not installed on this machine. Compose configuration was validated, and the repository includes CI steps to build/start both services and check health on a Docker-capable runner.
- **Your Jellyfin and YouTube configuration:** No real Jellyfin account or YouTube API key was supplied. Real Jellyfin login, official search with your key, the shared media mount, and discovery in your Jellyfin library still need deployment verification.
- **Live acceptance:** The no-mock live test correctly reported its missing LIVE_* configuration and was skipped. Run it after configuring the server; instructions are in README.md.

The live YouTube smoke check proves real YouTube extraction/download worked from this machine. It does not replace the full Jellyfin acceptance test.
