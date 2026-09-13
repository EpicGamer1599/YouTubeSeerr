# YouTubeSeerr 1.0.0beta

Extract the ZIP first, then open a terminal in the extracted **YouTubeSeerr-1.0.0beta** folder. This release includes the full source and precompiled **dist/** files. It runs as a web service; it is not a standalone Windows executable.

## Start with Docker (recommended)

Install Docker Engine/Desktop with Docker Compose v2 and make sure Docker is running. You also need a reachable Jellyfin server, a Jellyfin administrator account, and a YouTube Data API v3 key.

1. Copy **.env.example** to **.env** using your file manager.
2. Edit **.env**: set **MEDIA_PATH** to the folder Jellyfin can read, and set **PUID/PGID** to the owner of your media on Linux. On Windows, paths such as **D:/Media/YouTube** work.
3. From the extracted folder, run:

```sh
docker compose up -d --build
```

4. Open **http://localhost:5056** (or **http://your-server:5056**) and complete the setup wizard.

Docker installs Node, application dependencies, yt-dlp, and FFmpeg, and runs both the web service and worker. The first build needs internet access. Keep **config/**, **downloads/**, **media/**, and **.env** when upgrading; they contain your settings and data. Back up first with the instructions in [README.md](README.md).

## Compile from source

Install **Node.js 22.15 or later**, including npm. Run the appropriate compile file from a terminal:

| Platform      | Command         |
| ------------- | --------------- |
| Windows       | `.\compile.bat` |
| Linux / macOS | `sh compile.sh` |

The scripts install the exact dependencies in **package-lock.json** and compile the server and frontend into **dist/**. They stop if installation or compilation fails. Internet access is required to install dependencies. They do not start the app.

To compile the Docker image instead, use **.\compile.bat --docker** on Windows or **sh compile.sh --docker** on Linux/macOS. This mode requires Docker and does not require Node installed on the host. Then run **docker compose up -d**.

## Run the precompiled app without Docker

Install Node.js 22.15 or later, **yt-dlp**, and **FFmpeg** (including **ffprobe**) on your PATH. These platform-specific tools and **node_modules/** are not bundled in the ZIP; Docker installs them automatically.

Copy **.env.example** to **.env** and set **JELLYFIN_URL** to an address reachable from your computer, such as **http://192.168.1.100:8096**. For native operation, use **CONFIG_DIR**, **DOWNLOAD_DIR**, and **MEDIA_DIR** if you need custom storage locations. The **CONFIG_PATH**, **DOWNLOAD_PATH**, and **MEDIA_PATH** variables configure Docker mounts only.

Install the production dependencies, then start the web service:

```sh
npm ci --omit=dev
npm start
```

Open a second terminal in the same extracted folder and start the worker:

```sh
npm run worker
```

Keep both processes running and open **http://localhost:5056**. If you already ran a compile script, the dependencies are installed and you can skip **npm ci --omit=dev**.

## GitHub upload

- To populate a GitHub repository, upload the contents of the extracted folder, including the dotfiles and **.github/**. When using Git, **dist/** is intentionally ignored because it is rebuilt from source.
- Create a GitHub release with tag **v1.0.0beta**, title **YouTubeSeerr 1.0.0beta**, and **Set as a pre-release** selected.
- Upload **YouTubeSeerr-1.0.0beta.zip** and **SHA256SUMS.txt** from the release folder as release assets. Copy [RELEASE-NOTES.md](RELEASE-NOTES.md) into the release description.
- The generated **release/** directory is ignored by Git and Docker. Release archives are uploaded as assets, while source changes are committed normally.

The public release name is **1.0.0beta**. npm metadata uses the equivalent valid prerelease version **1.0.0-beta**.

## Recreate the release ZIP (Windows)

From the source folder, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1
```

This builds the app using installed dependencies, copies an explicit list of release files, and creates the ZIP, SHA-256 checksum, and release notes under **release/**. Run the compile script first if dependencies are not installed. Existing release artifacts are never overwritten; use **-OutputDirectory release/rebuild** to write a fresh copy elsewhere.
