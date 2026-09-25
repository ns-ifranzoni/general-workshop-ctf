# General Workshop CTF

Self-hosted **Capture the Flag** portal for hands-on workshops, packaged as a
single Docker container. Participants register, solve text challenges and
climb a live leaderboard. The instructor runs everything from an admin panel:
challenges, participants, CTF state, countdown timer and the final award
ceremony.

No external services and no third-party accounts: one container and a SQLite
file.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Updating](#updating)
- [Running a workshop](#running-a-workshop)
- [Challenges](#challenges)
- [Scoring rules](#scoring-rules)
- [Admin panel](#admin-panel)
- [Configuration](#configuration)
- [Data and backups](#data-and-backups)
- [Security notes](#security-notes)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Features

**Participants**
- Self-registration with a shared registration code, or accounts bulk-created by the instructor.
- Challenge board as the main screen: answer, check, optional hints, progress bar.
- *My progress* timeline and *Rules* tab.
- Live leaderboard (the instructor can hide it) and countdown timer.
- 5 languages (English, Spanish, Portuguese, French, German), light and dark theme, mobile friendly.

**Instructor (admin)**
- Dashboard: readiness, podium and per-participant progress.
- Control Center: CTF state (**Stop / Standby / Run**), registration on/off, leaderboard visibility, countdown timer, registration code.
- Challenge editor: create, edit, reorder (drag and drop), show/hide, CSV import/export and a bundled template.
- Participants: progress, reset, delete, and a **Detail** timeline that shows **what each participant typed on every wrong answer**.
- Configurable **workshop name** shown on every screen.
- Award ceremony (fullscreen ranking reveal with music) and fullscreen leaderboard for projecting.
- Demo data, clear database and factory reset.

---

## Quick start

Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose) and `git`.

```bash
git clone https://github.com/ns-ifranzoni/general-workshop-ctf.git
cd general-workshop-ctf
docker compose up -d --build
```

The first build compiles native dependencies and takes a couple of minutes.

Open **http://localhost:3002** and sign in as **`ADMIN-2026`** with an **empty
password**. On the first sign-in the portal asks you to choose one, so there is
no default password to change or leak.

---

## Updating

```bash
cd general-workshop-ctf
git pull
docker compose up -d --build
```

Your data lives in `./data` and is kept across rebuilds.

---

## Running a workshop

1. **Global Settings** → set the **Workshop name**.
2. **Challenges** → create your challenges, import a CSV, or load the bundled
   template (`templates/challenges.csv`). New challenges start hidden: make
   them visible with the eye icon.
3. **Control Center** →
   - open **Registration** and share the **Registration Code** (default
     `workshop2026`), or create accounts from **Participants → bulk
     create** (username = password);
   - set the **timer** (presets 15m / 30m / 45m / 1h, ±5 min);
   - switch the CTF to **Run** when you are ready to start.
4. Follow the **Dashboard** during the session. Use **Participants → Detail**
   (clock icon) to see each participant's attempts and wrong answers.
5. At the end, launch the **Award Ceremony** from the Control Center.
6. Before the next group: **Global Settings → Factory Reset** (or *Clear
   Database* to keep admins and settings).

**CTF states**

| State | Participants see challenges | Answers accepted | Timer |
|---|---|---|---|
| **Stop** | No | No | Paused |
| **Standby** | Yes (read-only) | No | Paused |
| **Run** | Yes | Yes | Running |

When the timer reaches zero the CTF switches to **Standby** automatically.

> **Tip:** **Global Settings → Demo data** adds sample challenges and 10 demo
> participants (`DEMO-01` … `DEMO-10`, password = username) to preview the
> dashboard, leaderboard and ceremony before a real session.

---

## Challenges

Every challenge is a **text question**: the participant types an answer,
presses **Check**, and the answer is compared with the challenge's **flag**.

- Matching is **case-insensitive** and ignores leading, trailing and repeated
  spaces; otherwise it must be **exact** (`port 443` does not match `443`).
- `%username` inside a flag is replaced by the participant's username, so one
  challenge can expect a different answer per participant.
- The flag is **never sent to the participant's browser**.

Each challenge has a title, a description, a flag, points (default 50), an
optional hint and a visibility toggle.

### CSV format

Used by import, export and the bundled template:

```csv
seq,title,description,flag,points,hint,visible
1,"HTTPS","Which TCP port does HTTPS use by default?","443",50,"HTTP uses port 80.",1
2,"Warm-up","Type your own username.","%username",25,"",1
```

- Quoted fields may contain commas, quotes (`""`) and line breaks.
- `visible` defaults to `1` when empty; `points` defaults to `50`.
- **Import** appends to the existing challenges. **Load template** replaces all
  challenges (and all progress) with `templates/challenges.csv`.

---

## Scoring rules

- A challenge awards its points **once**, on the first correct answer.
- Every **wrong answer** costs **−5 points**.
- Every **hint** used costs **−5 points** (once per challenge).
- After **5 wrong answers** on a challenge it locks for **5 minutes**. After
  the cooldown the retry counter starts again; penalties already earned are
  kept.
- **Total = points earned − 5 × (wrong answers + hints used)**.
- Ties are broken by who reached the score first.

---

## Admin panel

| Section | What it is for |
|---|---|
| **Dashboard** | Readiness (participants, visible challenges), CTF and registration semaphores, podium, participant activity. |
| **Control Center** | CTF state, leaderboard visibility, registration, timer, registration code, award ceremony, fullscreen leaderboard, reset CTF progress. |
| **Participants** | Progress per participant, **Detail** timeline (completions, hints and wrong answers with the submitted text), reset, delete, bulk create. |
| **Challenges** | Create, edit, reorder, show/hide, delete, CSV import/export, load template. |
| **Global Settings** | Workshop name, demo data, clear database, factory reset. |
| **Admins** | Create admins (random password shown once), reset passwords, API tokens, disable/delete. |
| **About** | Version and changelog. |

The built-in `ADMIN-2026` account cannot be deleted or disabled.

---

## Configuration

| Setting | Where | Default |
|---|---|---|
| Port | `docker-compose.yml` → `ports` and `PORT` | `3002` |
| Workshop name | Admin → Global Settings | `Workshop CTF` |
| Registration code | Admin → Control Center | `workshop2026` |
| CTF timer | Admin → Control Center | 2 h |
| JWT secret | `JWT_SECRET` environment variable (optional) | generated on first start and stored in the database |
| CORS origin | `ALLOWED_ORIGIN` environment variable (optional) | same origin only |

To change the port, edit both values in `docker-compose.yml`:

```yaml
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
```

---

## Data and backups

- Everything is stored in **`data/data.db`** (SQLite). The folder is
  bind-mounted into the container, so it survives `docker compose down` and
  rebuilds.
- **Backup:**
  ```bash
  docker compose stop
  cp data/data.db data/data.db.backup-$(date +%Y%m%d)
  docker compose start
  ```
- **Start from scratch:**
  ```bash
  docker compose down && rm data/data.db* && docker compose up -d
  ```

---

## Security notes

- No default admin password: it is set on the first sign-in.
- Admin API tokens are random per install and can be rotated in **Admins**.
- Failed sign-ins are rate limited per username (and loosely per IP), so a
  classroom behind one public IP is not locked out.
- Flags never reach the participant's browser; answers are checked server-side.
- Participant passwords are short by design (5–8 characters) for workshop use.
  Don't leave the portal exposed to the internet longer than the session needs.

---

## Project structure

```
├── docker-compose.yml       # container name, port, data volume
├── Dockerfile
├── server/
│   ├── index.js             # Express app, static files
│   ├── db.js                # SQLite schema and defaults
│   ├── challenge-csv.js     # CSV import/export format
│   ├── rate-limit.js        # sign-in throttling
│   ├── middleware/auth.js   # JWT / admin token auth
│   └── routes/
│       ├── auth.js          # login, register, first admin password
│       ├── challenges.js    # CTF state, timer, scoring, leaderboard, challenge CRUD
│       └── admin.js         # participants, admins, settings, resets, demo data
├── public/                  # single-page app (HTML, CSS, JS, translations)
├── templates/challenges.csv # bundled challenge template
└── data/                    # SQLite database (not in git)
```

Stack: Node.js 20, Express, better-sqlite3 and a vanilla JavaScript front end.

Run without Docker (development):

```bash
npm install
npm run dev        # http://localhost:3002, restarts on changes
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| The page still shows an old version after updating | Hard refresh (**Cmd/Ctrl + Shift + R**) once. |
| `ADMIN-2026` asks for a password you don't know | Another admin can reset it in **Admins**, or a factory reset clears it. Without another admin, start from scratch (see *Data and backups*). |
| Participants can't register | Registration must be **Open** in the Control Center and they must use the current registration code. |
| Participants don't see challenges | The CTF is on **Stop**, or the challenges are hidden (eye icon in **Challenges**). |
| **Check** does nothing | The CTF is not on **Run**, or the timer has expired. |
| Port already in use | Change the port in `docker-compose.yml` (see *Configuration*). |

Useful commands:

```bash
docker compose logs -f     # follow logs
docker compose restart     # restart
docker compose down        # stop and remove the container (data is kept)
```

See [CHANGELOG.md](CHANGELOG.md) for the release history.
