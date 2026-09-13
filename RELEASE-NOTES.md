# YouTubeSeerr 1.0.0beta

First beta release of the self-hosted YouTube request manager for Jellyfin.

- Sign in with Jellyfin and configure the app through the setup wizard.
- Search videos, channels, and playlists using the official YouTube API.
- Request individual videos or collections, with administrator approval and user request history.
- Download through a separate persistent worker using yt-dlp and FFmpeg, with progress, retry, cancellation, and queue controls.
- Publish media and metadata into a shared Jellyfin library and request a library refresh.
- Monitor future channel uploads and playlist additions.
- Use the responsive dark interface on desktop, tablet, and mobile.
- Start the extracted app correctly even when a parent folder begins with a dot.

## Installation

Download **YouTubeSeerr-1.0.0beta.zip**, extract it, and follow **START-HERE.md**. The archive includes source, the compiled frontend/server, Docker and Compose files, Windows/Linux compile scripts, tests, and documentation. **SHA256SUMS.txt** verifies the ZIP download.

Docker is the recommended installation method. A reachable Jellyfin server, administrator account, YouTube Data API v3 key, and storage are required. A native installation requires Node.js 22.15+, yt-dlp, and FFmpeg. Dependencies are installed during setup; this is not an offline or standalone executable bundle.

## Beta status

The application has passed 35 backend tests and 12 browser tests, including an offline download through real yt-dlp and FFmpeg. The release build and archive are checked separately during packaging. Live Jellyfin acceptance still requires a configured server and credentials. Docker Compose configuration has been validated; a local Docker image build has not been verified because Docker Engine is unavailable in the packaging environment.

Existing installations should back up their config, encryption key, and database before upgrading. See **README.md** for setup, backups, permissions, and troubleshooting.
