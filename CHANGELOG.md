# Changelog

## v1.2.1
- **Feature:** **About** has **Check for updates** and **Update now**. The check compares the running version with the latest GitHub Release; *Update now* pulls the latest code inside the container, installs dependencies and restarts the app (`restart: unless-stopped` brings it back), and the page reloads when the server is up. The Docker image now includes `git` for this. To rebuild the image (dependency or Dockerfile changes), use `docker compose up -d --build` or re-run `install.sh`.

## v1.2.0
- **Feature:** the hint penalty is now configurable. **Global Settings → Hint penalty** sets the default (5, stored as `hint_penalty`), and each challenge can override it with its own *pts penalty* next to the hint text (blank = use the default). It is applied to the participant total, history, leaderboard, podium and dashboard ranking; the "Use hint" dialog shows the effective cost. Wrong answers still cost 5. The CSV export/import gains an optional `hint_penalty` column (older CSVs still import).
- **Fix:** the authentication rate limits are sized for a classroom where almost every participant shares one public IP. Only failed attempts count, but a whole room can easily trip the old caps: the per-IP ceiling on login goes from 100 to 2000 failures per 15 min, registration from 15 to 1000 and admin setup from 10 to 50. The per-account login limit (10 failures per username) is unchanged.
- **Fix:** CSV import now turns CRLF/CR line breaks inside quoted cells (Excel) into LF, so Markdown descriptions round-trip exactly. **Load template** aborts without touching the challenges if the template has no valid rows.
- **Installer:** new unified `install.sh` (Amazon Linux 2023 and Ubuntu/Debian, auto-detected) replaces `scripts/install-ctf-amazonlinux.sh` and `scripts/install-ctf-ubuntu.sh`. It installs Docker, Compose and a recent Buildx, deploys to `/opt/general-workshop-ctf`, and publishes HTTPS through Caddy: self-signed by default (works with an IP or an EC2 hostname) or Let's Encrypt with `TLS_MODE=acme`. Re-running it updates the app and keeps `./data`.

## v1.1.0
- **Deployment:** `scripts/install-ctf-amazonlinux.sh` installs everything from scratch on Amazon Linux (EC2) and publishes the portal over HTTPS with Let's Encrypt via Caddy. The README documents it, including the requirement that the chosen domain already exists and points to the instance.

## v1.0.0
First release.

- **Participants:** self-registration with a shared code (or bulk-created accounts), challenge board with answers, hints and progress, *My progress* timeline, *Rules*, live leaderboard and countdown timer. 5 languages, light and dark theme, mobile friendly.
- **Challenges:** text questions checked server-side against a flag (case-insensitive, extra spaces ignored, otherwise exact; `%username` expands per participant). The flag never reaches the browser. CSV import/export and a bundled template (`templates/challenges.csv`).
- **Scoring:** points on the first correct answer; −5 per wrong answer or hint; 5 wrong answers lock a challenge for 5 minutes (penalties are kept).
- **Admin:** dashboard with podium, Control Center (Stop / Standby / Run, registration, leaderboard visibility, timer, registration code), participants with a detail timeline that shows every submitted wrong answer, challenge editor, configurable workshop name, admins, demo data, clear database and factory reset, award ceremony and fullscreen leaderboard.
- **Deployment:** single Docker container (`general-workshop-ctf`) on port 3002, SQLite in `./data`. No default admin password: it is set on the first sign-in.
