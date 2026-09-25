const express = require('express');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { getSetting, setSetting } = require('../settings-cache');
const { parseCsv, challengeFromCsvRow, CSV_HEADER, challengeToCsvLine } = require('../challenge-csv');

const router = express.Router();

// ── CTF State ─────────────────────────────────────────────

router.get('/telemetry', (req, res) => {
  const participants = db.prepare("SELECT COUNT(*) as c FROM access_codes WHERE role = 'participant'").get().c;
  const challenges = db.prepare("SELECT COUNT(*) as c FROM challenges WHERE visible = 1").get().c;

  const rankingRows = db.prepare(`
    SELECT
      COALESCE(ac.username, cc.participant_code) as name,
      COALESCE(SUM(cc.points_earned), 0) - 5 * COALESCE((
        SELECT COUNT(*) FROM challenge_attempts ca WHERE ca.participant_code = cc.participant_code
      ), 0) as pts
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id AND c.visible = 1
    LEFT JOIN access_codes ac ON ac.code = cc.participant_code
    GROUP BY cc.participant_code
    ORDER BY pts DESC
    LIMIT 3
  `).all();

  const ranking = rankingRows.filter(r => r.pts > 0).map((r, i) => ({ pos: i + 1, name: r.name, pts: r.pts }));

  res.json({
    participants,
    challenges,
    ranking
  });
});

// Public: the login screen shows the workshop name before anyone signs in.
router.get('/workshop', (req, res) => {
  res.json({ name: getSetting('workshop_name') || '' });
});

router.get('/registration-status', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_open'").get();
  res.json({ open: row?.value === '1' || row?.value === 'true' });
});

// getSetting / setSetting provided by settings-cache (with 5 s TTL + write invalidation)

// ── Answer matching ──
// %username in a flag is replaced by the participant's username, so one
// challenge can expect a different answer per participant.
function expectedFlag(flag, username) {
  return String(flag || '').replace(/%username/gi, username || '');
}

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker ("YYYY-MM-DD HH:MM:SS");
// parse it as UTC regardless of the container's timezone.
function sqliteTimeMs(value) {
  return new Date(String(value).replace(' ', 'T') + 'Z').getTime();
}

const MAX_ANSWER_LENGTH = 500;

// Marks a participant's failed answers on a challenge as already counted
// towards a cooldown (see challenge_attempts.retry_cleared in db.js).
const clearRetries = db.prepare('UPDATE challenge_attempts SET retry_cleared = 1 WHERE participant_code = ? AND challenge_id = ? AND is_hint = 0 AND retry_cleared = 0');

// Case-insensitive, ignoring surrounding and repeated whitespace.
function normalizeAnswer(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// ── CTF countdown timer ───────────────────────────────────
// Server-authoritative, pausable countdown. The clock only ticks while the CTF
// state is 'run'; Stop/Standby freeze it. Effective remaining is computed from
// absolute timestamps so it survives restarts and stays identical for everyone.
const MAX_TIMER_SECONDS = 10 * 3600; // 10 hours

function getTimerState() {
  const total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
  let remaining = parseFloat(getSetting('ctf_timer_remaining'));
  if (isNaN(remaining)) remaining = total;
  const startedAt = parseInt(getSetting('ctf_timer_started_at') || '0', 10) || 0;
  const state = getSetting('ctf_state') || 'stop';
  const running = startedAt > 0 && state === 'run';
  let eff = running ? remaining - (Date.now() - startedAt) / 1000 : remaining;
  if (eff <= 0) {
    eff = 0;
    if (running) {
      // Lazy expiration: freeze at 0 and auto-pass to Standby.
      setSetting('ctf_timer_remaining', '0');
      setSetting('ctf_timer_started_at', '');
      setSetting('ctf_state', 'standby');
      return { total, remaining: 0, running: false, state: 'standby', expired: true };
    }
  }
  return { total, remaining: Math.round(eff), running, state, expired: false };
}

// Re-anchor the timer whenever the CTF state changes (run = clock ticking).
function applyStateToTimer(newState) {
  const total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
  let remaining = parseFloat(getSetting('ctf_timer_remaining'));
  if (isNaN(remaining)) remaining = total;
  const startedAt = parseInt(getSetting('ctf_timer_started_at') || '0', 10) || 0;
  let eff = (startedAt > 0) ? remaining - (Date.now() - startedAt) / 1000 : remaining;
  if (eff < 0) eff = 0;
  setSetting('ctf_timer_remaining', String(eff));
  setSetting('ctf_timer_started_at', (newState === 'run' && total > 0 && eff > 0) ? String(Date.now()) : '');
}

router.get('/ctf-state', (req, res) => {
  const t = getTimerState();
  res.json({ state: t.state, timer: { total: t.total, remaining: t.remaining, running: t.running, expired: t.expired } });
});

router.post('/ctf-state', requireAdmin, (req, res) => {
  const { state } = req.body;
  if (!['stop', 'standby', 'run'].includes(state)) return res.status(400).json({ error: 'Invalid state' });
  setSetting('ctf_state', state);
  applyStateToTimer(state);
  res.json({ ok: true, state });
});


router.post('/timer', requireAdmin, (req, res) => {
  const { action } = req.body;
  const state = getSetting('ctf_state') || 'stop';
  if (action === 'set') {
    let secs = parseInt(req.body.seconds, 10);
    if (isNaN(secs) || secs < 0) return res.status(400).json({ error: 'Invalid seconds' });
    secs = Math.min(secs, MAX_TIMER_SECONDS);
    setSetting('ctf_timer_total', String(secs));
    setSetting('ctf_timer_remaining', String(secs));
    setSetting('ctf_timer_started_at', (secs > 0 && state === 'run') ? String(Date.now()) : '');
  } else if (action === 'reset') {
    const total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
    setSetting('ctf_timer_remaining', String(total));
    setSetting('ctf_timer_started_at', (total > 0 && state === 'run') ? String(Date.now()) : '');
  } else if (action === 'adjust') {
    const delta = parseInt(req.body.delta, 10) || 0;
    let newRemaining = getTimerState().remaining + delta;
    newRemaining = Math.max(0, Math.min(newRemaining, MAX_TIMER_SECONDS));
    let total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
    if (newRemaining > total) { total = newRemaining; setSetting('ctf_timer_total', String(total)); }
    setSetting('ctf_timer_remaining', String(newRemaining));
    setSetting('ctf_timer_started_at', (newRemaining > 0 && state === 'run') ? String(Date.now()) : '');
  } else if (action === 'clear') {
    setSetting('ctf_timer_total', '0');
    setSetting('ctf_timer_remaining', '0');
    setSetting('ctf_timer_started_at', '');
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
  res.json(getTimerState());
});

// Leaderboard visibility for participants (admins always see it). Default: visible.
function isLeaderboardVisible() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'leaderboard_visible'").get();
  return row?.value !== 'false' && row?.value !== '0'; // missing => visible
}

router.get('/leaderboard-visible', (req, res) => {
  res.json({ visible: isLeaderboardVisible() });
});

router.post('/leaderboard-visible', requireAdmin, (req, res) => {
  const { visible } = req.body;
  db.prepare("INSERT INTO settings (key, value) VALUES ('leaderboard_visible', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(visible ? 'true' : 'false');
  res.json({ ok: true, visible: !!visible });
});

// ── Admin: CRUD ───────────────────────────────────────────

router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM challenges ORDER BY order_num ASC, id ASC').all();
  res.json(rows);
});

function challengeFields(body) {
  return {
    title: String(body.title || '').trim(),
    description: body.description || '',
    flag: String(body.flag || '').trim() || null,
    points: Math.max(0, parseInt(body.points, 10) || 50),
    hint: String(body.hint || '').trim() || null,
    visible: body.visible ? 1 : 0,
  };
}

router.post('/', requireAdmin, (req, res) => {
  const c = challengeFields(req.body);
  if (!c.title) return res.status(400).json({ error: 'Title required' });
  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM challenges').get().m || 0;
  const result = db.prepare(`
    INSERT INTO challenges (title, description, flag, points, hint, visible, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(c.title, c.description, c.flag, c.points, c.hint, c.visible, req.body.order_num ?? maxOrder + 1);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', requireAdmin, (req, res) => {
  const current = db.prepare('SELECT order_num FROM challenges WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Challenge not found' });
  const c = challengeFields(req.body);
  if (!c.title) return res.status(400).json({ error: 'Title required' });
  db.prepare(`
    UPDATE challenges SET title=?, description=?, flag=?, points=?, hint=?, visible=?, order_num=?
    WHERE id=?
  `).run(c.title, c.description, c.flag, c.points, c.hint, c.visible, req.body.order_num ?? current.order_num, req.params.id);
  res.json({ ok: true });
});

router.post('/reorder', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const update = db.prepare('UPDATE challenges SET order_num = ? WHERE id = ?');
  const tx = db.transaction(() => ids.forEach((id, i) => update.run(i + 1, id)));
  tx();
  res.json({ ok: true });
});

router.delete('/all', requireAdmin, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM challenge_completions').run();
    db.prepare('DELETE FROM challenge_attempts').run();
    db.prepare('DELETE FROM hint_usage').run();
    db.prepare('DELETE FROM challenges').run();
  })();
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM challenge_completions WHERE challenge_id = ?').run(req.params.id);
    db.prepare('DELETE FROM challenge_attempts WHERE challenge_id = ?').run(req.params.id);
    db.prepare('DELETE FROM hint_usage WHERE challenge_id = ?').run(req.params.id);
    db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
});

// Export CSV
router.get('/export', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM challenges ORDER BY order_num ASC, id ASC').all();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="challenges.csv"');
  res.send([CSV_HEADER, ...rows.map(challengeToCsvLine)].join('\n'));
});

// Import CSV (appends to the existing challenges)
router.post('/import', requireAdmin, (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'No CSV provided' });
  const rows = parseCsv(csv);
  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM challenges').get().m || 0;
  const insert = db.prepare(`
    INSERT INTO challenges (order_num, title, description, flag, points, hint, visible)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  db.transaction(() => {
    for (const row of rows) {
      const c = challengeFromCsvRow(row);
      if (!c) continue;
      imported++;
      insert.run(maxOrder + imported, c.title, c.description, c.flag, c.points, c.hint, c.visible);
    }
  })();
  res.json({ ok: true, imported });
});

// Admin: completions detail for a participant
router.get('/participants/:code/completions', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  const completions = db.prepare(`
    SELECT c.id, c.title, c.order_num, cc.completed_at as ts, cc.points_earned, 'success' as result
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id
    WHERE cc.participant_code = ?
  `).all(code);
  const failed = db.prepare(`
    SELECT c.id, c.title, c.order_num, ca.attempted_at as ts, -5 as points_earned, 'fail' as result, ca.answer, ca.id as seq
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    WHERE ca.participant_code = ? AND ca.is_hint = 0
  `).all(code);
  const hints = db.prepare(`
    SELECT c.id, c.title, c.order_num, hu.used_at as ts, -5 as points_earned, 'hint' as result
    FROM hint_usage hu
    JOIN challenges c ON c.id = hu.challenge_id
    WHERE hu.participant_code = ?
  `).all(code);
  // Timestamps have 1 s resolution: break ties by insertion order.
  const history = [...completions, ...failed, ...hints]
    .sort((a, b) => (a.ts === b.ts ? (a.seq || 0) - (b.seq || 0) : (a.ts > b.ts ? 1 : -1)));
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  const allAttempts = db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ?').get(code).n;
  const totalPoints = completions.reduce((s, c) => s + (c.points_earned || 0), 0) - allAttempts * 5;
  // Per-challenge summary for the sidebar
  const allChallenges = db.prepare('SELECT id, title, order_num, points, hint FROM challenges WHERE visible = 1 ORDER BY order_num ASC, id ASC').all();
  const completedIds = new Set(completions.map(c => c.id));
  const hintUsedIds = new Set(hints.map(h => h.id));
  const failedCountMap = {};
  failed.forEach(f => { failedCountMap[f.id] = (failedCountMap[f.id] || 0) + 1; });
  const challenges = allChallenges.map(c => ({
    id: c.id,
    title: c.title,
    order_num: c.order_num,
    points: c.points,
    has_hint: !!(c.hint && c.hint.trim()),
    completed: completedIds.has(c.id),
    hint_used: hintUsedIds.has(c.id),
    failed_attempts: failedCountMap[c.id] || 0,
    points_earned: completedIds.has(c.id) ? (completions.find(x => x.id === c.id)?.points_earned ?? c.points) : null,
  }));
  res.json({ history, total, total_points: totalPoints, challenges });
});

// Reset completions for a participant
router.post('/participants/:code/reset', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  db.prepare('DELETE FROM challenge_completions WHERE participant_code = ?').run(code);
  db.prepare('DELETE FROM challenge_attempts WHERE participant_code = ?').run(code);
  db.prepare('DELETE FROM hint_usage WHERE participant_code = ?').run(code);
  res.json({ ok: true });
});


// ── Admin: leaderboard ────────────────────────────────────

router.get('/leaderboard', requireAuth, (req, res) => {
  // Hidden from participants when the instructor has disabled it; admins always see it.
  if (req.user.role !== 'admin' && !isLeaderboardVisible()) {
    return res.json({ total: 0, rows: [], hidden: true });
  }
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  // Rank every participant (not only those with completions) so the leaderboard
  // is a true full ranking — participants with no completions appear at the
  // bottom with their penalty-adjusted score.
  const rows = db.prepare(`
    SELECT
      ac.code AS participant_code,
      ac.icon,
      COUNT(cc.id) AS completed,
      COALESCE(SUM(cc.points_earned), 0) - 5 * COALESCE((
        SELECT COUNT(*) FROM challenge_attempts ca WHERE ca.participant_code = ac.code
      ), 0) AS total_points
    FROM access_codes ac
    LEFT JOIN challenge_completions cc
      ON cc.participant_code = ac.code
      AND cc.challenge_id IN (SELECT id FROM challenges WHERE visible = 1)
    WHERE ac.role != 'admin'
    GROUP BY ac.code
    ORDER BY total_points DESC, completed DESC, MIN(cc.completed_at) ASC
    LIMIT 20
  `).all();
  res.json({ total, rows });
});

router.get('/podium', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  const rows = db.prepare(`
    SELECT
      cc.participant_code,
      ac.icon,
      COUNT(cc.id) as completed,
      COALESCE(SUM(cc.points_earned), 0) - 5 * COALESCE((
        SELECT COUNT(*) FROM challenge_attempts ca WHERE ca.participant_code = cc.participant_code
      ), 0) as total_points
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id AND c.visible = 1
    LEFT JOIN access_codes ac ON ac.code = cc.participant_code
    GROUP BY cc.participant_code
    ORDER BY total_points DESC, MIN(cc.completed_at) ASC
    LIMIT 3
  `).all();
  res.json({ total, rows });
});

// ── Participant: history and challenges ─

router.get('/participant/history', requireAuth, (req, res) => {
  const code = req.user.code;
  const completions = db.prepare(`
    SELECT c.title, c.order_num, cc.completed_at as ts, cc.points_earned, 'success' as result
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id
    WHERE cc.participant_code = ?
  `).all(code);
  const failed = db.prepare(`
    SELECT c.title, c.order_num, ca.attempted_at as ts, -5 as points_earned, 'fail' as result
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    WHERE ca.participant_code = ? AND ca.is_hint = 0
  `).all(code);
  const hints = db.prepare(`
    SELECT c.title, c.order_num, hu.used_at as ts, -5 as points_earned, 'hint' as result
    FROM hint_usage hu
    JOIN challenges c ON c.id = hu.challenge_id
    WHERE hu.participant_code = ?
  `).all(code);
  const history = [...completions, ...failed, ...hints].sort((a, b) => (a.ts > b.ts ? 1 : -1));
  const allAttempts = db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ?').get(code).n;
  const totalPoints = completions.reduce((s, c) => s + (c.points_earned || 0), 0) - allAttempts * 5;
  const completedCount = completions.length;
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  const hintsCount = hints.length;
  const failedCount = failed.length;
  res.json({ history, total_points: totalPoints, completed: completedCount, total, hints_used: hintsCount, failed_attempts: failedCount });
});

router.post('/participant/:id/hint', requireAuth, (req, res) => {
  const ctfState = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get()?.value || 'stop';
  if (ctfState !== 'run') return res.status(403).json({ error: 'ctf_not_running', state: ctfState });
  const code = req.user.code;
  const challengeId = parseInt(req.params.id);
  const challenge = db.prepare('SELECT id, hint FROM challenges WHERE id = ? AND visible = 1').get(challengeId);
  if (!challenge || !challenge.hint) return res.status(404).json({ error: 'No hint available' });
  const alreadyUsed = db.prepare('SELECT id FROM hint_usage WHERE participant_code = ? AND challenge_id = ?').get(code, challengeId);
  if (alreadyUsed) return res.json({ hint: challenge.hint, already_used: true });
  // First use: record and apply -5 penalty
  db.prepare('INSERT OR IGNORE INTO hint_usage (participant_code, challenge_id) VALUES (?, ?)').run(code, challengeId);
  db.prepare('INSERT INTO challenge_attempts (participant_code, challenge_id, is_hint) VALUES (?, ?, 1)').run(code, challengeId);
  res.json({ hint: challenge.hint, already_used: false });
});

router.get('/participant', requireAuth, (req, res) => {
  const code = req.user.code;
  const ctfStateRow = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get();
  const ctfState = ctfStateRow?.value || 'stop';
  if (ctfState === 'stop') {
    return res.json({ ctf_state: 'stop', challenges: [], total_points: 0, attempt_count: 0, max_retries: null });
  }
  const challenges = db.prepare('SELECT * FROM challenges WHERE visible = 1 ORDER BY order_num ASC, id ASC').all();
  const completions = db.prepare('SELECT challenge_id, completed_at, points_earned FROM challenge_completions WHERE participant_code = ?').all(code);
  const completedMap = Object.fromEntries(completions.map(c => [c.challenge_id, { completed_at: c.completed_at, points_earned: c.points_earned }]));
  const attemptCount = db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ?').get(code).n;
  const totalPointsEarned = completions.reduce((sum, c) => sum + (c.points_earned || 0), 0);
  const totalPoints = totalPointsEarned - attemptCount * 5;
  const maxRetries = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'max_retries'").get()?.value) || 0;
  const COOLDOWN_MS = 5 * 60 * 1000;
  const attemptsPerChallenge = db.prepare(
    'SELECT challenge_id, COUNT(*) as n, MAX(attempted_at) as last_at FROM challenge_attempts WHERE participant_code = ? AND is_hint = 0 AND retry_cleared = 0 GROUP BY challenge_id'
  ).all(code);
  const attemptsMap = Object.fromEntries(attemptsPerChallenge.map(r => [r.challenge_id, { n: r.n, last_at: r.last_at }]));

  // Cooldown expired: the failed answers stop counting against the retry
  // limit, but keep their penalty and stay visible to the instructor.
  for (const [challengeId, info] of Object.entries(attemptsMap)) {
    if (maxRetries > 0 && info.n >= maxRetries) {
      const elapsed = Date.now() - sqliteTimeMs(info.last_at);
      if (elapsed >= COOLDOWN_MS) {
        clearRetries.run(code, parseInt(challengeId));
        attemptsMap[challengeId] = { n: 0, last_at: null };
      }
    }
  }

  const hintUsed = new Set(
    db.prepare('SELECT challenge_id FROM hint_usage WHERE participant_code = ?').all(code).map(r => r.challenge_id)
  );
  res.json({
    ctf_state: ctfState,
    challenges: challenges.map(c => {
      const info = attemptsMap[c.id] || { n: 0, last_at: null };
      const failed = info.n;
      const inCooldown = maxRetries > 0 && !completedMap[c.id] && failed >= maxRetries;
      const cooldown_until = inCooldown ? new Date(sqliteTimeMs(info.last_at) + COOLDOWN_MS).toISOString() : null;
      const retries_left = maxRetries > 0 ? Math.max(0, maxRetries - failed) : null;
      return {
        id: c.id,
        order_num: c.order_num,
        title: c.title,
        description: c.description,
        points: c.points,
        // Never send the flag (or an unused hint) to the participant.
        hint: hintUsed.has(c.id) ? c.hint : undefined,
        has_hint: !!(c.hint && c.hint.trim()),
        hint_used: hintUsed.has(c.id),
        completed: !!completedMap[c.id],
        completed_at: completedMap[c.id]?.completed_at || null,
        points_earned: completedMap[c.id]?.points_earned || null,
        failed_attempts: failed,
        retries_left,
        locked: inCooldown,
        cooldown_until,
      };
    }),
    total_points: totalPoints,
    attempt_count: attemptCount,
    max_retries: maxRetries || null,
  });
});

// Participant: submit an answer for a challenge
router.post('/participant/:id/check', requireAuth, (req, res) => {
  const ctfState = getSetting('ctf_state') || 'stop';
  if (ctfState !== 'run') return res.status(403).json({ error: 'ctf_not_running', state: ctfState });

  const code = req.user.code;
  const challengeId = parseInt(req.params.id);

  const existing = db.prepare('SELECT id FROM challenge_completions WHERE participant_code = ? AND challenge_id = ?').get(code, challengeId);
  if (existing) return res.json({ found: true, already: true });

  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ? AND visible = 1').get(challengeId);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
  if (!challenge.flag) return res.status(400).json({ error: 'Challenge has no flag configured' });

  const submitted = String(req.body?.participant_text || '').trim().slice(0, MAX_ANSWER_LENGTH);
  const answer = normalizeAnswer(submitted);
  if (!answer) return res.status(400).json({ error: 'Answer required' });

  // Max retries with cooldown (per challenge per participant)
  const maxRetries = parseInt(getSetting('max_retries')) || 0;
  const COOLDOWN_MS = 5 * 60 * 1000;
  const countFailed = db.prepare('SELECT COUNT(*) as n, MAX(attempted_at) as last_at FROM challenge_attempts WHERE participant_code = ? AND challenge_id = ? AND is_hint = 0 AND retry_cleared = 0');
  if (maxRetries > 0) {
    const attRow = countFailed.get(code, challengeId);
    if (attRow.n >= maxRetries) {
      const lastAt = sqliteTimeMs(attRow.last_at);
      if (Date.now() - lastAt < COOLDOWN_MS) {
        const cooldown_until = new Date(lastAt + COOLDOWN_MS).toISOString();
        return res.status(429).json({ error: 'cooldown', retries_left: 0, cooldown_until, max_retries: maxRetries });
      }
      // Cooldown expired: start a fresh retry window (penalties are kept)
      clearRetries.run(code, challengeId);
    }
  }

  const found = answer === normalizeAnswer(expectedFlag(challenge.flag, req.user.username));

  if (found) {
    db.prepare('INSERT OR IGNORE INTO challenge_completions (participant_code, challenge_id, points_earned) VALUES (?, ?, ?)')
      .run(code, challengeId, challenge.points);
    return res.json({ found: true, points_earned: challenge.points });
  }

  // Keep what the participant typed so the instructor can review wrong answers.
  db.prepare('INSERT INTO challenge_attempts (participant_code, challenge_id, answer) VALUES (?, ?, ?)').run(code, challengeId, submitted);
  const failed = maxRetries > 0 ? countFailed.get(code, challengeId).n : 0;
  const inCooldown = maxRetries > 0 && failed >= maxRetries;
  res.json({
    found: false,
    penalty: -5,
    retries_left: maxRetries > 0 ? Math.max(0, maxRetries - failed) : null,
    cooldown_until: inCooldown ? new Date(Date.now() + COOLDOWN_MS).toISOString() : null,
    max_retries: maxRetries || null,
  });
});

module.exports = router;
