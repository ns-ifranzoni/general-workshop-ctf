# Changelog

## v1.0.0
First release.

- **Participants:** self-registration with a shared code (or bulk-created accounts), challenge board with answers, hints and progress, *My progress* timeline, *Rules*, live leaderboard and countdown timer. 5 languages, light and dark theme, mobile friendly.
- **Challenges:** text questions checked server-side against a flag (case-insensitive, extra spaces ignored, otherwise exact; `%username` expands per participant). The flag never reaches the browser. CSV import/export and a bundled template (`templates/challenges.csv`).
- **Scoring:** points on the first correct answer; −5 per wrong answer or hint; 5 wrong answers lock a challenge for 5 minutes (penalties are kept).
- **Admin:** dashboard with podium, Control Center (Stop / Standby / Run, registration, leaderboard visibility, timer, registration code), participants with a detail timeline that shows every submitted wrong answer, challenge editor, configurable workshop name, admins, demo data, clear database and factory reset, award ceremony and fullscreen leaderboard.
- **Deployment:** single Docker container (`general-workshop-ctf`) on port 3002, SQLite in `./data`. No default admin password: it is set on the first sign-in.
