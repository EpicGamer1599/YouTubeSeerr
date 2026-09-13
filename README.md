# YouTubeSeerr

**Release: 1.0.0beta.** Download and extract **YouTubeSeerr-1.0.0beta.zip**, then follow [START-HERE.md](START-HERE.md). The archive includes source code, the compiled application, Docker files, and **compile.bat** / **compile.sh**. See [RELEASE-NOTES.md](RELEASE-NOTES.md) for release details.

A self-hosted YouTube request manager for Jellyfin. Sign in with your existing Jellyfin account, find videos and creators, request content, and let an administrator approve it for your library.

Independently implemented, with a media-first interface inspired by applications such as Jellyseerr. No Jellyseerr source code or assets are included.

## Features

- Jellyfin login, avatars, administrator detection, optional local administrator permissions.
- First-run wizard with server testing, administrator authentication, YouTube API configuration, storage, and a masked configuration review.
- Official YouTube search and details for videos, channels, and playlists; direct links and channel handles.
- Private member request history and administrator approval, rejection, cancellation, and retry.
- Recent or entire channels, future uploads, entire playlists, new playlist additions, and selected videos.
- Explicit approval confirmation for entire collections and configurable collection-size limits.
- Persistent SQLite queue, atomic claims, real progress, speed, ETA, pause/resume, retries, and restart recovery.
- Actual yt-dlp downloads, FFmpeg processing, video quality, audio-only MP3, bandwidth limits, optional cookies.
- Channel-based folders, safe filenames, NFO metadata, posters, and automatic Jellyfin refresh.
- Full-width dark interface, responsive media grids, keyboard-accessible mobile navigation/dialogs, grouped settings, user management, and download logs.

Live/upcoming streams must finish before requesting them. Channel scans skip them until they become ordinary uploads.

## Architecture

React + TypeScript provides the frontend. Express + TypeScript serves the API and production frontend. Node's SQLite driver avoids a native database addon or external database. A **separate worker process** reads the same SQLite queue and invokes yt-dlp with argument arrays and no shell.

No Redis, PostgreSQL, external queue, or second user account is required. The web process never downloads videos. Web and worker use the same Docker image with shared volumes.

    PENDING → APPROVED → QUEUED → DOWNLOADING → PROCESSING → AVAILABLE
          ↘ REJECTED                             ↘ FAILED
          ↘ CANCELLED

APPROVED is a short transactional transition into the queue. AVAILABLE means files have been published locally; Jellyfin discovery follows the refresh job. A subscription without outstanding downloads shows “Monitoring.” A shared video job can satisfy multiple approved requests.

## Requirements

- Docker Engine/Desktop and Docker Compose v2.
- A reachable Jellyfin server, administrator account for setup, and a Movies library for videos.
- A Google Cloud project with **YouTube Data API v3** enabled and an API key.
- Enough staging and library space; publication temporarily keeps a copy in both.
- Internet access for YouTube, metadata, and image builds.
- Local SQLite storage. Do not place the config/database volume on NFS or SMB.

## Docker installation

1. Copy the project to your server.
2. Copy **.env.example** to **.env**.
3. Set **MEDIA_PATH** to a host folder Jellyfin can also read.
4. Set **PUID/PGID** to the user/group that own your media.
5. Start both services:

```sh
docker compose up -d --build
```

Open **http://your-server:5056** and finish setup.

The included Compose file builds one image and runs separate web and worker containers. This is a complete compact equivalent:

```yaml
name: youtubeseerr
services:
  youtubeseerr:
    build: .
    image: youtubeseerr:local
    restart: unless-stopped
    ports:
      - '5056:5056'
    environment:
      PUID: '1000'
      PGID: '1000'
      TZ: Australia/Perth
      CONFIG_DIR: /config
      DOWNLOAD_DIR: /downloads
      MEDIA_DIR: /media/youtube
    volumes:
      - ./config:/config
      - ./downloads:/downloads
      - /your/jellyfin/youtube:/media/youtube
  worker:
    image: youtubeseerr:local
    restart: unless-stopped
    command: ['node', 'dist/server/worker-entry.js']
    environment:
      PUID: '1000'
      PGID: '1000'
      TZ: Australia/Perth
      CONFIG_DIR: /config
      DOWNLOAD_DIR: /downloads
      MEDIA_DIR: /media/youtube
    volumes:
      - ./config:/config
      - ./downloads:/downloads
      - /your/jellyfin/youtube:/media/youtube
    depends_on:
      - youtubeseerr
```

Use the project's **docker-compose.yml** for health checks, graceful shutdown, environment overrides, and host-gateway support.

On Windows, use host paths with forward slashes in .env, for example **MEDIA_PATH=D:/Media/YouTube**. Settings still use Linux container paths.

## Setup and Jellyfin

Enter an address reachable from the **container**, such as:

- http://192.168.4.225:8096
- http://jellyfin:8096 on a shared Docker network
- http://host.docker.internal:8096 for Jellyfin on the Docker host

Localhost inside a container refers to that container. Jellyfin URLs with a subpath are supported.

Test the server, then authenticate as a Jellyfin administrator. YouTubeSeerr stores user ID, name, administrator status, and optional image tag; it never stores the password. If interrupted after connecting Jellyfin, sign in again as an administrator to resume setup.

The administrator's Jellyfin token initially enables refresh and library discovery. For durable operation, create a dedicated key under **Jellyfin → Dashboard → API Keys**, then enter it in **Settings → Jellyfin**.

Other users sign in with their existing Jellyfin accounts.

### Library configuration

1. Create a **Movies** library dedicated to YouTube videos.
2. Add the Jellyfin container's path to the same host folder used by MEDIA_PATH.
3. Enable local NFO metadata reading. Disable unrelated movie metadata providers if they produce incorrect matches.
4. Select the library in YouTubeSeerr, or leave the library ID blank to refresh all libraries.
5. Keep automatic refresh enabled.

Container paths can differ. YouTubeSeerr can write /media/youtube while Jellyfin reads /data/youtube, provided both map the same host folder.

Jellyfin needs read access to published files. The entrypoint changes ownership of volume roots only; it never recursively changes ownership of an existing library. If you change PUID/PGID later, migrate existing config and storage ownership yourself.

## YouTube configuration

Enable [YouTube Data API v3 in Google Cloud](https://console.cloud.google.com/apis/library/youtube.googleapis.com) and create an API key.

Restrict the key to YouTube Data API v3. Do not use HTTP-referrer restrictions for this server-side application. Optional IP restrictions must allow your server's outbound address.

Keys stay on the server. Settings returns only configured flags, even for administrators. A blank secret field preserves the existing value.

Search responses are cached for five minutes, metadata for fifteen minutes, and user searches are rate limited. Quota failures produce readable errors. Large collection scans consume additional metadata quota. Google controls quotas and any associated costs.

## Collection behavior

| Content  | Scope    | Behavior                                                       |
| -------- | -------- | -------------------------------------------------------------- |
| Video    | Single   | Downloads after approval.                                      |
| Channel  | Recent   | Downloads the configured number of recent public uploads.      |
| Channel  | Future   | Polls for uploads published after request creation.            |
| Channel  | Entire   | Downloads available public uploads within the safety cap.      |
| Playlist | Entire   | Downloads currently available public videos once.              |
| Playlist | New only | Records initial entries, then downloads newly added video IDs. |
| Playlist | Selected | Downloads selected videos that still belong to the playlist.   |

An administrator can open a pending collection's details and adjust scope or selected videos before **Download now**. Entire-collection approval requires explicit confirmation. The default safety cap is 5,000 videos and polling interval is 60 minutes.

Cancel a monitored request to stop its subscription. Private/deleted entries are omitted because the official API cannot return usable metadata. Entire-channel mode covers the channel's uploads playlist, not members-only content or every channel tab.

## Downloader configuration

The yt-dlp adapter is in **server/downloader.ts**. **YTDLP_VERSION** pins the version installed during Docker builds; change it and rebuild to update independently.

The image includes FFmpeg, Node as the JavaScript runtime, and yt-dlp's default dependencies with YouTube challenge support. Remote code components are disabled.

- Quality sets a maximum height; the best available format within that limit is selected.
- Audio-only mode creates MP3 with embedded metadata. Use an appropriate Jellyfin Music library for audio-only collections.
- Format/quality changes apply to jobs that start afterward; existing downloads are retained.
- Retries apply to yt-dlp network/fragments and queue failures. Queue retries use exponential backoff.
- Speed limits such as 4M or 800K apply per download.
- Partial downloads remain in staging for resume. Successful staging folders are cleaned up.
- Optional Netscape-format cookies can be stored at /config/youtube-cookies.txt and selected in Settings. Keep the file writable by the worker because yt-dlp may update the cookie jar.
- Pausing finishes active jobs and holds new jobs and subscription scans.
- Cancelling a shared video job affects all requests waiting on it. Cancelling one request only stops a video job when no other active request needs it.
- Completed/cancelled job records can be removed from queue history. Downloaded media is retained.

Download only content you have permission to download. Do not commit cookie files or secrets.

## Storage

```text
/media/youtube/
  Channel name [YouTube-channel-ID]/
    Video title [YouTube-video-ID]/
      Video title [YouTube-video-ID].mkv
      movie.nfo
      poster.jpg
```

Names are Unicode-normalized, bounded, sanitized for Windows/Linux, and disambiguated by YouTube IDs. Windows reserved filenames are handled. Paths and directory symlinks are checked for containment. Publication uses unique temporary files and atomic destination renames.

Keep staging and library directories separate. Default Docker paths are **/downloads** and **/media/youtube**. Paths configured in Settings must be mounted and writable in both services.

## Security

- Random HttpOnly, SameSite session cookies; SHA-256 session IDs in SQLite.
- Session-specific CSRF tokens and same-origin validation for writes.
- AES-256-GCM encryption for stored API keys and Jellyfin tokens, using **/config/secret.key**.
- Session expiry, Jellyfin revalidation every five minutes, and immediate local session revocation on access changes.
- Server-side checks on every administrative API.
- Member request/job privacy; shared media availability does not disclose other requester identities.
- Bounded input, login/search rate limits, validated IDs/URLs, and no shell execution.
- Runtime privilege dropping; private config storage and readable published media.

For access beyond a trusted home network, use an HTTPS reverse proxy. Set **COOKIE_SECURE=true** and **APP_ORIGIN** to the exact external origin. Use **TRUST_PROXY=1** only with one trusted proxy and no direct untrusted access to the app port. **BIND_ADDRESS=127.0.0.1** can restrict a same-host proxy deployment.

Complete setup on a trusted network before exposing the app. Setup intentionally supports private Jellyfin addresses. Protect the config volume and app port.

## Environment reference

Non-secret settings persist in SQLite. Nonempty **YOUTUBE_API_KEY** and **JELLYFIN_API_KEY** override stored secrets. Remove an environment override before changing that secret through Settings.

| Variable                                 | Purpose                                         |
| ---------------------------------------- | ----------------------------------------------- |
| PORT / BIND_ADDRESS                      | Compose published port and interface.           |
| CONFIG_PATH / DOWNLOAD_PATH / MEDIA_PATH | Host bind mounts.                               |
| CONFIG_DIR / DOWNLOAD_DIR / MEDIA_DIR    | Native process paths or container paths.        |
| PUID / PGID                              | Container runtime UID/GID.                      |
| JELLYFIN_URL                             | Initial default; setup persists the chosen URL. |
| YOUTUBE_API_KEY / JELLYFIN_API_KEY       | Optional secret overrides.                      |
| YTDLP_VERSION                            | Downloader build version.                       |
| YTDLP_BIN                                | Native executable path; default yt-dlp.         |
| FFMPEG_BIN                               | Optional native FFmpeg executable/directory.    |
| YTDLP_COOKIES_FILE                       | Initial cookie-file path.                       |
| COOKIE_SECURE / APP_ORIGIN / TRUST_PROXY | HTTPS/proxy settings.                           |
| TZ                                       | Process timezone.                               |

## Updating and backup

Stop both services and back up the complete config directory, including **secret.key**, the database, and any SQLite WAL/SHM files. The encryption key must stay with its database.

```sh
docker compose stop
# Back up config/ and optionally downloads/media with your backup tool.
docker compose build --pull
docker compose up -d
```

Migrations run automatically. For a live backup, use SQLite's VACUUM INTO snapshot instead of copying only the main database. **npm run backup -- /absolute/backup-directory** creates a consistent database copy and copies the encryption key and standard cookie files.

Restore while both services are stopped, preserve ownership, and restart. Expired worker leases return interrupted jobs to the queue.

## Troubleshooting

| Symptom                       | Check                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Jellyfin unreachable          | Container-reachable address, port, network, subpath, and completed Jellyfin setup.      |
| Login rejected                | Jellyfin credentials, account disablement, and server permissions.                      |
| Queue waiting                 | Both services must run; check docker compose ps and docker compose logs worker.         |
| Missing downloader            | Rebuild the image or configure native YTDLP_BIN and FFmpeg.                             |
| Search failure                | Data API enablement, key restrictions, quota, Settings → Logs.                          |
| yt-dlp failure/sign-in prompt | Update yt-dlp; inspect availability, age restrictions, and cookies.                     |
| Media absent in Jellyfin      | Shared host directory, library type/path, read permissions, refresh job, Jellyfin logs. |
| Collection exceeds cap        | Increase the explicit cap or request recent/selected videos.                            |
| Secret decryption failure     | Restore the matching secret.key; do not replace it independently.                       |
| Proxy/session errors          | Exact APP_ORIGIN, HTTPS, secure cookies, trusted proxy configuration.                   |

Logs retain 10,000 entries; the UI displays the latest 300. Technical downloader logs are administrator-only. Failed jobs include readable errors and retry controls.

## Development

Use Node 22.15 or later, yt-dlp, and FFmpeg. Early Node 22 versions print an experimental SQLite notice.

```sh
npm ci
npm run dev
```

The frontend runs at **http://localhost:5173**, proxying /api to port 5056. Web and worker processes are separate. Native .env values are loaded by start/dev scripts.

Production without Docker:

```sh
npm run build
npm start
# In another terminal:
npm run worker
```

The backend serves the compiled frontend. Do not expose Vite's development server publicly.

### Automated testing

```sh
npm test
npm run test:ui
npm run format:check
```

- **core.test.ts** covers authentication contracts, sessions, CSRF, permissions, privacy, metadata/search, requests, approval/rejection, queue claiming/recovery, invocation arguments, filenames, publication, refresh, subscriptions, and revocation. External APIs are fixtures.
- **download.test.ts** runs a complete offline workflow with **actual yt-dlp and FFmpeg**. FFmpeg generates an audiovisual test clip; yt-dlp downloads it over local HTTP, remuxes it, reports progress, and publishes it through the real worker. Only external authentication/metadata responses are fixtures. It explicitly skips if yt-dlp is missing.
- **ui.spec.ts** retains the original desktop/mobile workflows and adds collection scopes, confirmations, selection persistence, rejection, progress/retry/cancellation, history, settings persistence, and seven viewport sweeps. The 12 browser tests use a disposable database; production never loads fixtures. Main screenshots include both viewport and full-page captures in **test-results/visual**. See [DESIGN.md](DESIGN.md) for the frontend design and review details.

Install Chromium with **npx playwright install chromium**. Windows users with Edge installed can set **PLAYWRIGHT_CHANNEL=msedge**. Screenshots/traces are saved under test-results.

### Live acceptance test

**npm run test:live** uses real Jellyfin, YouTube, and the actual worker with no mocks. Configure a running instance and provide:

```text
LIVE_APP_URL=http://localhost:5056
LIVE_USER=normal-jellyfin-user
LIVE_PASSWORD=...
LIVE_ADMIN=jellyfin-administrator
LIVE_ADMIN_PASSWORD=...
LIVE_VIDEO_ID=unrequested-11-character-video-ID
LIVE_JELLYFIN_URL=http://your-jellyfin:8096
LIVE_JELLYFIN_API_KEY=...
```

The test logs in, resolves YouTube metadata, requests/approves the video, observes progress, waits for publication, refreshes Jellyfin, and verifies the item in Jellyfin's API. It uses storage and quota and leaves the media/request in place. Keep credentials out of version control.

Fixture tests cannot verify your real credentials, network, mounts, YouTube restrictions, or Jellyfin library. Run live acceptance after setup to check these deployment-specific requirements.

## API

All routes are under **/api**. Authenticate with the session cookie. After login, send the returned **csrf** value as **X-CSRF-Token** with JSON on every write.

| Route                                                           | Purpose                                         |
| --------------------------------------------------------------- | ----------------------------------------------- |
| GET /health, GET /setup                                         | Health/setup status.                            |
| POST /setup/test, /setup/connect, /setup/finish                 | First-run setup; finish requires admin.         |
| POST /auth/login, /auth/logout; GET /auth/me, /auth/avatar      | Session and profile.                            |
| GET /search?q=&type=&pageToken=                                 | Search or direct URL resolution.                |
| GET /media/:type/:id, /media/:type/:id/items                    | Details and paginated contents.                 |
| GET /requests?status=&type=; POST /requests                     | Scoped history and creation.                    |
| POST /requests/:id/approve, /reject, /retry                     | Administrator request actions.                  |
| POST /requests/:id/cancel                                       | Own pending cancellation or admin cancellation. |
| GET /downloads                                                  | Scoped queue and worker health.                 |
| POST /jobs/:id/cancel, /retry; DELETE /jobs/:id                 | Administrator queue controls.                   |
| GET /settings; PUT /settings                                    | Administrator configuration.                    |
| GET /jellyfin/libraries; POST /jellyfin/test, /jellyfin/refresh | Integration.                                    |
| GET /users; PATCH /users/:id; GET /logs?after=                  | Administrator users/logs.                       |

Approval accepts optional mode/selectedIds and requires confirmedAll for entire collections.

## Project structure

```text
server/
  app.ts          HTTP and authorization boundaries
  auth.ts         Sessions and CSRF
  config.ts       Settings and encrypted secrets
  db.ts           SQLite and migrations
  jellyfin.ts     Jellyfin adapter
  youtube.ts      Official YouTube adapter/cache
  requests.ts     Transitions and shared membership
  worker.ts       Queue and collection scheduler
  downloader.ts   yt-dlp process/progress
  files.ts        Safe paths, publication, NFO
src/              React interface
tests/            Contract, downloader, browser, live tests
scripts/          Entrypoint and backup utility
```

Upstream references: [Jellyfin API](https://api.jellyfin.org/), [YouTube Data API](https://developers.google.com/youtube/v3/docs), [yt-dlp](https://github.com/yt-dlp/yt-dlp).

MIT licensed. Dependencies retain their own licenses.
