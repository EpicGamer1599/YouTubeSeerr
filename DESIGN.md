# Frontend design and verification

The redesign updates the existing React application in place. The hash routes, API client, authentication, request state, and polling remain connected to the same server contracts. All 13 server TypeScript files match their pre-redesign SHA-256 hashes.

## Interface

- A 224px desktop sidebar and full-width content area replace the large promotional presentation.
- Charcoal surfaces, restrained blue actions, 4–8px radii, a system font stack, and shared spacing/typography tokens unify every screen.
- Discover shows request counts, pending approvals, running downloads, and recent media.
- Search uses a fluid media grid: six columns at 1920px, four at 1440/1280px, three at 1024/768px, and two at 480/390px.
- Details put imagery beside metadata and actions on desktop; mobile stacks the same information.
- Collection scope uses labeled radio choices, selected-video checkboxes, and a distinct entire-collection confirmation.
- Requests use compact desktop rows and stacked mobile rows. Download filters separate active jobs and history.
- Settings separates storage, media, queue/worker, and advanced controls while retaining all existing options. Narrow screens use a section selector.
- Login uses Jellyfin identity. Setup adds a masked review step and a completion screen.

Shared primitives live in src/components.tsx. Color, spacing, control, typography, radius, and shadow tokens live at the beginning of src/styles.css. No frontend dependency was added.

## Rendered review

Playwright uses the production build with an isolated SQLite database. Its fixture media and thumbnails are explicitly marked and never loaded by production. Queue fixture states support UI checks; the separate downloader integration exercises actual yt-dlp and FFmpeg.

Screenshots cover setup, setup review, login, Discover, search, details, collection scope, requests, downloads, and settings at:

| Viewport    | Navigation         | Search columns |
| ----------- | ------------------ | -------------- |
| 1920 × 1080 | Persistent sidebar | 6              |
| 1440 × 900  | Persistent sidebar | 4              |
| 1280 × 720  | Persistent sidebar | 4              |
| 1024 × 768  | Persistent sidebar | 3              |
| 768 × 1024  | Modal drawer       | 3              |
| 480 × 640   | Modal drawer       | 2              |
| 390 × 844   | Modal drawer       | 2              |

The screenshots are in [test-results/visual](test-results/visual). Both viewport captures and full-page captures are retained for the main screens. Setup captures include the full form.

Visual inspection led to fixes for cropped channel avatars, long settings forms, and dialog focus restoration. Browser assertions also check document/dialog overflow, grid column counts, desktop details alignment, mobile focus trapping, Escape dismissal, focus return, and absence of page errors.

## Functional checks

The two original browser workflows remain, with updated copy/navigation selectors and additional assertions for the setup review. The suite now has 12 tests, including seven viewport cases.

Additional browser coverage checks channel/playlist requests, recent/future/all/selected/new scope controls, required entire-collection approval, selected-video persistence, rejection reasons, member cancellation, administrator approval, live progress polling, retry, job cancellation, history removal without removing available media, saved settings, library refresh queuing, masked keys, and member/admin boundaries.

The 35 backend/download tests continue to cover durable queue state, restart recovery, actual downloader/FFmpeg execution, publication, NFO metadata, Jellyfin refresh integration, request sharing, subscriptions, and security contracts.

Use the commands in [README.md](README.md) to reproduce the checks. Real Jellyfin credentials, official YouTube API configuration, and Docker Engine deployment remain environment-specific acceptance checks; their status is recorded in [VALIDATION.md](VALIDATION.md).
