const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { DEFAULT_CTF_TIMER_SECONDS, DEFAULT_REGISTRATION_CODE, DEFAULT_ADMIN, DEFAULT_WORKSHOP_NAME } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { setSetting, invalidate: invalidateSettings } = require('../settings-cache');
const PARTICIPANT_NAMES = require('../participant-names');
const { PARTICIPANT_ICONS } = require('../constants');
const { parseCsv, challengeFromCsvRow } = require('../challenge-csv');

const router = express.Router();

const TEMPLATE_CSV = path.join(__dirname, '../../templates/challenges.csv');

function randomParticipantIcon() {
  return PARTICIPANT_ICONS[Math.floor(Math.random() * PARTICIPANT_ICONS.length)];
}

function deleteParticipantData(code) {
  db.prepare('DELETE FROM challenge_completions WHERE participant_code = ?').run(code);
  db.prepare('DELETE FROM challenge_attempts WHERE participant_code = ?').run(code);
  db.prepare('DELETE FROM hint_usage WHERE participant_code = ?').run(code);
}

// ── Access codes (participants + admins) ──────────────────

router.get('/codes', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, code, api_key, role, created_at, icon, username
    FROM access_codes
    ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

// Creates an admin account with a random password (shown once). Participants
// are created by self-registration or in bulk.
router.post('/codes', requireAdmin, async (req, res) => {
  const { code, label } = req.body;
  const username = String(code || '').trim().toUpperCase();
  if (username.length < 5 || username.length > 12) return res.status(400).json({ error: 'Admin username must be between 5 and 12 characters' });
  const token = crypto.randomBytes(24).toString('hex');
  const password = crypto.randomBytes(6).toString('hex').toUpperCase();
  const passHash = await bcrypt.hash(password, 10);
  try {
    db.prepare("INSERT INTO access_codes (code, api_key, label, role, username, password_hash) VALUES (?, ?, ?, 'admin', ?, ?)")
      .run(username, token, label?.trim() || null, username, passHash);
    res.json({ ok: true, token, password });
  } catch {
    res.status(409).json({ error: 'Code already exists' });
  }
});

router.get('/admins', requireAdmin, (req, res) => {
  const rows = db.prepare(
    "SELECT id, code, api_key, label FROM access_codes WHERE role = 'admin' ORDER BY id ASC"
  ).all();
  res.json(rows);
});

router.patch('/admins/:code/disable', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  if (code === DEFAULT_ADMIN) return res.status(400).json({ error: 'Cannot disable the default admin' });
  const row = db.prepare("SELECT id FROM access_codes WHERE code = ? AND role = 'admin'").get(code);
  if (!row) return res.status(404).json({ error: 'Admin not found' });
  const cur = db.prepare("SELECT label FROM access_codes WHERE code = ?").get(code);
  const disabled = (cur?.label || '').startsWith('[DISABLED] ');
  const newLabel = disabled
    ? (cur.label.replace('[DISABLED] ', '') || null)
    : `[DISABLED] ${cur?.label || code}`;
  db.prepare("UPDATE access_codes SET label = ? WHERE code = ?").run(newLabel, code);
  res.json({ ok: true, disabled: !disabled });
});

router.post('/admins/:code/reset-password', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  const row = db.prepare("SELECT id FROM access_codes WHERE code = ? AND role = 'admin'").get(code);
  if (!row) return res.status(404).json({ error: 'Admin not found' });
  const newPass = crypto.randomBytes(6).toString('hex').toUpperCase();
  const hash = await bcrypt.hash(newPass, 10);
  db.prepare("UPDATE access_codes SET password_hash = ? WHERE code = ?").run(hash, code);
  res.json({ ok: true, password: newPass });
});

router.post('/admins/:code/regenerate-token', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  const row = db.prepare("SELECT id FROM access_codes WHERE code = ? AND role = 'admin'").get(code);
  if (!row) return res.status(404).json({ error: 'Admin not found' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare("UPDATE access_codes SET api_key = ? WHERE code = ?").run(token, code);
  res.json({ ok: true, token });
});

// ── Bulk create participants with random themed names ──
// Each participant: username = password = name.
router.post('/participants/bulk', requireAdmin, async (req, res) => {
  const n = parseInt(req.body?.count, 10);
  if (!n || n < 1 || n > 50) {
    return res.status(400).json({ error: 'count must be between 1 and 50' });
  }

  const used = new Set(
    db.prepare("SELECT username FROM access_codes WHERE username IS NOT NULL").all()
      .map(r => (r.username || '').toUpperCase())
  );
  const pool = PARTICIPANT_NAMES.filter(name => !used.has(name.toUpperCase()));
  if (pool.length < n) {
    return res.status(409).json({
      error: `Only ${pool.length} unused names remain. Request ${pool.length} or fewer.`,
      available: pool.length
    });
  }

  const insertParticipant = db.prepare(
    "INSERT INTO access_codes (code, label, role, username, password_hash, icon) VALUES (?, ?, 'participant', ?, ?, ?)"
  );
  const created = [];
  for (let i = 0; i < n; i++) {
    // Usernames/passwords cannot contain spaces — normalize to underscores.
    const name = pool.splice(Math.floor(Math.random() * pool.length), 1)[0].replace(/\s+/g, '_');
    const icon = randomParticipantIcon();
    try {
      insertParticipant.run(name.toUpperCase(), name, name, await bcrypt.hash(name, 10), icon);
      created.push({ name, password: name, icon });
    } catch {
      created.push({ name, password: name, error: 'already exists' });
    }
  }
  res.json({ ok: true, created, count: created.length });
});

router.delete('/codes', requireAdmin, (req, res) => {
  db.transaction(() => {
    db.prepare("DELETE FROM access_codes WHERE role != 'admin'").run();
    db.prepare('DELETE FROM challenge_completions').run();
    db.prepare('DELETE FROM challenge_attempts').run();
    db.prepare('DELETE FROM hint_usage').run();
  })();
  res.json({ ok: true });
});

router.delete('/codes/:code', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  db.transaction(() => {
    deleteParticipantData(code);
    db.prepare("DELETE FROM access_codes WHERE code = ? AND role != 'admin'").run(code);
  })();
  res.json({ ok: true });
});

router.delete('/admins/all', requireAdmin, (req, res) => {
  db.prepare("DELETE FROM access_codes WHERE role = 'admin' AND code != ?").run(DEFAULT_ADMIN);
  res.json({ ok: true });
});

router.delete('/admins/:code', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  if (code === DEFAULT_ADMIN) return res.status(400).json({ error: 'Cannot delete the default admin account' });
  const count = db.prepare("SELECT COUNT(*) as n FROM access_codes WHERE role = 'admin'").get().n;
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  db.prepare("DELETE FROM access_codes WHERE code = ? AND role = 'admin'").run(code);
  res.json({ ok: true });
});

// ── Registration Code ─────────────────────────────────────────────────────────

router.get('/registration-code', requireAdmin, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_code'").get();
  res.json({ registration_code: row?.value || null });
});

router.post('/registration-code', requireAdmin, (req, res) => {
  const { registration_code } = req.body;
  if (!registration_code || registration_code.trim().length < 4) {
    return res.status(400).json({ error: 'Registration code must be at least 4 characters' });
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('registration_code', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(registration_code.trim());
  res.json({ ok: true, registration_code: registration_code.trim() });
});


// ── Registration Open/Closed ──────────────────────────────────────────────────

router.get('/registration-open', requireAdmin, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_open'").get();
  res.json({ open: row?.value === 'true' });
});

router.post('/registration-open', requireAdmin, (req, res) => {
  const { open } = req.body;
  db.prepare("INSERT INTO settings (key, value) VALUES ('registration_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(open ? 'true' : 'false');
  res.json({ ok: true, open: !!open });
});


// ── Workshop name ─────────────────────────────────────────
const MAX_WORKSHOP_NAME = 60;

router.put('/settings/workshop-name', requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Workshop name is required' });
  if (name.length > MAX_WORKSHOP_NAME) return res.status(400).json({ error: `Workshop name must be at most ${MAX_WORKSHOP_NAME} characters` });
  setSetting('workshop_name', name);
  res.json({ ok: true, name });
});

// ── Resets ──────────────────────────────

router.post('/codes/reset-challenges', requireAdmin, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM challenge_completions').run();
    db.prepare('DELETE FROM challenge_attempts').run();
    db.prepare('DELETE FROM hint_usage').run();
  })();
  res.json({ ok: true });
});


// ── Challenge template ────────────────────────────────────
// Replaces all challenges with the CSV bundled in templates/.
router.post('/challenges/sync-template', requireAdmin, (req, res) => {
  let rows;
  try {
    rows = parseCsv(fs.readFileSync(TEMPLATE_CSV, 'utf8'));
  } catch (e) {
    return res.status(404).json({ error: 'Template not found: templates/challenges.csv' });
  }
  const insert = db.prepare('INSERT INTO challenges (order_num, title, description, flag, points, hint, visible) VALUES (?, ?, ?, ?, ?, ?, ?)');
  let imported = 0;
  db.transaction(() => {
    db.prepare('DELETE FROM challenge_completions').run();
    db.prepare('DELETE FROM challenge_attempts').run();
    db.prepare('DELETE FROM hint_usage').run();
    db.prepare('DELETE FROM challenges').run();
    for (const row of rows) {
      const c = challengeFromCsvRow(row);
      if (!c) continue;
      imported++;
      insert.run(imported, c.title, c.description, c.flag, c.points, c.hint, c.visible);
    }
  })();
  res.json({ ok: true, imported, source: 'templates/challenges.csv' });
});

// ── Factory reset / clear ─────────────────────────────────

function addStep(steps, label, status, details = '') {
  steps.push({ label, status, details, meta: {} });
}

router.post('/settings/factory-reset', requireAdmin, (req, res) => {
  const errors = [];
  const steps = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  try {
    const deleted = db.prepare("DELETE FROM access_codes WHERE role != 'admin'").run().changes;
    addStep(steps, 'Delete participants', 'success', `${plural(deleted, 'participant')} deleted.`);
  } catch (e) {
    errors.push('Participant cleanup: ' + e.message);
    addStep(steps, 'Delete participants', 'error', e.message);
  }

  try {
    const completions = db.prepare('DELETE FROM challenge_completions').run().changes;
    db.prepare('DELETE FROM challenge_attempts').run();
    db.prepare('DELETE FROM hint_usage').run();
    const challenges = db.prepare('DELETE FROM challenges').run().changes;
    try { db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('challenges', 'challenge_completions', 'challenge_attempts', 'hint_usage')").run(); } catch {}
    addStep(steps, 'Delete challenges', 'success', `${plural(challenges, 'challenge')} and ${plural(completions, 'completion record')} deleted.`);
  } catch (e) {
    errors.push('Challenges cleanup: ' + e.message);
    addStep(steps, 'Delete challenges', 'error', e.message);
  }

  try {
    const defaults = [
      ['max_retries', '5'],
      ['ctf_state', 'stop'],
      ['ctf_timer_total', String(DEFAULT_CTF_TIMER_SECONDS)],
      ['ctf_timer_remaining', String(DEFAULT_CTF_TIMER_SECONDS)],
      ['ctf_timer_started_at', ''],
      ['registration_code', DEFAULT_REGISTRATION_CODE],
      ['registration_open', 'false'],
      ['leaderboard_visible', 'true'],
      ['workshop_name', DEFAULT_WORKSHOP_NAME],
    ];
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of defaults) upsert.run(key, value);
    invalidateSettings();
    addStep(steps, 'Reset portal settings', 'success', 'Workshop name, CTF state, timer, retries, registration and leaderboard reset to defaults.');
  } catch (e) {
    errors.push('Settings reset: ' + e.message);
    addStep(steps, 'Reset portal settings', 'error', e.message);
  }

  try {
    const deletedAdmins = db.prepare("DELETE FROM access_codes WHERE role = 'admin' AND UPPER(TRIM(code)) != ?").run(DEFAULT_ADMIN).changes;
    const token = crypto.randomBytes(24).toString('hex');
    const defaultAdmin = db.prepare("SELECT id FROM access_codes WHERE code = ? AND role = 'admin'").get(DEFAULT_ADMIN);
    if (!defaultAdmin) {
      db.prepare("INSERT INTO access_codes (code, api_key, label, role, username, password_hash) VALUES (?, ?, 'Administrator', 'admin', ?, NULL)")
        .run(DEFAULT_ADMIN, token, DEFAULT_ADMIN);
    } else {
      // Fresh-install state: clear the password so the next login asks for a
      // new one, and rotate the API token so no old credential survives.
      db.prepare('UPDATE access_codes SET password_hash = NULL, username = ?, api_key = ? WHERE id = ?')
        .run(DEFAULT_ADMIN, token, defaultAdmin.id);
    }
    addStep(steps, 'Reset admin accounts', 'success', `${plural(deletedAdmins, 'admin account')} deleted. ${DEFAULT_ADMIN} reset — a new password will be set on next sign-in.`);
  } catch (e) {
    errors.push('Admin reset: ' + e.message);
    addStep(steps, 'Reset admin accounts', 'error', e.message);
  }

  res.json({ ok: errors.length === 0, errors, steps });
});

router.post('/settings/clear-database', requireAdmin, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM challenge_completions').run();
    db.prepare('DELETE FROM challenge_attempts').run();
    db.prepare('DELETE FROM hint_usage').run();
    db.prepare('DELETE FROM challenges').run();
    db.prepare("DELETE FROM access_codes WHERE role = 'participant'").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ctf_state', 'stop')").run();
  })();
  invalidateSettings('ctf_state');
  res.json({ ok: true });
});

// ── Demo data ─────────────────────────────────────────────
// Adds sample challenges (if missing) and 10 demo participants with varied
// progress, to preview the dashboard and leaderboard before a workshop.
router.post('/demo-data', requireAdmin, async (req, res) => {
  const demoChallenges = [
    { title: '[Demo] Warm-up', description: 'What is the name of the company behind this workshop?', flag: 'netskope', points: 25, hint: 'Look at the logo.' },
    { title: '[Demo] DNS', description: 'Which DNS record type maps a hostname to an IPv4 address?', flag: 'A', points: 50, hint: 'It is a single letter.' },
    { title: '[Demo] Ports', description: 'Which TCP port does HTTPS use by default?', flag: '443', points: 50, hint: 'HTTP uses 80.' },
    { title: '[Demo] Certificates', description: 'Which file extension is commonly used for a PEM-encoded certificate?', flag: '.pem', points: 50, hint: 'It is in the question.' },
    { title: '[Demo] Your name', description: 'Type your own username.', flag: '%username', points: 25, hint: 'Look at the bottom-left corner.' },
  ];
  const existingTitles = new Set(db.prepare('SELECT title FROM challenges').all().map(r => r.title));
  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM challenges').get().m || 0;
  const insertChallenge = db.prepare('INSERT INTO challenges (title, description, flag, points, hint, visible, order_num) VALUES (?, ?, ?, ?, ?, 1, ?)');
  let createdChallenges = 0;
  demoChallenges.forEach(ch => {
    if (existingTitles.has(ch.title)) return;
    createdChallenges++;
    insertChallenge.run(ch.title, ch.description, ch.flag, ch.points, ch.hint, maxOrder + createdChallenges);
  });

  const challenges = db.prepare('SELECT id, points, hint FROM challenges WHERE visible = 1 ORDER BY order_num ASC, id ASC').all();
  const n = challenges.length;
  // [completions, failed attempts, hints] per demo participant
  const demoConfig = [
    [n, 2, 1], [n - 1, 0, 2], [n - 1, 5, 0], [n - 2, 1, 1], [n - 2, 3, 2],
    [Math.floor(n * 0.6), 0, 1], [Math.floor(n * 0.5), 2, 0], [Math.floor(n * 0.4), 4, 1],
    [Math.floor(n * 0.3), 0, 1], [0, 1, 0],
  ].map(([c, f, h]) => [Math.max(0, c), f, h]);
  const codes = demoConfig.map((_, i) => `DEMO-${String(i + 1).padStart(2, '0')}`);
  // Hash outside the transaction to avoid holding the write lock during bcrypt.
  const hashes = await Promise.all(codes.map(code => bcrypt.hash(code, 10)));

  const upsert = db.prepare(`
    INSERT INTO access_codes (code, label, role, icon, username, password_hash) VALUES (?, ?, 'participant', ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET icon = excluded.icon, username = excluded.username, password_hash = excluded.password_hash
  `);
  const insertCompletion = db.prepare('INSERT OR IGNORE INTO challenge_completions (participant_code, challenge_id, points_earned) VALUES (?, ?, ?)');
  const insertAttempt = db.prepare('INSERT INTO challenge_attempts (participant_code, challenge_id, is_hint, answer) VALUES (?, ?, ?, ?)');
  // Sample wrong answers, so Participants → Detail shows what was submitted.
  const demoWrongAnswers = ['80', 'no idea', '8080', 'firewall', '42'];
  const insertHint = db.prepare('INSERT OR IGNORE INTO hint_usage (participant_code, challenge_id) VALUES (?, ?)');

  db.transaction(() => {
    codes.forEach((code, i) => {
      upsert.run(code, `Demo Participant ${i + 1}`, randomParticipantIcon(), code, hashes[i]);
      deleteParticipantData(code);
      const [toComplete, toFail, hintsWanted] = demoConfig[i];
      const done = challenges.slice(0, toComplete);
      done.forEach(ch => insertCompletion.run(code, ch.id, ch.points));
      done.filter(ch => ch.hint).slice(0, hintsWanted).forEach(ch => {
        insertHint.run(code, ch.id);
        insertAttempt.run(code, ch.id, 1, null);
      });
      const failTarget = (challenges[toComplete] || challenges[0])?.id;
      if (failTarget) for (let a = 0; a < toFail; a++) insertAttempt.run(code, failTarget, 0, demoWrongAnswers[(i + a) % demoWrongAnswers.length]);
    });
  })();

  res.json({ ok: true, participants: codes, challenges_created: createdChallenges });
});

// ── About ─────────────────────────────────────────────────
router.get('/changelog', requireAdmin, (req, res) => {
  try {
    res.json({ content: fs.readFileSync(path.join(__dirname, '../../CHANGELOG.md'), 'utf8') });
  } catch {
    res.status(404).json({ error: 'CHANGELOG.md not found' });
  }
});

router.get('/version', requireAdmin, (req, res) => {
  res.json({ version: 'v' + require('../../package.json').version });
});

module.exports = router;
