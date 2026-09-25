/* ── State ── */
let token = null;
let userInfo = null;
let _loadingAdminCodes = false;
let _loadingDashboard = false;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved lang
  if (typeof updateLangPicker === 'function') updateLangPicker(currentLang);
  applyTranslations();

  loadWorkshopName();

  // Load CTF status on login screen
  fetch('/api/challenges/ctf-state').then(r => r.json()).then(data => {
    const el = document.getElementById('login-ctf-status');
    if (!el) return;
    const labels = { stop: 'Stopped', standby: 'Standby', run: 'Running' };
    const colors = { stop: '#ef4444', standby: '#f59e0b', run: '#22c55e' };
    const state = data.state || 'stop';
    el.textContent = labels[state] || state;
    el.style.color = colors[state] || '';
  }).catch(() => {});

  // Load live telemetry on login screen
  fetch('/api/challenges/telemetry').then(r => r.json()).then(d => {
    const now = new Date();
    const ts = now.toTimeString().slice(0,8);
    const el = id => document.getElementById(id);
    if (el('telemetry-ts')) el('telemetry-ts').textContent = ts;

    if (el('telemetry-participants')) el('telemetry-participants').textContent = `${d.participants} registered`;
    if (el('telemetry-challenges')) el('telemetry-challenges').textContent = `${d.challenges} active`;

    if (el('telemetry-top')) {
      const medals = ['1st', '2nd', '3rd'];
      if (d.ranking && d.ranking.length > 0) {
        el('telemetry-top').innerHTML = d.ranking
          .map(r => `<span class="telemetry-rank-entry"><span class="telemetry-rank-pos">${medals[r.pos - 1]}</span><span class="telemetry-rank-name">${r.name}</span><span class="telemetry-rank-pts">${r.pts} pts</span></span>`)
          .join('');
        if (el('telemetry-top-dot')) el('telemetry-top-dot').style.opacity = '1';
      } else {
        el('telemetry-top').textContent = 'none yet';
        if (el('telemetry-top-dot')) el('telemetry-top-dot').style.opacity = '0';
      }
    }
  }).catch(() => {});

  // Load registration status on login screen
  fetch('/api/challenges/registration-status').then(r => r.json()).then(data => {
    const el = document.getElementById('login-reg-status');
    if (!el) return;
    el.textContent = data.open ? 'Open' : 'Closed';
    el.style.color = data.open ? '#22c55e' : '#ef4444';
  }).catch(() => {});

  // Apply saved theme
  const savedTheme = localStorage.getItem('cd_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateAdminLogo(savedTheme);

  // Check existing session
  token = localStorage.getItem('cd_token');
  if (token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      const payload = JSON.parse(json);
      if (payload.exp * 1000 > Date.now()) {
        userInfo = payload;
        enterApp();
        return;
      }
    } catch {}
    localStorage.removeItem('cd_token');
  }

  // Enter key on login/register inputs
  document.getElementById('login-password-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-username-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('reg-code-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
});

/* ── Workshop name ── */
// Configured in Global Settings; fills every element marked data-workshop-name.
function applyWorkshopName(name) {
  if (!name) return;
  document.querySelectorAll('[data-workshop-name]').forEach(el => { el.textContent = name; });
  document.title = name;
  const input = document.getElementById('workshop-name-input');
  if (input && document.activeElement !== input) input.value = name;
}

async function loadWorkshopName() {
  try {
    const res = await fetch('/api/challenges/workshop');
    applyWorkshopName((await res.json()).name);
  } catch {}
}

async function saveWorkshopName() {
  const input = document.getElementById('workshop-name-input');
  const msg = document.getElementById('workshop-name-msg');
  const name = input.value.trim();
  if (!name) { msg.textContent = 'Enter a name'; msg.style.color = 'var(--danger)'; return; }
  const res = await apiFetch('/api/admin/settings/workshop-name', { method: 'PUT', body: JSON.stringify({ name }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.textContent = data.error || `HTTP ${res.status}`; msg.style.color = 'var(--danger)'; return; }
  applyWorkshopName(data.name);
  msg.textContent = '✓ Saved';
  msg.style.color = 'var(--success)';
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

/* ── Auth ── */

function showLoginPanel() {
  document.getElementById('login-form-panel').style.display = '';
  document.getElementById('register-form-panel').style.display = 'none';
  const setupPanel = document.getElementById('admin-setup-panel');
  if (setupPanel) setupPanel.style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
}

function showRegisterPanel() {
  document.getElementById('login-form-panel').style.display = 'none';
  document.getElementById('register-form-panel').style.display = '';
  const setupPanel = document.getElementById('admin-setup-panel');
  if (setupPanel) setupPanel.style.display = 'none';
  document.getElementById('register-error').style.display = 'none';
}

async function handleLogin() {
  const username = document.getElementById('login-username-input').value.trim();
  const password = document.getElementById('login-password-input').value;
  // Only the username is required to submit: an admin doing first-login setup
  // signs in with an empty password and the backend returns setup_required.
  if (!username) return;

  const btn = document.getElementById('login-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showLoginError(data.error || t('loginError'));
      return;
    }

    // Default admin with no password yet → switch to first-login setup.
    if (data.setup_required) {
      showAdminSetupPanel(data.username || username, password);
      return;
    }

    _setSession(data);
    enterApp(true);
  } catch {
    showLoginError('Connection error. Is the server running?');
  } finally {
    btn.disabled = false;
  }
}

function showAdminSetupPanel(username, prefillPassword) {
  document.getElementById('login-form-panel').style.display = 'none';
  document.getElementById('register-form-panel').style.display = 'none';
  const panel = document.getElementById('admin-setup-panel');
  panel.style.display = '';
  document.getElementById('admin-setup-username').value = username;
  document.getElementById('admin-setup-password').value = prefillPassword || '';
  document.getElementById('admin-setup-confirm').value = '';
  document.getElementById('admin-setup-error').style.display = 'none';
  const focusEl = prefillPassword ? document.getElementById('admin-setup-confirm') : document.getElementById('admin-setup-password');
  focusEl.focus();
}

async function handleAdminSetup() {
  const username = document.getElementById('admin-setup-username').value.trim();
  const password = document.getElementById('admin-setup-password').value;
  const confirm = document.getElementById('admin-setup-confirm').value;
  const err = document.getElementById('admin-setup-error');
  err.style.color = '';

  if (password.length < 8) {
    err.textContent = t('adminSetupTooShort'); err.style.display = 'block'; return;
  }
  if (password !== confirm) {
    err.textContent = t('adminSetupMismatch'); err.style.display = 'block'; return;
  }

  const btn = document.getElementById('admin-setup-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/auth/admin-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || t('loginError'); err.style.display = 'block'; return;
    }
    _setSession(data);
    document.getElementById('admin-setup-panel').style.display = 'none';
    showLoginPanel();
    enterApp(true);
  } catch {
    err.textContent = 'Connection error. Is the server running?'; err.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-username-input').value.trim();
  const password = document.getElementById('reg-password-input').value;
  const registration_code = document.getElementById('reg-code-input').value.trim();
  if (!username || !password || !registration_code) return;
  if (username.length < 5 || username.length > 8) { showRegisterError('Username must be between 5 and 8 characters'); return; }
  if (password.length < 5 || password.length > 8) { showRegisterError('Password must be between 5 and 8 characters'); return; }

  const btn = document.getElementById('register-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, registration_code })
    });
    const data = await res.json();

    if (!res.ok) {
      showRegisterError(data.error || 'Registration failed');
      return;
    }

    // Registration successful — redirect to login
    document.getElementById('reg-username-input').value = '';
    document.getElementById('reg-password-input').value = '';
    document.getElementById('reg-code-input').value = '';
    showLoginPanel();
    const loginErr = document.getElementById('login-error');
    loginErr.textContent = `Account "${username}" created. Sign in to continue.`;
    loginErr.style.display = 'block';
    loginErr.style.color = 'var(--success)';
    document.getElementById('login-username-input').value = username;
  } catch {
    showRegisterError('Connection error. Is the server running?');
  } finally {
    btn.disabled = false;
  }
}


function _setSession(data) {
  token = data.token;
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  userInfo = JSON.parse(json);
  userInfo.icon = data.icon || null;
  userInfo.username = data.username || null;
  localStorage.setItem('cd_token', token);
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.style.color = '';
  el.textContent = msg;
  el.style.display = 'block';
}

function showRegisterError(msg) {
  const el = document.getElementById('register-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function handleLogout() {
  localStorage.removeItem('cd_token');
  token = null; userInfo = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-username-input').value = '';
  document.getElementById('login-password-input').value = '';
  document.getElementById('login-error').style.display = 'none';
  showLoginPanel();
}

/* ── App Entry ── */
function enterApp(freshLogin = false) {
  document.getElementById('login-screen').style.display = 'none';

  if (userInfo.role === 'admin') {
    document.getElementById('admin-screen').style.display = 'flex';
    updateAdminLogo(document.documentElement.getAttribute('data-theme') || 'light');
    let tab = 'dashboard';
    if (!freshLogin) {
      const savedTab = localStorage.getItem('adminTab');
      const validTabs = ['dashboard','control','codes','challenges','settings','admins','about'];
      if (savedTab && validTabs.includes(savedTab)) tab = savedTab;
    }
    adminTab(tab);
    loadAdminCodes();
    applyAdminLang(localStorage.getItem('cd_lang') || 'en');
  } else {
    document.getElementById('app').style.display = 'flex';
    setupUser();
  }
}
async function setupUser() {
  const avatarEl = document.getElementById('user-avatar');
  if (userInfo.icon && userInfo.role !== 'admin') {
    avatarEl.textContent = userInfo.icon;
    avatarEl.classList.add('user-avatar--emoji');
  } else {
    avatarEl.textContent = userInfo.code.slice(0, 2).toUpperCase();
    avatarEl.classList.remove('user-avatar--emoji');
  }
  document.getElementById('user-name').textContent = userInfo.username || userInfo.code;
  const sessionTitle = document.getElementById('participant-session-title');
  if (sessionTitle) sessionTitle.textContent = `${userInfo.username || userInfo.code} · Capture the Flag`;
  updateAdminLogo(document.documentElement.getAttribute('data-theme') || 'light');
  applyTranslations();
  showChallengeTab('list');
  await Promise.all([loadParticipantChallenges(), applyParticipantLeaderboardVisibility()]);
}
/* ── Theme ── */
function updateAdminLogo(theme) {
  const src = theme === 'light' ? '/img/netskope-logo-light.png' : '/img/netskope-logo-dark.png';
  ['adm-logo','participant-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = src;
  });
  const loginLogo = document.getElementById('login-logo-img');
  if (loginLogo) loginLogo.src = '/img/netskope-logo-dark.png';
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('cd_theme', next);
  updateAdminLogo(next);
  applyTranslations();
}

/* ── Config Panel ── */
function openPanel(type) {
  const panel = document.getElementById(`${type}-panel`);
  if (!panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  ['leaderboard-panel','instructions-panel'].forEach(id => {
    document.getElementById(id)?.classList.remove('open');
  });
  panel.classList.add('open');
  if (type === 'instructions') renderLabInstructions();
}
function closePanel() {
  document.getElementById('instructions-panel')?.classList.remove('open');
}
// Show/hide the participant leaderboard entry based on the instructor's setting.
async function applyParticipantLeaderboardVisibility() {
  const btn = document.getElementById('sidebar-leaderboard-btn');
  if (!btn) return;
  try {
    const res = await fetch('/api/challenges/leaderboard-visible');
    const data = await res.json();
    const visible = data.visible !== false;
    btn.style.display = visible ? '' : 'none';
    if (!visible) closeLeaderboardPanel();
  } catch {}
}

// ── Mobile off-canvas nav (participant) ──
function toggleMobileNav() {
  // Always show the full (non-collapsed) sidebar inside the mobile drawer
  document.querySelector('#app .sidebar')?.classList.remove('collapsed');
  document.getElementById('app')?.classList.toggle('nav-open');
}
function closeMobileNav() {
  document.getElementById('app')?.classList.remove('nav-open');
}
// ── Mobile off-canvas nav (admin) ──
function toggleAdminNav() {
  document.getElementById('admin-screen')?.classList.toggle('nav-open');
}
function closeAdminNav() {
  document.getElementById('admin-screen')?.classList.remove('nav-open');
}
document.addEventListener('DOMContentLoaded', () => {
  // Close the drawer after tapping any sidebar action
  document.querySelector('#app .sidebar')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeMobileNav();
  });
  // Admin: close drawer after tapping a nav item
  document.querySelector('#admin-screen .adm-nav')?.addEventListener('click', (e) => {
    if (e.target.closest('.adm-nav-item')) closeAdminNav();
  });
  // Reset drawer state when leaving mobile width
  window.addEventListener('resize', () => {
    if (window.innerWidth > 640) { closeMobileNav(); closeAdminNav(); }
  });
});

function toggleSidebar() {
  const sidebar = document.querySelector('#app .sidebar');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  if (expandBtn) expandBtn.style.display = 'none';
  const collapseBtn = sidebar.querySelector('.sidebar-collapse-btn');
  if (collapseBtn) collapseBtn.title = sidebar.classList.contains('collapsed') ? 'Expand sidebar' : 'Collapse sidebar';
}

/* ── Admin ── */

function adminTab(tab) {
  document.querySelectorAll('.adm-nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');
  localStorage.setItem('adminTab', tab);
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'codes') loadAdminCodes();
  if (tab === 'admins') loadAdmins();
  if (tab === 'challenges') loadChallenges();
  if (tab === 'control') { loadCTFState(); loadRegOpen(); loadRegCode(); loadLeaderboardVisible(); }
  if (tab === 'about') loadAboutVersion();
  if (tab === 'settings') loadWorkshopName();
}

const HELP_TITLES = {
  dashboard: 'Dashboard', control: 'Control Center', participants: 'Participants', challenges: 'Challenges',
  admins: 'Admins', settings: 'Global Settings', overview: 'Overview'
};

function openHelpSidebar(section) {
  document.querySelectorAll('.help-panel').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById(`help-${section}`);
  if (panel) panel.classList.add('active');
  document.getElementById('help-sidebar-title').textContent = HELP_TITLES[section] || 'Help';
  document.getElementById('help-sidebar').classList.add('open');
  document.getElementById('help-sidebar-overlay').classList.add('open');
}

function closeHelpSidebar() {
  document.getElementById('help-sidebar').classList.remove('open');
  document.getElementById('help-sidebar-overlay').classList.remove('open');
}

function _buildPodiumHtml(podData) {
  const top = podData.rows || [];
  if (!top.length) return '<div class="dash-podium-empty">No challenge completions yet.</div>';
  const slots = [top[1], top[0], top[2]];
  const ranks = [2, 1, 3];
  const medals = ['🥈', '🥇', '🥉'];
  return `<div class="dash-podium-stage">
    ${slots.map((s, i) => s ? `
      <div class="podium-slot podium-slot--${ranks[i]}">
        <div class="podium-avatar">${s.icon || escapeHtml(s.participant_code.slice(0, 4))}</div>
        <div class="podium-name">${escapeHtml(s.participant_code)}</div>
        <div class="podium-score">${s.completed}/${podData.total}</div>
        <div class="podium-bar" style="flex-direction:row;gap:10px;align-items:center;">
          <span style="font-size:0.9em;line-height:1;">${medals[i]}</span>
          <span class="podium-pts-label">${s.total_points}<span style="font-size:0.55em;font-weight:500;opacity:.85;"> pts</span></span>
        </div>
      </div>` : `<div class="podium-slot podium-slot--${ranks[i]}"><div class="podium-bar podium-bar--empty">—</div></div>`
    ).join('')}
  </div>`;
}

// Concept C leaderboard list — shared by the participant panel and the admin
// dashboard card. rows: [{ participant_code, icon, completed, total_points }].
function _renderLeaderboardC(rows, total, currentCode) {
  if (!rows || !rows.length) return '<div class="lb-c-empty">No completions yet.</div>';
  const medals = ['🥇', '🥈', '🥉'];
  const tiers = ['gold', 'silver', 'bronze'];
  const flag = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
  return '<div class="lb-c">' + rows.map((r, i) => {
    const top = i < 3;
    const cls = 'lb-c-row'
      + (top ? ` lb-c-row--top lb-c-row--${tiers[i]}` : '')
      + (currentCode && r.participant_code === currentCode ? ' lb-c-row--me' : '');
    const lead = top ? `<span class="lb-c-medal">${medals[i]}</span>` : `<span class="lb-c-rank">${i + 1}</span>`;
    const bg = top ? '<span class="lb-c-bg"></span>' : '';
    const sub = (typeof r.completed === 'number')
      ? `<div class="lb-c-sub">${flag}${r.completed}/${total}</div>` : '';
    return `<div class="${cls}" onclick="showChallengeDetail('${escHtml(r.participant_code)}')" style="cursor:pointer;" title="Click to view challenge details">${bg}${lead}`
      + `<span class="lb-c-av">${r.icon || '🎓'}</span>`
      + `<div class="lb-c-main"><div class="lb-c-name">${escHtml(r.participant_code)}</div>${sub}</div>`
      + `<div class="lb-c-pts"><b>${r.total_points}</b><small>pts</small></div>`
      + '</div>';
  }).join('') + '</div>';
}

async function refreshPodium() {
  const el = document.getElementById('dash-podium');
  if (!el) return;
  const res = await apiFetch('/api/challenges/leaderboard').catch(() => null);
  const data = res?.ok ? await res.json() : { total: 0, rows: [] };
  el.innerHTML = _renderLeaderboardC((data.rows || []).slice(0, 5), data.total);
}

/* ── Award ceremony: synced to "Absolute Champion" track (voice cues) ── */
function showAwardAnimation() {
  const triggerBtn = document.getElementById('award-ceremony-btn');
  if (triggerBtn) triggerBtn.disabled = true;

  apiFetch('/api/challenges/leaderboard')
    .then(r => r.json())
    .catch(() => ({ rows: [] }))
    .then((data) => {
      const rows = (data.rows || []).slice(0, 10);
      if (triggerBtn) triggerBtn.disabled = false;
      if (!rows.length) { showAlert('No data', 'No participants to show yet.'); return; }

      const medals = ['🥇', '🥈', '🥉'];
      const el = (cls, html) => { const d = document.createElement('div'); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };

      // Voice cues in the track (seconds): "Third place" ~0:30, "Second" ~0:41, "First" ~0:52.
      const CUES = { 3: 30.0, 2: 41.0, 1: 52.0 };

      const overlay = el('award-overlay');
      const stage = el('award-stage');
      overlay.appendChild(stage);

      const audio = new Audio('/audio/absolute-champion.mp3');
      audio.preload = 'auto';

      let slots = {};
      const revealed = {};

      const burstConfetti = (count) => {
        const colors = ['#fbbf24', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#ef4444', '#ffffff', '#fde047', '#06b6d4'];
        for (let i = 0; i < count; i++) {
          const c = document.createElement('div');
          c.className = 'award-confetti';
          const size = 9 + Math.random() * 13;
          c.style.left = Math.random() * 100 + '%';
          c.style.width = size + 'px';
          c.style.height = (size * (0.5 + Math.random())) + 'px';
          c.style.background = colors[Math.floor(Math.random() * colors.length)];
          c.style.animationDelay = (Math.random() * 0.9) + 's';
          c.style.animationDuration = (3 + Math.random() * 2.8) + 's';
          c.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
          c.style.setProperty('--drift', (Math.random() * 280 - 140) + 'px');
          if (Math.random() > 0.5) c.style.borderRadius = '50%';
          overlay.appendChild(c);
          setTimeout(() => c.remove(), 6200);
        }
      };
      const flash = () => { const f = el('award-flash'); overlay.appendChild(f); setTimeout(() => f.remove(), 700); };

      const revealRank = (rank) => {
        if (revealed[rank] || !slots[rank]) return;
        revealed[rank] = true;
        const place = slots[rank];
        place.classList.add('award-place--spot');
        setTimeout(() => place.classList.remove('award-place--spot'), 1500);
        place.classList.add('award-revealed');
        if (rank === 1) {
          place.classList.add('award-winner');
          flash();
          overlay.classList.add('award-shake');
          setTimeout(() => overlay.classList.remove('award-shake'), 700);
          burstConfetti(340);
        }
      };

      let runnerQueue = [];
      const onTime = () => {
        const t = audio.currentTime;
        runnerQueue.forEach(item => { if (!item.shown && t >= item.t) { item.shown = true; item.el.classList.add('award-runner--show'); } });
        if (t >= CUES[3]) revealRank(3);
        if (t >= CUES[2]) revealRank(2);
        if (t >= CUES[1]) revealRank(1);
      };
      audio.addEventListener('timeupdate', onTime);

      const close = () => {
        audio.pause();
        audio.removeEventListener('timeupdate', onTime);
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('award-overlay--out');
        setTimeout(() => overlay.remove(), 450);
      };
      let started = false;
      const start = () => {
        if (!started) { started = true; build(); try { audio.currentTime = 0; } catch (e) {} }
        else if (audio.ended) { try { audio.currentTime = 0; } catch (e) {} }
        audio.play().catch(() => {});
      };
      const stop = () => { audio.pause(); };
      const replay = () => {
        started = true;
        build();
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
        audio.play().catch(() => {});
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close();
        else if (e.key.toLowerCase() === 'r') replay();
        else if (e.key === ' ') { e.preventDefault(); audio.paused ? start() : stop(); }
      };
      document.addEventListener('keydown', onKey);

      const mkBtn = (cls, html, title, fn) => {
        const b = document.createElement('button');
        b.className = 'award-ctrl-btn' + (cls ? ' ' + cls : '');
        b.innerHTML = html; b.title = title; b.onclick = fn;
        return b;
      };
      const controls = el('award-controls');
      controls.appendChild(mkBtn('award-ctrl-btn--start', '▶', 'Start (Space)', start));
      controls.appendChild(mkBtn('', '⏸', 'Stop (Space)', stop));
      controls.appendChild(mkBtn('', '↻', 'Replay (R)', replay));
      controls.appendChild(mkBtn('award-ctrl-btn--close', '✕', 'Close (Esc)', close));
      overlay.appendChild(controls);

      document.body.appendChild(overlay);

      const TITLE_HTML = '<span class="award-trophy">🏆</span><span class="award-title-text">FINAL RANKINGS</span><span class="award-trophy">🏆</span>';

      function showReady() {
        Object.keys(revealed).forEach(k => delete revealed[k]);
        overlay.querySelectorAll('.award-confetti, .award-flash').forEach(n => n.remove());
        overlay.classList.remove('award-shake');
        stage.className = 'award-stage award-stage--ready';
        stage.innerHTML = '';
        stage.appendChild(el('award-title', TITLE_HTML));
        const ready = el('award-ready', '<span>▶</span> Press <b>Start</b> to begin the ceremony');
        ready.onclick = start;
        stage.appendChild(ready);
      }

      function build() {
        Object.keys(revealed).forEach(k => delete revealed[k]);
        overlay.querySelectorAll('.award-confetti, .award-flash').forEach(n => n.remove());
        overlay.classList.remove('award-shake');
        stage.className = 'award-stage';
        stage.innerHTML = '';

        const title = el('award-title award-title--top', TITLE_HTML);
        stage.appendChild(title);

        const main = el('award-main');

        // Podium (left) — pedestals visible from the start, figures hidden until each cue.
        const top3 = rows.slice(0, 3);
        const podium = el('award-podium');
        slots = {};
        [2, 1, 3].forEach(rank => {
          const r = top3[rank - 1];
          if (!r) return;
          const place = el('award-place award-place--' + rank);
          place.innerHTML =
            '<div class="award-figure">' +
              '<div class="award-avatar">' + (r.icon || '🎓') + '</div>' +
              '<div class="award-name">' + escHtml(r.participant_code) + '</div>' +
              '<div class="award-pts">' + r.total_points + ' pts</div>' +
            '</div>' +
            '<div class="award-pedestal award-pedestal--' + rank + '">' +
              '<span class="award-medal award-medal--hidden">' + medals[rank - 1] + '</span>' +
            '</div>';
          podium.appendChild(place);
          slots[rank] = place;
        });
        main.appendChild(podium);

        // Runners-up (right) — revealed one by one between 0:05 and 0:25 (driven by
        // the audio clock in onTime) so the wait until the first podium cue at 0:30
        // isn't dead time. ranks 4..10 of the top 10.
        const rest = rows.slice(3);
        runnerQueue = [];
        if (rest.length) {
          const list = el('award-runners');
          const n = rest.length;
          rest.forEach((r, i) => {
            const row = el('award-runner');
            row.innerHTML =
              '<span class="award-runner-rank">#' + (i + 4) + '</span>' +
              '<span class="award-runner-av">' + (r.icon || '🎓') + '</span>' +
              '<span class="award-runner-name">' + escHtml(r.participant_code) + '</span>' +
              '<span class="award-runner-pts">' + r.total_points + ' pts</span>';
            list.appendChild(row);
            // Reveal lowest-ranked first: #10 at 0:05, working up to #4 at 0:25.
            const t = n > 1 ? 5 + ((n - 1 - i) * 20 / (n - 1)) : 5;
            runnerQueue.push({ el: row, t: t, shown: false });
          });
          main.appendChild(list);
        }

        stage.appendChild(main);
      }

      showReady(); // static "ready" screen — nothing runs until the audience presses ▶ Start
    });
}

async function refreshPodiumFs() {
  const el = document.getElementById('dash-podium-fs');
  const rankEl = document.getElementById('dash-podium-fs-ranking');
  if (!el) return;

  const [podRes, lbRes] = await Promise.all([
    apiFetch('/api/challenges/podium').catch(() => null),
    apiFetch('/api/challenges/leaderboard').catch(() => null),
  ]);
  const podData = podRes?.ok ? await podRes.json() : { total: 0, rows: [] };
  const lbData = lbRes?.ok ? await lbRes.json() : { total: 0, rows: [] };

  el.innerHTML = _buildPodiumHtml(podData);

  if (rankEl) {
    const rest = (lbData.rows || []).slice(3, 10); // positions 4-10
    if (!rest.length) {
      rankEl.innerHTML = '<div class="podium-fs-ranking-title">4 – 10</div><div style="color:var(--text-muted);font-size:13px;">No more participants yet.</div>';
    } else {
      rankEl.innerHTML = `<div class="podium-fs-ranking-title">4 – 10</div>` +
        rest.map((r, i) => `
          <div class="podium-fs-rank-row">
            <span class="podium-fs-rank-num">#${i + 4}</span>
            <span style="font-size:16px;">${r.icon || '🎓'}</span>
            <span class="podium-fs-rank-code">${escapeHtml(r.participant_code)}</span>
            <span class="podium-fs-rank-sub">${r.completed}/${lbData.total}</span>
            <span class="podium-fs-rank-pts">${r.total_points} pts</span>
          </div>`
        ).join('');
    }
  }
}

let _podiumAutorefreshInterval = null;

function openPodiumFullscreen() {
  const overlay = document.getElementById('podium-overlay');
  // The overlay lives inside the Dashboard section; if it's not the active
  // section (e.g. opened from Control Center) its hidden ancestor would keep it
  // invisible. It's position:fixed, so reparent it to <body> to show on top.
  if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
  overlay.style.display = 'flex';
  refreshPodiumFs();
}

function closePodiumFullscreen() {
  document.getElementById('podium-overlay').style.display = 'none';
  if (_podiumAutorefreshInterval) {
    clearInterval(_podiumAutorefreshInterval);
    _podiumAutorefreshInterval = null;
    const btn = document.getElementById('podium-autorefresh-btn');
    if (btn) btn.classList.remove('podium-autorefresh-active');
  }
}

function togglePodiumAutorefresh() {
  const btn = document.getElementById('podium-autorefresh-btn');
  if (_podiumAutorefreshInterval) {
    clearInterval(_podiumAutorefreshInterval);
    _podiumAutorefreshInterval = null;
    btn.classList.remove('podium-autorefresh-active');
  } else {
    _podiumAutorefreshInterval = setInterval(refreshPodiumFs, 30000);
    btn.classList.add('podium-autorefresh-active');
    refreshPodiumFs();
  }
}

async function loadDashboard() {
  if (_loadingDashboard) return;
  _loadingDashboard = true;
  try {
    await loadAdminI18n();
    loadCTFState();
    loadRegOpen();
  const safeFetch = async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await apiFetch(url);
        // Definitive HTTP response: fail fast instead of retrying, the
        // readiness counts are best-effort.
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        // Network blip only (connection dropped, etc.) — short retry.
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    return [];
  };
  const [codesRes, challengesRes] = await Promise.all([
    safeFetch('/api/admin/codes'),
    safeFetch('/api/challenges'),
  ]);
  const codes = Array.isArray(codesRes) ? codesRes : [];
  const students = codes.filter(c => c.role !== 'admin');
  const challenges = Array.isArray(challengesRes) ? challengesRes : [];
  const visibleChallengeCount = challenges.filter(c => Number(c.visible) === 1 || c.visible === true).length;
  const challengeCount = challenges.length;

  const setReadiness = (key, ready, text) => {
    const status = document.getElementById(`ready-${key}-status`);
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-ready', ready);
    status.classList.toggle('is-missing', !ready);
  };
  setReadiness('participants', students.length > 0, students.length > 0 ? adminT('ready_count_ready', { count: students.length }) : 'No participants');
  setReadiness('challenges', visibleChallengeCount > 0, challengeCount > 0 ? adminT('ready_count_visible', { visible: visibleChallengeCount, total: challengeCount }) : 'No challenges');

  // Podium
  await refreshPodium();
  if (document.getElementById('podium-overlay')?.style.display !== 'none') {
    await refreshPodiumFs();
  }

  const tbody = document.getElementById('dash-participants-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const lbRes = await apiFetch('/api/challenges/leaderboard').catch(() => null);
  const lbData = lbRes?.ok ? await lbRes.json() : { total: 0, rows: [] };
  const totalChallenges = lbData.total || 0;
  const lbRows = lbData.rows || [];

  // Build rank map (by points, already sorted desc)
  const rankMap = Object.fromEntries(lbRows.map((r, i) => [r.participant_code, { rank: i + 1, completed: r.completed, total_points: r.total_points }]));

  // Sort students by rank (ranked first, then unranked alphabetically)
  const sortedStudents = [...students].sort((a, b) => {
    const ra = rankMap[a.code]?.rank ?? 9999;
    const rb = rankMap[b.code]?.rank ?? 9999;
    return ra !== rb ? ra - rb : a.code.localeCompare(b.code);
  });

  const c_ = 'text-align:center;vertical-align:middle;';
  sortedStudents.forEach((c, idx) => {
    const entry = rankMap[c.code] || { rank: null, completed: 0, total_points: 0 };
    const chDone = entry.completed;
    const chPoints = entry.total_points;
    const chPct = totalChallenges ? Math.round(chDone / totalChallenges * 100) : 0;
    const chColor = chPct >= 100 ? 'var(--success)' : chPct > 0 ? 'var(--warning)' : 'var(--text-muted)';
    const rankCell = entry.rank
      ? `<span style="font-size:11px;font-weight:700;color:var(--text-secondary);">#${entry.rank}</span>`
      : `<span style="color:var(--text-muted);">—</span>`;
    const ptsColor = chPoints > 0 ? 'var(--accent)' : 'var(--text-muted)';
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td style="text-align:center;vertical-align:middle;border-right:2px solid var(--border);white-space:nowrap;"><span style="font-size:18px;vertical-align:middle;margin-right:6px;">${c.icon || '🎓'}</span><code style="color:var(--accent);font-family:monospace;vertical-align:middle;">${escapeHtml(c.code)}</code></td>
        <td style="${c_}">${rankCell}</td>
        <td style="${c_}font-size:12px;font-weight:600;color:${chColor};border-right:2px solid var(--border);">${chDone}/${totalChallenges}</td>
        <td style="${c_}font-size:12px;font-weight:700;color:${ptsColor};">${chPoints > 0 ? chPoints + ' pts' : '—'}</td>
      </tr>`);
  });
  } finally {
    _loadingDashboard = false;
  }
}

// ── Access Codes ──


function rowActionIcon(type) {
  if (type === 'edit') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  }
  if (type === 'visible') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  if (type === 'hidden') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 3l18 18"/><path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"/><path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6 0 10 8 10 8a17.8 17.8 0 0 1-3.1 4.2"/><path d="M6.6 6.6C3.7 8.5 2 12 2 12s4 8 10 8a9.9 9.9 0 0 0 5.4-1.6"/></svg>';
  }
  if (type === 'save') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M20 6 9 17l-5-5"/></svg>';
  }
  if (type === 'delete-student') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  }
  if (type === 'reset') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
  }
  if (type === 'working') {
    return '<span class="row-icon-spinner"></span>';
  }
  if (type === 'success') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>';
  }
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';
}

async function loadAdminCodes() {
  if (_loadingAdminCodes) return;
  _loadingAdminCodes = true;
  try {
    let codes = [], lbData = { total: 0, rows: [] };
    try {
      const [codesRes, lbRes] = await Promise.all([
        apiFetch('/api/admin/codes'),
        apiFetch('/api/challenges/leaderboard')
      ]);
      codes = await codesRes.json();
      lbData = lbRes.ok ? await lbRes.json() : lbData;
    } catch (e) {
      console.error('loadAdminCodes error', e);
      return;
    }
    const totalChallenges = lbData.total || 0;
    const completionMap = Object.fromEntries((lbData.rows || []).map(r => [r.participant_code, r.completed]));

    const tbody = document.getElementById('codes-tbody');
    tbody.innerHTML = (Array.isArray(codes) ? codes : []).filter(c => c.role !== 'admin').map(c => {
      const chDone = completionMap[c.code] || 0;
      const chPct = totalChallenges ? Math.round(chDone / totalChallenges * 100) : 0;
      const chColor = chPct >= 100 ? 'var(--success)' : chPct > 0 ? 'var(--warning)' : 'var(--text-muted)';
      const c_ = 'text-align:center;vertical-align:middle;';
      return `<tr data-code="${escapeHtml(c.code)}">
        <td style="text-align:center;vertical-align:middle;border-right:2px solid var(--border);white-space:nowrap;"><span style="font-size:18px;vertical-align:middle;margin-right:6px;">${c.icon || '🎓'}</span><strong style="color:var(--text-primary);vertical-align:middle;">${escapeHtml(c.username || c.code)}</strong></td>
        <td style="${c_}font-size:12px;font-weight:600;color:${chColor};">${chDone}/${totalChallenges}</td>
        <td style="${c_}"><button class="row-icon-btn" onclick="showChallengeDetail('${c.code}', this)" title="Challenge detail">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button></td>
        <td style="${c_}border-right:2px solid var(--border);"><button class="row-icon-btn" onclick="resetChallenges('${c.code}')" title="Reset challenge progress">${rowActionIcon('reset')}</button></td>
        <td style="${c_}"><button class="row-icon-btn row-icon-btn--danger" onclick="deleteCode('${c.code}')" title="${adminT('participant_action_delete_participant')}">${rowActionIcon('delete-student')}</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">${adminT('state_no_access_codes')}</td></tr>`;
  } finally {
    _loadingAdminCodes = false;
  }
}
async function resetChallenges(code) {
  showConfirm({ title: `Reset CTF progress — ${code}`, body: 'All challenge completions, penalties and hints for this participant will be deleted. This cannot be undone.', okLabel: 'Reset', onOk: async () => {
    await apiFetch(`/api/challenges/participants/${encodeURIComponent(code)}/reset`, { method: 'POST' });
    loadAdminCodes();
  }});
}

function closeCtfSidebar() {
  document.getElementById('ctf-sidebar')?.classList.remove('open');
  document.getElementById('ctf-sidebar-overlay')?.classList.remove('open');
}

async function showChallengeDetail(code, _btn) {
  const res = await apiFetch(`/api/challenges/participants/${encodeURIComponent(code)}/completions`);
  const { history, total, total_points, challenges } = await res.json();
  const completed = challenges.filter(c => c.completed).length;
  const hintsUsed = challenges.filter(c => c.hint_used).length;
  const failedAttempts = challenges.reduce((s, c) => s + c.failed_attempts, 0);

  // Header
  const nameEl = document.getElementById('ctf-sidebar-name');
  const subEl  = document.getElementById('ctf-sidebar-sub');
  if (nameEl) nameEl.textContent = code;
  if (subEl)  subEl.textContent  = `${completed} / ${total} challenges completed`;

  // Score strip
  const scoreEl = document.getElementById('ctf-sidebar-score');
  if (scoreEl) scoreEl.innerHTML = `
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value">${total_points}</div>
      <div class="ctf-sidebar-score-label">Total pts</div>
    </div>
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value">${completed}/${total}</div>
      <div class="ctf-sidebar-score-label">Done</div>
    </div>
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value" style="color:#f59e0b;">${hintsUsed}</div>
      <div class="ctf-sidebar-score-label">Hints used</div>
    </div>
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value" style="color:#ef4444;">${failedAttempts}</div>
      <div class="ctf-sidebar-score-label">Penalties</div>
    </div>`;

  // Timeline
  const tlEl = document.getElementById('ctf-sidebar-timeline');
  if (tlEl) {
    if (!history.length) {
      tlEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No activity yet.</div>';
    } else {
      tlEl.innerHTML = history.map(h => {
        const dt = new Date(h.ts + (h.ts.includes('Z') ? '' : 'Z'));
        const formatted = dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        let dotClass, iconSvg, ptsText, ptsColor, eventLabel;
        if (h.result === 'success') {
          dotClass  = 'ctf-sidebar-tl-dot--success';
          iconSvg   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
          ptsText   = `+${h.points_earned} pts`;
          ptsColor  = '#22c55e';
          eventLabel = 'Completed';
        } else if (h.result === 'hint') {
          dotClass  = 'ctf-sidebar-tl-dot--hint';
          iconSvg   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          ptsText   = '−5 pts';
          ptsColor  = '#f59e0b';
          eventLabel = 'Hint used';
        } else {
          dotClass  = 'ctf-sidebar-tl-dot--fail';
          iconSvg   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          ptsText   = '−5 pts';
          ptsColor  = '#ef4444';
          eventLabel = 'Failed attempt';
        }
        return `<div class="ctf-sidebar-tl-item">
          <div class="ctf-sidebar-tl-dot ${dotClass}">${iconSvg}</div>
          <div class="ctf-sidebar-tl-body">
            <div class="ctf-sidebar-tl-title">#${h.order_num} ${escapeHtml(h.title)}</div>
            <div class="ctf-sidebar-tl-meta">${eventLabel} · ${formatted}</div>
            ${h.result === 'fail' && h.answer != null ? `<div class="ctf-sidebar-tl-answer" title="Answer submitted by the participant">${escapeHtml(h.answer)}</div>` : ''}
          </div>
          <div class="ctf-sidebar-tl-pts" style="color:${ptsColor};">${ptsText}</div>
        </div>`;
      }).join('');
    }
  }

  // Open sidebar
  document.getElementById('ctf-sidebar')?.classList.add('open');
  document.getElementById('ctf-sidebar-overlay')?.classList.add('open');
}

// ── Bulk-create participants (random themed names) ──
function openBulkParticipantsModal() {
  document.getElementById('bulk-participants-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'bulk-participants-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;padding:28px;width:460px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">${adminT('bulk_modal_title')}</h3>
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1;">×</button>
      </div>
      <p style="margin:0 0 18px;font-size:13px;color:var(--text-secondary);line-height:1.5;">${adminT('bulk_modal_desc')}</p>
      <label style="font-size:13px;color:var(--text-secondary);">${adminT('bulk_modal_count_label')}
        <input id="bulk-count-input" type="number" min="1" max="50" value="10" style="display:block;margin-top:6px;width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:14px;" />
      </label>
      <div id="bulk-modal-error" style="display:none;margin-top:10px;font-size:12px;color:#ef4444;"></div>
      <div style="display:flex;gap:10px;margin-top:22px;">
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;">${adminT('modal_cancel')}</button>
        <button id="bulk-create-btn" onclick="submitBulkParticipants()" style="flex:2;padding:10px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">${adminT('bulk_modal_create_btn')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('bulk-count-input')?.focus(), 50);
}

async function submitBulkParticipants() {
  const input = document.getElementById('bulk-count-input');
  const errEl = document.getElementById('bulk-modal-error');
  const btn = document.getElementById('bulk-create-btn');
  const count = parseInt(input?.value, 10);
  if (!count || count < 1 || count > 50) {
    errEl.textContent = adminT('bulk_modal_range_err');
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.textContent = adminT('bulk_modal_creating');

  let res, data;
  try {
    res = await apiFetch('/api/admin/participants/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    data = await res.json();
  } catch (e) {
    errEl.textContent = e.message || 'Network error';
    errEl.style.display = 'block';
    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = adminT('bulk_modal_create_btn');
    return;
  }

  if (!res.ok) {
    errEl.textContent = data?.error || 'Error';
    errEl.style.display = 'block';
    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = adminT('bulk_modal_create_btn');
    return;
  }

  renderBulkParticipantsResult(data);
  loadAdminCodes();
  if (typeof loadDashboard === 'function') loadDashboard();
}

function renderBulkParticipantsResult(data) {
  const modal = document.getElementById('bulk-participants-modal');
  if (!modal) return;
  const rows = (data.created || []).map(c => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:7px 8px;font-size:13px;color:var(--text-primary);">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</td>
      <td style="padding:7px 8px;font-size:13px;color:var(--text-secondary);font-family:monospace;">${escapeHtml(c.password)}</td>
      <td style="padding:7px 8px;font-size:13px;text-align:center;">${c.error ? '<span style="color:#ef4444;">'+escapeHtml(c.error)+'</span>' : '<span style="color:#22c55e;">✓</span>'}</td>
    </tr>`).join('');
  modal.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;padding:28px;width:520px;max-width:95vw;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">${adminT('bulk_result_title', { count: data.count })}</h3>
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1;">×</button>
      </div>
      <p style="margin:0 0 16px;font-size:12px;color:var(--text-secondary);">${adminT('bulk_result_pw_note')}</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="padding:7px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">${adminT('bulk_col_name')}</th>
          <th style="padding:7px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">${adminT('bulk_col_password')}</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);">OK</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;gap:10px;margin-top:22px;">
        <button onclick="copyBulkParticipants()" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;">${adminT('bulk_result_copy')}</button>
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="flex:1;padding:10px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">${adminT('btn_done')}</button>
      </div>
    </div>`;
  window._lastBulkCreated = data.created || [];
}

function copyBulkParticipants() {
  const list = window._lastBulkCreated || [];
  const text = list.map(c => `${c.name}\t${c.password}`).join('\n');
  navigator.clipboard?.writeText(text);
}

// Animate an "All …" header button (spinner while running, ✓/✗ on finish).
async function runAllAction(btn, fn) {
  let orig, origTitle;
  if (btn) {
    orig = btn.innerHTML;
    origTitle = btn.title;
    btn.disabled = true;
    btn.innerHTML = rowActionIcon('working');
    btn.title = adminT('state_working');
  }
  let failed = false;
  try {
    await fn();
  } catch (e) {
    failed = true;
    console.error('runAllAction error', e);
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = rowActionIcon(failed ? 'error' : 'success');
    btn.style.color = failed ? 'var(--danger)' : 'var(--success)';
    setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 3000);
  }
}

async function resetAllChallenges(btn) {
  showConfirm({ title: 'Reset full CTF progress', subtitle: 'All participants', body: 'This will clear all challenge completions, penalties and hints for every participant. This cannot be undone.', okLabel: 'Reset all', onOk: () => runAllAction(btn, async () => { await apiFetch('/api/admin/codes/reset-challenges', { method: 'POST' }); await loadAdminCodes(); }) });
}

async function deleteAllParticipants(btn) {
  showConfirm({
    title: adminT('confirm_delete_participants_title'),
    subtitle: adminT('confirm_delete_participants_subtitle'),
    body: 'All participants and their CTF progress will be deleted. This cannot be undone.',
    onOk: () => runAllAction(btn, async () => {
      const res = await apiFetch('/api/admin/codes', { method: 'DELETE' });
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        showAlert(adminT('state_error'), data.error || `HTTP ${res.status}`);
        throw new Error('delete failed');
      }
      await Promise.all([loadAdminCodes(), loadDashboard()]);
    })
  });
}
/* ── Generic alert modal ── */
let alertModalOnClose = null;

function showAlert(title, body, onClose = null, type = 'warning') {
  document.getElementById('alert-modal-title').textContent = title;
  document.getElementById('alert-modal-body').innerHTML = body;
  alertModalOnClose = typeof onClose === 'function' ? onClose : null;
  const icon = document.getElementById('alert-modal-icon');
  if (type === 'success') {
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`;
    icon.style.background = 'rgba(34,197,94,0.15)';
  } else {
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    icon.style.background = 'rgba(245,158,11,0.15)';
  }
  document.getElementById('alert-modal').style.display = 'flex';
}
function closeAlertModal() {
  document.getElementById('alert-modal').style.display = 'none';
  const onClose = alertModalOnClose;
  alertModalOnClose = null;
  if (onClose) onClose();
}

/* ── Generic confirm modal ── */
function showConfirm({ title, subtitle = adminT('confirm_default_subtitle'), body, okLabel = adminT('btn_delete'), onOk }) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-subtitle').textContent = subtitle;
  document.getElementById('confirm-modal-body').textContent = body;
  const okBtn = document.getElementById('confirm-modal-ok');
  okBtn.textContent = okLabel;
  okBtn.onclick = () => { closeConfirmModal(); onOk(); };
  document.getElementById('confirm-modal').style.display = 'flex';
}
function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

function factoryReset() {
  const modal = document.getElementById('factory-reset-modal');
  const input = document.getElementById('factory-reset-input');
  const btn = document.getElementById('factory-reset-confirm-btn');
  input.value = '';
  btn.disabled = true;
  btn.style.opacity = '.4';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}

function closeFactoryResetModal() {
  document.getElementById('factory-reset-modal').style.display = 'none';
}

let factoryResetProgressShouldLogout = false;

function setFactoryResetProgressIcon(status) {
  const icon = document.getElementById('factory-reset-progress-icon');
  icon.className = `factory-reset-progress-icon is-${status}`;
  if (status === 'running') {
    icon.innerHTML = '<span class="factory-reset-spinner"></span>';
  } else if (status === 'success') {
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>';
  } else if (status === 'warning') {
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else {
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  }
}

function renderFactoryResetSteps(steps) {
  const container = document.getElementById('factory-reset-progress-steps');
  const iconByStatus = { success: '✓', warning: '!', error: '×' };
  container.innerHTML = (steps || []).map(step => {
    const status = ['success', 'warning', 'error', 'running'].includes(step.status) ? step.status : 'warning';
    const marker = iconByStatus[status] || '';
    return `
      <div class="factory-reset-step is-${status}">
        <span class="factory-reset-step-dot">${marker}</span>
        <div>
          <div class="factory-reset-step-title">${escapeHtml(step.label || adminT('factory_progress_step'))}</div>
          <div class="factory-reset-step-detail">${escapeHtml(step.details || '')}</div>
        </div>
      </div>
    `;
  }).join('');
}

function showFactoryResetProgressRunning() {
  factoryResetProgressShouldLogout = false;
  document.getElementById('factory-reset-progress-title').textContent = adminT('factory_progress_running_title');
  document.getElementById('factory-reset-progress-subtitle').textContent = adminT('factory_progress_running_subtitle');
  document.getElementById('factory-reset-progress-errors').style.display = 'none';
  const okBtn = document.getElementById('factory-reset-progress-ok');
  okBtn.disabled = true;
  setFactoryResetProgressIcon('running');
  renderFactoryResetSteps([
    { status: 'running', label: adminT('factory_progress_started'), details: adminT('factory_progress_started_detail') }
  ]);
  document.getElementById('factory-reset-progress-modal').style.display = 'flex';
}

function showFactoryResetProgressResult(data, shouldLogout) {
  const hasErrors = data.errors?.length || data.steps?.some(step => step.status === 'error');
  const hasWarnings = data.steps?.some(step => step.status === 'warning');
  const status = hasErrors ? 'error' : hasWarnings ? 'warning' : 'success';
  factoryResetProgressShouldLogout = shouldLogout;

  document.getElementById('factory-reset-progress-title').textContent = hasErrors
    ? adminT('factory_progress_issues')
    : hasWarnings
      ? adminT('factory_progress_warnings')
      : adminT('factory_progress_complete');
  document.getElementById('factory-reset-progress-subtitle').textContent = shouldLogout
    ? adminT('factory_progress_review_logout')
    : adminT('factory_progress_review');
  setFactoryResetProgressIcon(status);
  renderFactoryResetSteps(data.steps?.length ? data.steps : [
    { status, label: adminT('factory_progress_step'), details: data.error || adminT('factory_progress_no_report') }
  ]);

  const errorsEl = document.getElementById('factory-reset-progress-errors');
  if (data.errors?.length) {
    errorsEl.style.display = 'block';
    errorsEl.innerHTML = `<strong>${adminT('factory_progress_details')}:</strong><br>${data.errors.map(escapeHtml).join('<br>')}`;
  } else {
    errorsEl.style.display = 'none';
  }

  document.getElementById('factory-reset-progress-ok').disabled = false;
}

function closeFactoryResetProgressModal() {
  document.getElementById('factory-reset-progress-modal').style.display = 'none';
  if (factoryResetProgressShouldLogout) {
    factoryResetProgressShouldLogout = false;
    handleLogout();
  }
}

async function confirmFactoryReset() {
  const input = document.getElementById('factory-reset-input');
  if (input.value.trim().toUpperCase() !== 'RESET') return;

  closeFactoryResetModal();
  showFactoryResetProgressRunning();

  try {
    const res = await apiFetch('/api/admin/settings/factory-reset', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showFactoryResetProgressResult(data, true);
      return;
    }
    showFactoryResetProgressResult({
      error: data.error || adminT('factory_progress_failed_detail'),
      errors: [data.error || `HTTP ${res.status}`],
      steps: data.steps || [{ status: 'error', label: adminT('factory_progress_failed'), details: data.error || `HTTP ${res.status}` }],
    }, false);
  } catch (e) {
    showFactoryResetProgressResult({
      error: e.message,
      errors: [e.message],
      steps: [{ status: 'error', label: adminT('factory_progress_failed'), details: e.message }],
    }, false);
  }
}

async function clearDatabase() {
  showConfirm({
    title: 'Clear Database',
    subtitle: 'This action cannot be undone',
    body: 'Will delete all participants, challenges, completions and point penalties. Admins and settings are kept.',
    okLabel: 'Clear Database',
    onOk: async () => {
      const res = await apiFetch('/api/admin/settings/clear-database', { method: 'POST' });
      const msg = document.getElementById('clear-db-msg');
      if (res.ok) {
        msg.textContent = '✓ Database cleared';
        msg.style.color = 'var(--success)';
        msg.style.display = 'inline';
        setTimeout(() => { msg.style.display = 'none'; }, 4000);
        loadDashboard();
      }
    }
  });
}

async function generateDemoData() {
  const btn = document.getElementById('demo-data-btn');
  const msg = document.getElementById('demo-data-msg');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {
    const res = await apiFetch('/api/admin/demo-data', { method: 'POST' });
    const d = await res.json();
    if (d.ok) {
      const parts = [`✓ ${d.participants.length} participants`];
      if (d.challenges_created > 0) parts.push(`${d.challenges_created} challenges`);
      msg.textContent = parts.join(', ') + ' ready';
      msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 4000);
      loadDashboard();
    }
  } catch {}
  btn.disabled = false;
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> Generate demo data';
}

// ── Registration Code (Admin > Capture the Flag) ──────────────────────────────

async function loadRegCode() {
  try {
    const res = await apiFetch('/api/admin/registration-code');
    const data = await res.json();
    const val = data.registration_code;
    const textEl = document.getElementById('reg-code-input-admin');
    const copyBtn = document.getElementById('reg-code-copy-btn');
    const editBtn = document.getElementById('reg-code-edit-btn');
    if (!textEl) return;
    textEl.textContent = val || '—';
    textEl.style.display = '';
    const editField = document.getElementById('reg-code-edit-field');
    if (editField) editField.style.display = 'none';
    if (copyBtn) copyBtn.disabled = !val;
    if (editBtn) {
      editBtn.innerHTML = rowActionIcon('edit');
      editBtn.className = 'row-icon-btn row-icon-btn--accent';
      editBtn.title = 'Edit';
      editBtn.onclick = () => toggleRegCodeEdit();
    }
  } catch {}
}

async function saveRegCode() {
  const editField = document.getElementById('reg-code-edit-field');
  if (!editField || editField.style.display === 'none') return;
  const val = editField.value.trim();
  if (!val) { loadRegCode(); return; }
  const res = await apiFetch('/api/admin/registration-code', {
    method: 'POST',
    body: JSON.stringify({ registration_code: val })
  });
  const d = await res.json();
  if (!res.ok) { showAlert('Error', d.error); loadRegCode(); return; }
  loadRegCode();
}

function toggleRegCodeEdit() {
  const textEl = document.getElementById('reg-code-input-admin');
  const editField = document.getElementById('reg-code-edit-field');
  const editBtn = document.getElementById('reg-code-edit-btn');
  if (!textEl || !editField || !editBtn) return;
  if (editField.style.display !== 'none') return;

  const currentVal = textEl.textContent.trim();
  textEl.style.display = 'none';
  editField.value = currentVal === '—' ? '' : currentVal;
  editField.style.display = '';
  editField.focus();
  editField.select();

  editBtn.innerHTML = rowActionIcon('save');
  editBtn.className = 'row-icon-btn row-icon-btn--accent';
  editBtn.title = 'Save';
  editBtn.onclick = () => saveRegCode();

  editField.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); saveRegCode(); }
    if (e.key === 'Escape') loadRegCode();
  };
}

function copyRegCode() {
  const textEl = document.getElementById('reg-code-input-admin');
  const val = textEl?.textContent?.trim();
  if (!val || val === '—') return;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.getElementById('reg-code-copy-btn');
    btn.title = 'Copied!';
    setTimeout(() => btn.title = 'Copy', 1500);
  });
}

async function deleteCode(code) {
  showConfirm({
    title: adminT('confirm_delete_participant_title', { code }),
    subtitle: adminT('confirm_delete_participant_subtitle'),
    body: 'The participant and all their CTF progress will be deleted. This cannot be undone.',
    onOk: async () => {
      const res = await apiFetch(`/api/admin/codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        showAlert(adminT('state_error'), data.error || `HTTP ${res.status}`);
        return;
      }
      await Promise.all([loadAdminCodes(), loadDashboard()]);
    }
  });
}
// ── Admins ──

async function loadAdmins() {
  const res = await apiFetch('/api/admin/admins');
  const admins = await res.json();
  const tbody = document.getElementById('admins-tbody');
  tbody.innerHTML = admins.length
    ? admins.map(a => {
        const disabled = (a.label || '').startsWith('[DISABLED]');
        const displayLabel = disabled ? a.label.replace('[DISABLED] ', '') : (a.label || '');
        const isDefault = a.code === 'ADMIN-2026';
        const b = 'border-right:2px solid var(--border);';
        return `<tr style="${disabled ? 'opacity:0.5;' : ''}">
          <td style="${b}">
            <code style="color:var(--accent);font-family:monospace;">${escapeHtml(a.code)}</code>
            ${isDefault ? '<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">(default)</span>' : ''}
          </td>
          <td style="${b}color:var(--text-secondary);">${escapeHtml(displayLabel)}</td>
          <td style="${b}text-align:center;">
            <span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${disabled ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)'};color:${disabled ? '#ef4444' : '#16a34a'};">${disabled ? 'Disabled' : 'Active'}</span>
          </td>
          <td style="text-align:center;${b}">
            <button class="row-icon-btn row-icon-btn--accent" title="View / copy API token" onclick="viewAdminToken('${escapeHtml(a.code)}', '${escapeHtml(a.api_key || '')}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </button>
          </td>
          <td style="text-align:center;${b}">
            <button class="row-icon-btn" title="Reset password" onclick="resetAdminPassword('${escapeHtml(a.code)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
          </td>
          <td style="text-align:center;${b}">
            ${!isDefault ? `<button class="row-icon-btn" title="${disabled ? 'Enable' : 'Disable'}" onclick="toggleAdminDisabled('${escapeHtml(a.code)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>${disabled ? '<line x1="8" y1="12" x2="16" y2="12"/>' : '<path d="M9 12l2 2 4-4"/>'}</svg>
            </button>` : ''}
          </td>
          <td style="text-align:center;">
            ${!isDefault ? `<button class="row-icon-btn row-icon-btn--danger" title="Delete" onclick="deleteAdmin('${escapeHtml(a.code)}')">
              ${rowActionIcon('delete-student')}
            </button>` : ''}
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No admins found</td></tr>`;
}

async function createAdmin() {
  const code = document.getElementById('new-admin-code').value.trim().toUpperCase();
  const label = document.getElementById('new-admin-label').value.trim();
  if (!code) return showAlert('Username required', 'Please enter a username for the new admin.');
  if (code.length < 5 || code.length > 12) return showAlert('Invalid username', 'Admin username must be between 5 and 12 characters.');

  const res = await apiFetch('/api/admin/codes', {
    method: 'POST',
    body: JSON.stringify({ code, role: 'admin', label })
  });
  const d = await res.json();
  if (res.ok) {
    document.getElementById('new-admin-code').value = '';
    document.getElementById('new-admin-label').value = '';
    showAlert('Admin created', `Username: <strong>${escapeHtml(code)}</strong><br>Password: <strong>${escapeHtml(d.password || '')}</strong><br><br>API Token:<br><code style="word-break:break-all;font-size:11px;">${escapeHtml(d.token || '')}</code>`);
    loadAdmins();
  } else {
    showAlert('Error creating admin', d.error || 'Unknown error');
  }
}

async function deleteAdmin(code) {
  showConfirm({ title: `Delete ${code}`, subtitle: 'Admin account', body: 'This admin account will be permanently deleted.', onOk: async () => {
    const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok) { showAlert('Cannot delete admin', d.error || 'Error'); return; }
    loadAdmins();
  }});
}

async function deleteAllAdmins() {
  showConfirm({
    title: 'Delete all admins',
    subtitle: 'All admin accounts except ADMIN-2026',
    body: 'All admin accounts except ADMIN-2026 will be permanently deleted. This cannot be undone.',
    okLabel: 'Delete all',
    onOk: async () => {
      const r = await apiFetch('/api/admin/admins/all', { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); showAlert('Error', d.error || 'Error'); return; }
      loadAdmins();
    }
  });
}

async function disableAllAdmins() {
  showConfirm({
    title: 'Disable all admins',
    subtitle: 'All admin accounts except ADMIN-2026',
    body: 'All admin accounts except ADMIN-2026 will be disabled. They will not be able to log in until re-enabled.',
    okLabel: 'Disable all',
    onOk: async () => {
      const res = await apiFetch('/api/admin/admins');
      const admins = await res.json();
      const others = admins.filter(a => a.code !== 'ADMIN-2026' && !(a.label || '').startsWith('[DISABLED]'));
      await Promise.all(others.map(a => apiFetch(`/api/admin/admins/${encodeURIComponent(a.code)}/disable`, { method: 'PATCH' })));
      loadAdmins();
    }
  });
}

async function toggleAdminDisabled(code) {
  const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}/disable`, { method: 'PATCH' });
  const d = await r.json();
  if (!r.ok) { showAlert('Error', d.error || 'Error'); return; }
  loadAdmins();
}

async function resetAdminPassword(code) {
  showConfirm({ title: `Reset password for ${code}`, subtitle: 'Admin account', body: 'A new random password will be generated.', onOk: async () => {
    const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}/reset-password`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { showAlert('Error', d.error || 'Error'); return; }
    showAlert('Password reset', `New password for <strong>${escapeHtml(code)}</strong>:<br><br><code style="font-size:14px;letter-spacing:2px;">${escapeHtml(d.password)}</code><br><br>Share this with the admin user.`);
  }});
}

function viewAdminToken(code, currentToken) {
  if (currentToken) navigator.clipboard?.writeText(currentToken).catch(() => {});
  showAlert('API Token — ' + escapeHtml(code),
    (currentToken
      ? `<code style="word-break:break-all;font-size:11px;display:block;margin-bottom:12px;padding:8px;background:var(--bg-primary);border-radius:6px;">${escapeHtml(currentToken)}</code>${currentToken ? '<p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;">Copied to clipboard.</p>' : ''}`
      : '<p style="color:var(--text-muted);font-size:12px;margin-bottom:12px;">No token set.</p>') +
    `<button class="btn-secondary" style="font-size:12px;padding:6px 14px;" onclick="regenerateAdminToken('${escapeHtml(code)}')">Regenerate token</button>`
  );
}

async function regenerateAdminToken(code) {
  closeAlertModal();
  showConfirm({ title: `Regenerate token for ${code}`, subtitle: 'Admin account', body: 'The old token will stop working immediately.', okLabel: 'Regenerate', onOk: async () => {
    const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}/regenerate-token`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { showAlert('Error', d.error || 'Error'); return; }
    navigator.clipboard?.writeText(d.token).catch(() => {});
    showAlert('Token regenerated', `New API token for <strong>${escapeHtml(code)}</strong>:<br><br><code style="word-break:break-all;font-size:11px;display:block;padding:8px;background:var(--bg-primary);border-radius:6px;">${escapeHtml(d.token)}</code><br><p style="font-size:11px;color:var(--text-muted);margin:0;">Copied to clipboard.</p>`);
    loadAdmins();
  }});
}


/* ── Helpers ── */
async function apiFetch(url, options = {}, _retry = true) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    handleLogout();
  }
  return res;
}

/* ── Table sort ── */
const _sortState = {};

function sortTable(tbodyId, thEl) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr')];
  if (rows.length <= 1 && rows[0]?.cells.length === 1) return;

  const prev = _sortState[tbodyId] || 'none';
  const next = prev === 'asc' ? 'desc' : 'asc';
  _sortState[tbodyId] = next;

  const table = tbody.closest('table');
  const allThs = [...table.querySelectorAll('th[data-sortable]')];
  allThs.forEach(th => {
    th.querySelector('.sort-arrow').textContent = '⇅';
    th.setAttribute('aria-sort', 'none');
  });
  thEl.querySelector('.sort-arrow').textContent = next === 'asc' ? '↑' : '↓';
  thEl.setAttribute('aria-sort', next);

  // Find which visible column index this th corresponds to
  const colIndex = thEl.dataset.colIndex !== undefined
    ? parseInt(thEl.dataset.colIndex)
    : 0;
  const numeric = thEl.dataset.sortNumeric === 'true';

  rows.sort((a, b) => {
    const ta = (a.cells[colIndex]?.innerText || '').trim();
    const tb = (b.cells[colIndex]?.innerText || '').trim();
    if (numeric) {
      const na = parseFloat(ta.replace(/[^\d.-]/g, ''));
      const nb = parseFloat(tb.replace(/[^\d.-]/g, ''));
      const va = isNaN(na) ? -Infinity : na;
      const vb = isNaN(nb) ? -Infinity : nb;
      return next === 'asc' ? va - vb : vb - va;
    }
    return next === 'asc' ? ta.toLowerCase().localeCompare(tb.toLowerCase()) : tb.toLowerCase().localeCompare(ta.toLowerCase());
  });
  rows.forEach(r => tbody.appendChild(r));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Admin i18n ──────────────────────────────────────────────────────────────
let _adminI18n = null;

async function loadAdminI18n() {
  if (_adminI18n) return _adminI18n;
  try {
    const r = await fetch('/js/admin-i18n.json?v=2');
    _adminI18n = await r.json();
  } catch (e) { _adminI18n = {}; }
  return _adminI18n;
}

function adminT(key, vars = {}) {
  const lang = localStorage.getItem('cd_lang') || (typeof currentLang !== 'undefined' ? currentLang : 'en') || 'en';
  const dict = _adminI18n || {};
  let value = dict[lang]?.[key] || dict.en?.[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    value = value.replaceAll(`{${k}}`, v);
  });
  return value;
}

async function applyAdminLang(lang) {
  const all = await loadAdminI18n();
  const t = all[lang] || all['en'] || {};
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!t[key]) return;
    // Keys with HTML markup (type label for factory reset modal)
    if (key === 'modal_factory_reset_type_label') {
      el.innerHTML = t[key];
    } else {
      el.textContent = t[key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (t[key]) el.placeholder = t[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (t[key]) el.title = t[key];
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.dataset.i18nAriaLabel;
    if (t[key]) el.setAttribute('aria-label', t[key]);
  });
  const adminScreen = document.getElementById('admin-screen');
  const adminScreenVisible = adminScreen && getComputedStyle(adminScreen).display !== 'none';
  const activeSection = document.querySelector('.admin-section.active')?.id;
  if (adminScreenVisible) {
    if (activeSection === 'section-dashboard') loadDashboard();
    if (activeSection === 'section-codes') loadAdminCodes();
    if (activeSection === 'section-admins') loadAdmins();
  }
}

/* ── Challenge template ── */

async function loadChallengeTemplate() {
  const existingRes = await apiFetch('/api/challenges').catch(() => null);
  const existing = existingRes?.ok ? await existingRes.json() : [];
  showConfirm({
    title: 'Load challenge template',
    subtitle: existing.length > 0 ? `This will delete ${existing.length} existing challenge${existing.length === 1 ? '' : 's'}` : 'Challenges are currently empty',
    body: 'All challenges and participant progress will be replaced with the bundled template (templates/challenges.csv).',
    okLabel: 'Load template',
    onOk: async () => {
      try {
        const res = await apiFetch('/api/admin/challenges/sync-template', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        showAlert('Template loaded', `${data.imported} challenge${data.imported === 1 ? '' : 's'} imported.`, null, 'success');
        loadChallenges();
      } catch (e) {
        showAlert('Template load failed', e.message);
      }
    },
  });
}

// ── Admin: Challenges ─────────────────────────────────────

let _challengesCache = [];

async function loadCTFState() {
  try {
    const res = await fetch('/api/challenges/ctf-state');
    const data = await res.json();
    renderCTFStateButtons(data.state);
  } catch {}
}

function renderCTFStateButtons(state) {
  const labels = { stop: 'Stopped', standby: 'Standby', run: 'Running' };
  const colors = { stop: '#dc2626', standby: '#d97706', run: '#16a34a' };
  const darkColors = { stop: '#f87171', standby: '#fbbf24', run: '#4ade80' };
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const color = (isDark ? darkColors : colors)[state] || 'var(--text-primary)';

  // Header label
  const el = document.getElementById('ctf-state-text');
  if (el) { el.textContent = labels[state] || state; el.style.color = color; }

  // Header buttons
  ['stop', 'standby', 'run'].forEach(s => {
    const btn = document.getElementById(`ctf-btn-${s}`);
    if (btn) btn.className = 'ctf-state-btn' + (state === s ? ` active-${s}` : '');
  });

  // Capture the Flag panel semaphore
  ['stop', 'standby', 'run'].forEach(s => {
    const light = document.getElementById(`ctf-panel-light-${s}`);
    if (light) light.classList.toggle('active', state === s);
  });

  // Dashboard semaphore
  ['stop', 'standby', 'run'].forEach(s => {
    const light = document.getElementById(`dash-light-${s}`);
    if (light) light.classList.toggle('active', state === s);
  });
  const dashText = document.getElementById('dash-ctf-state-text');
  if (dashText) { dashText.textContent = labels[state] || state; dashText.style.color = color; }

  // Participant panel badge
  const badge = document.getElementById('ctf-status-badge');
  if (badge) {
    const isDarkB  = document.documentElement.getAttribute('data-theme') === 'dark';
    const dotColor = (isDarkB ? darkColors : colors)[state] || '#888';
    const bgMap = { stop: 'rgba(220,38,38,0.1)', standby: 'rgba(217,119,6,0.1)', run: 'rgba(22,163,74,0.1)' };
    badge.style.background = bgMap[state] || 'var(--bg-secondary)';
    badge.style.color = dotColor;
    badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0;"></span>${labels[state] || state}`;
  }
}

async function setCTFState(state) {
  try {
    const res = await apiFetch('/api/challenges/ctf-state', { method: 'POST', body: JSON.stringify({ state }) });
    const data = await res.json();
    if (data.ok) renderCTFStateButtons(data.state);
    pollCtfTimer(); // the semaphore pauses/resumes the countdown — refresh now
  } catch {}
}

// ══════════════════ CTF countdown timer (shared: admin + participant) ══════════════════
const _timer = { total: 0, remaining: 0, running: false, syncedAt: 0, hasData: false, state: 'stop' };
let _timerLastBeep = -1;
let _timerExpiredShown = false;
let _timerPollStarted = false;
let _timerAudioCtx = null;

function fmtHMS(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function timerStateColorClass(remaining, total) {
  if (total <= 0) return 'is-idle';
  if (remaining <= 0) return 'is-red';
  const state = _timer.state || (_timer.running ? 'run' : 'standby');
  if (state === 'run') {
    if (remaining <= 60) return 'is-red';
    if (remaining <= total * 0.5) return 'is-orange';
    return 'is-green';
  }
  if (state === 'standby') return 'is-orange';
  if (state === 'stop') return 'is-red';
  return _timer.running ? 'is-green' : 'is-paused';
}

function timerAudio() {
  try {
    if (!_timerAudioCtx) _timerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_timerAudioCtx.state === 'suspended') _timerAudioCtx.resume();
  } catch { return null; }
  return _timerAudioCtx;
}
function timerTone(freq, dur, gain) {
  const ctx = timerAudio(); if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain || 0.25, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function timerBeep() { timerTone(740, 0.14, 0.28); }
function timerBuzzer() { timerTone(440, 0.25, 0.3); setTimeout(() => timerTone(330, 0.6, 0.3), 260); }

function renderTimerUI(disp) {
  const total = _timer.total;
  const hasTimer = total > 0;
  const cls = !hasTimer ? 'is-idle' : timerStateColorClass(disp, total);
  const val = fmtHMS(disp);
  const pct = hasTimer ? Math.max(0, Math.min(100, Math.round((disp / total) * 100))) : 0;
  const STATES = ['is-idle', 'is-green', 'is-orange', 'is-red', 'is-paused', 'is-pulsing'];

  document.querySelectorAll('.ctf-timer-chip').forEach(chip => {
    chip.style.display = hasTimer ? 'inline-flex' : 'none';
    chip.classList.remove(...STATES);
    chip.classList.add(cls);
    if (cls === 'is-red' && _timer.running) chip.classList.add('is-pulsing');
    const v = chip.querySelector('.ctf-timer-val');
    if (v) v.textContent = (cls === 'is-paused' ? '⏸ ' : '') + val;
  });

  const banner = document.getElementById('ctf-timer-banner');
  if (banner) {
    banner.classList.remove(...STATES);
    banner.classList.add(cls);
    if (cls === 'is-red' && _timer.running) banner.classList.add('is-pulsing');
    const disEl = document.getElementById('ctf-timer-display');
    if (disEl) disEl.textContent = hasTimer ? val : '--:--:--';
    const stEl = document.getElementById('ctf-timer-status');
    if (stEl) {
      stEl.textContent = !hasTimer ? 'No timer set — the clock runs only while Capture the Flag is on Run.'
        : (disp <= 0 ? "Time's up — Capture the Flag moved to Standby."
        : (_timer.running ? 'Running' : 'Paused — set Capture the Flag to Run to resume.'));
    }
    const progressEl = document.getElementById('ctf-timer-progress');
    if (progressEl) progressEl.style.width = `${pct}%`;
    const trackEl = document.getElementById('ctf-timer-track');
    if (trackEl) {
      trackEl.style.setProperty('--timer-pct', `${pct * 3.6}deg`);
      trackEl.setAttribute('aria-valuenow', String(pct));
      trackEl.setAttribute('aria-valuetext', hasTimer ? `${pct}% remaining, ${val}` : 'No timer set');
    }
    const pctEl = document.getElementById('ctf-timer-percent');
    if (pctEl) pctEl.textContent = hasTimer ? `${pct}%` : '--';
  }
}

function tickCtfTimer() {
  if (!_timer.hasData) return;
  let disp = _timer.remaining;
  if (_timer.running) disp = _timer.remaining - (Date.now() - _timer.syncedAt) / 1000;
  disp = Math.max(0, disp);

  renderTimerUI(disp);

  if (disp > 10.5) _timerLastBeep = -1;
  if (disp > 0.5) _timerExpiredShown = false;

  if (_timer.running && _timer.total > 0) {
    const whole = Math.ceil(disp);
    if (whole >= 1 && whole <= 10 && whole !== _timerLastBeep) { _timerLastBeep = whole; timerBeep(); }
    if (disp <= 0 && !_timerExpiredShown) { _timerExpiredShown = true; onTimerExpired(); pollCtfTimer(); }
  }
}

function onTimerExpired() {
  timerBuzzer();
  if (userInfo?.role !== 'admin') loadParticipantChallenges();
  if (document.getElementById('timer-splash')) return;
  const d = document.createElement('div');
  d.id = 'timer-splash'; d.className = 'timer-splash';
  d.innerHTML = '<div class="timer-splash-card"><div class="timer-splash-emoji">⏱️</div><div class="timer-splash-title">TIME’S UP!</div><div class="timer-splash-sub">Capture the Flag has ended.</div></div>';
  d.onclick = () => d.remove();
  document.body.appendChild(d);
  setTimeout(() => { d.classList.add('timer-splash--out'); setTimeout(() => d.remove(), 500); }, 6000);
}

function applyTimerData(t, state) {
  if (!t) return;
  _timer.total = t.total || 0;
  _timer.remaining = t.remaining || 0;
  _timer.running = !!t.running;
  if (state) _timer.state = state;
  _timer.syncedAt = Date.now();
  _timer.hasData = true;
}

async function pollCtfTimer() {
  try {
    const res = await fetch('/api/challenges/ctf-state');
    const data = await res.json();
    const state = data.state || 'stop';
    applyTimerData(data.timer, state);
    if (_ctfState !== state) {
      _ctfState = state;
      // Participants: the board depends on the CTF state (hidden when
      // stopped, read-only on standby), so refresh it when it changes.
      if (userInfo && userInfo.role !== 'admin') loadParticipantChallenges();
    }
    if (userInfo && userInfo.role !== 'admin') applyParticipantLeaderboardVisibility();
    if (typeof renderCTFStateButtons === 'function') renderCTFStateButtons(state);
    tickCtfTimer();
  } catch {}
}

function startCtfTimer() {
  if (_timerPollStarted) return;
  _timerPollStarted = true;
  pollCtfTimer();
  setInterval(pollCtfTimer, 10000);
  setInterval(tickCtfTimer, 1000);
}

// — Control Center banner actions —
async function ctfTimerApi(body) {
  try {
    const res = await apiFetch('/api/challenges/timer', { method: 'POST', body: JSON.stringify(body) });
    applyTimerData(await res.json());
    tickCtfTimer();
  } catch {}
}
function ctfTimerPreset(s) { ctfTimerApi({ action: 'set', seconds: s }); }
function ctfTimerAdjust(d) { ctfTimerApi({ action: 'adjust', delta: d }); }
function ctfTimerReset() {
  if (_timer.running && typeof showConfirm === 'function') {
    showConfirm({ title: 'Reset timer?', subtitle: 'The countdown is running', body: 'This resets the remaining time back to the configured total. Continue?', okLabel: 'Reset', onOk: () => ctfTimerApi({ action: 'reset' }) });
    return;
  }
  ctfTimerApi({ action: 'reset' });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startCtfTimer);
else startCtfTimer();

function renderRegOpenBlock(open) {
  const closedLight = document.getElementById('dash-reg-light-closed');
  const openLight   = document.getElementById('dash-reg-light-open');
  const text        = document.getElementById('dash-reg-state-text');
  if (closedLight) closedLight.classList.toggle('active', !open);
  if (openLight)   openLight.classList.toggle('active', open);
  if (text) {
    text.textContent = open ? 'Open' : 'Closed';
    text.style.color = open ? '#22c55e' : '#ef4444';
  }
  // Also update toggle in CTF tab if present
  const toggle = document.getElementById('reg-open-toggle');
  if (toggle) toggle.checked = open;
  const toggleLabel = document.getElementById('reg-open-toggle-label');
  if (toggleLabel) {
    toggleLabel.textContent = open ? 'Open' : 'Closed';
    toggleLabel.style.color = open ? '#22c55e' : '#ef4444';
  }
  const panelClosed = document.getElementById('reg-panel-light-closed');
  const panelOpen = document.getElementById('reg-panel-light-open');
  if (panelClosed) panelClosed.classList.toggle('active', !open);
  if (panelOpen) panelOpen.classList.toggle('active', open);
}

async function loadRegOpen() {
  try {
    const res = await apiFetch('/api/admin/registration-open');
    const data = await res.json();
    renderRegOpenBlock(!!data.open);
  } catch {}
}

async function setRegOpen(open) {
  try {
    const res = await apiFetch('/api/admin/registration-open', { method: 'POST', body: JSON.stringify({ open }) });
    const data = await res.json();
    if (data.ok !== undefined) renderRegOpenBlock(!!data.open);
  } catch {}
}

// ── Leaderboard visibility for participants ──
function renderLeaderboardVisible(visible) {
  const hiddenLight = document.getElementById('lb-panel-light-hidden');
  const visibleLight = document.getElementById('lb-panel-light-visible');
  const label = document.getElementById('lb-visible-label');
  if (hiddenLight) hiddenLight.classList.toggle('active', !visible);
  if (visibleLight) visibleLight.classList.toggle('active', visible);
  if (label) { label.textContent = visible ? 'Visible' : 'Hidden'; label.style.color = visible ? '#22c55e' : '#ef4444'; }
}

async function loadLeaderboardVisible() {
  try {
    const res = await apiFetch('/api/challenges/leaderboard-visible');
    const data = await res.json();
    renderLeaderboardVisible(data.visible !== false);
  } catch {}
}

async function setLeaderboardVisible(visible) {
  try {
    const res = await apiFetch('/api/challenges/leaderboard-visible', { method: 'POST', body: JSON.stringify({ visible }) });
    const data = await res.json();
    if (data.ok !== undefined) renderLeaderboardVisible(!!data.visible);
  } catch {}
}

async function loadChallenges() {
  const res = await apiFetch('/api/challenges');
  const challenges = await res.json();
  _challengesCache = challenges;
  const tbody = document.getElementById('challenges-tbody');
  if (!challenges.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No challenges yet. Click "Add" to create one.</td></tr>`;
    return;
  }
  tbody.innerHTML = challenges.map((c, idx) => renderChallengeRow(c, idx, challenges.length)).join('');
  initChallengeDragDrop(tbody);
}

function renderChallengeRow(c, idx = 0, total = 0, editing = false) {
  const dragHandle = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.4;pointer-events:none;display:block;margin:auto;"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>`;
  const isVis = !!c.visible;
  const visibleToggle = `<button class="row-icon-btn ${isVis ? 'row-icon-btn--accent' : ''}" onclick="toggleChallengeVisible(${c.id}, ${isVis ? 0 : 1}, this)" id="ch-vis-btn-${c.id}" title="${isVis ? 'Visible to participants' : 'Hidden from participants'}" aria-label="${isVis ? 'Visible' : 'Hidden'}">${rowActionIcon(isVis ? 'visible' : 'hidden')}</button>`;
  const empty = '<em style="color:var(--text-muted)">—</em>';

  const titleCell = editing
    ? `<input class="adm-inline-input" value="${escHtml(c.title)}" id="ch-title-${c.id}" placeholder="Challenge title">`
    : `<span class="challenge-summary-head">
        <span class="challenge-read-value challenge-summary-title" id="ch-title-${c.id}">${escHtml(c.title) || empty}</span>
        <span id="ch-summary-type-${c.id}" class="challenge-type-badge challenge-type-badge--text challenge-summary-type">${c.points} pts</span>
      </span>`;

  const descCell = editing
    ? `<textarea class="adm-inline-input challenge-description-input" rows="3" id="ch-desc-${c.id}" placeholder="Scenario / question shown to participants">${escHtml(c.description)}</textarea>`
    : `<span class="challenge-read-value" id="ch-desc-${c.id}" style="white-space:pre-wrap;">${escHtml(c.description) || empty}</span>`;

  const flagCell = editing
    ? `<input class="adm-inline-input" id="ch-flag-${c.id}" value="${escHtml(c.flag || '')}" placeholder="Expected answer">`
    : (c.flag ? `<code class="challenge-text-key-value">${escHtml(c.flag)}</code>` : `<em style="color:var(--danger)">No flag set</em>`);

  const pointsCell = editing
    ? `<input class="adm-inline-input ch-add-input--narrow" type="number" min="0" max="1000" value="${c.points ?? 50}" id="ch-points-${c.id}" style="width:80px;">`
    : `<span class="challenge-read-value">${c.points ?? 50} pts</span>`;

  const hintCell = editing
    ? `<input class="adm-inline-input" style="width:100%;max-width:400px;" placeholder="Optional hint text for participants" value="${escHtml(c.hint || '')}" id="ch-hint-${c.id}">`
    : (c.hint ? `<span class="challenge-read-value" style="color:var(--text-secondary)">${escHtml(c.hint)}</span>` : `<span style="color:var(--text-muted)">—</span>`);

  const editBtn = editing
    ? `<button class="row-icon-btn row-icon-btn--accent" onclick="saveChallengeEdit(${c.id})" title="Save" aria-label="Save">${rowActionIcon('save')}</button>`
    : `<button class="row-icon-btn row-icon-btn--accent" onclick="startChallengeEdit(${c.id})" title="Edit" aria-label="Edit">${rowActionIcon('edit')}</button>`;

  const chevronDown = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
  return `<tr id="ch-row-${c.id}" class="challenge-admin-row challenge-group-start" data-editing="${editing}" data-collapsed="true" draggable="true" data-id="${c.id}">
    <td id="ch-drag-${c.id}" class="drag-handle-cell" style="width:28px;text-align:center;color:var(--text-muted);cursor:grab;">${dragHandle}</td>
    <td id="ch-idcell-${c.id}" class="challenge-id-cell" rowspan="1" style="cursor:pointer;" onclick="toggleChallengeCollapse(${c.id})" title="Expand/collapse">
      <span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">
        <code id="ch-seq-${c.id}">#${idx + 1}</code>
        <span id="ch-chevron-${c.id}" style="color:var(--text-muted);line-height:1;">${chevronDown}</span>
      </span>
    </td>
    <td id="ch-titlelabel-${c.id}" class="challenge-label-cell" style="display:none;">Title</td>
    <td class="challenge-value-cell" colspan="2" ${!editing ? `onclick="toggleChallengeCollapse(${c.id})" style="cursor:pointer;"` : ''}>${titleCell}</td>
    <td id="ch-act2-${c.id}" class="challenge-action-cell" rowspan="1">${editBtn}</td>
    <td id="ch-act3-${c.id}" class="challenge-action-cell" rowspan="1">
      <button class="row-icon-btn row-icon-btn--danger" onclick="deleteChallenge(${c.id})" title="Delete challenge" aria-label="Delete challenge">${rowActionIcon('delete-student')}</button>
    </td>
    <td id="ch-act4-${c.id}" class="challenge-action-cell" rowspan="1">${visibleToggle}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Description</td>
    <td class="challenge-value-cell">${descCell}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Flag <span class="info-icon-wrap"><svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span class="info-popover"><strong>Matching</strong><span>Case-insensitive, extra spaces ignored, otherwise exact.</span><span><code>%username</code> the participant's username</span></span></span></td>
    <td class="challenge-value-cell">${flagCell}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Points</td>
    <td class="challenge-value-cell">${pointsCell}</td>
  </tr>
  <tr class="challenge-admin-row challenge-group-end ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Hint <span style="font-weight:400;color:var(--text-muted);font-size:11px">(-5 pts)</span></td>
    <td class="challenge-value-cell">${hintCell}</td>
  </tr>`;
}
function startChallengeEdit(id) {
  const row = document.getElementById(`ch-row-${id}`);
  if (!row) return;
  const tbody = row.closest('tbody');
  const allRows = [...tbody.querySelectorAll('tr[id^="ch-row-"]')];
  const idx = allRows.indexOf(row);
  const total = allRows.length;

  const challenges = _challengesCache || [];
  const c = challenges.find(x => x.id === id);
  if (!c) return;

  const html = renderChallengeRow(c, idx, total, true);
  const tmp = document.createElement('tbody');
  tmp.innerHTML = html;
  const newRows = [...tmp.children];

  const existingRows = [row];
  let next = row.nextElementSibling;
  while (next && !next.id.startsWith('ch-row-')) { existingRows.push(next); next = next.nextElementSibling; }

  existingRows.forEach((r, i) => { if (newRows[i]) r.replaceWith(newRows[i]); });
  // Auto-expand so all fields are visible while editing
  const newMainRow = document.getElementById(`ch-row-${id}`);
  if (newMainRow && newMainRow.dataset.collapsed === 'true') toggleChallengeCollapse(id);
}

async function saveChallengeEdit(id) {
  await updateChallenge(id);
}

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function updateChallenge(id) {
  const row = document.getElementById(`ch-row-${id}`);
  const section = row?.closest('tbody');
  const val = sel => { const el = section?.querySelector(sel); return el ? (el.value ?? el.textContent) : ''; };
  const cached = _challengesCache.find(c => c.id === id);
  const points = parseInt(val(`#ch-points-${id}`), 10);
  const body = {
    title: val(`#ch-title-${id}`),
    description: val(`#ch-desc-${id}`),
    flag: val(`#ch-flag-${id}`).trim(),
    points: Number.isFinite(points) && points >= 0 ? points : 50,
    hint: val(`#ch-hint-${id}`) || null,
    visible: cached?.visible ?? 1,
  };
  if (!body.title.trim()) { showAlert('Missing title', 'The challenge needs a title.'); return; }
  const res = await apiFetch(`/api/challenges/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    showAlert('Save failed', d.error || `HTTP ${res.status}`);
    return;
  }
  loadChallenges();
  loadDashboard();
}
async function toggleChallengeVisible(id, nextVisible, btn) {
  const c = _challengesCache.find(x => x.id === id);
  if (!c) return;
  await apiFetch(`/api/challenges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...c, visible: nextVisible })
  });
  c.visible = nextVisible;
  const isVis = !!nextVisible;
  btn.className = `row-icon-btn${isVis ? ' row-icon-btn--accent' : ''}`;
  btn.title = isVis ? 'Visible to participants' : 'Hidden from participants';
  btn.innerHTML = rowActionIcon(isVis ? 'visible' : 'hidden');
  btn.onclick = () => toggleChallengeVisible(id, isVis ? 0 : 1, btn);
}

function initChallengeDragDrop(tbody) {
  let dragSrc = null;
  const mainRows = () => [...tbody.querySelectorAll('tr[id^="ch-row-"]')];
  const groupRows = id => [...tbody.querySelectorAll(`tr[id="ch-row-${id}"], tr.ch-detail-${id}`)];

  tbody.querySelectorAll('tr[draggable]').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = row;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => groupRows(row.dataset.id).forEach(r => r.style.opacity = '0.4'), 0);
    });
    row.addEventListener('dragend', () => {
      if (dragSrc) groupRows(dragSrc.dataset.id).forEach(r => r.style.opacity = '');
      dragSrc = null;
      mainRows().forEach(r => r.style.borderTop = '');
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      mainRows().forEach(r => r.style.borderTop = '');
      if (row !== dragSrc) row.style.borderTop = '2px solid var(--accent)';
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const mains = mainRows();
      const fromIdx = mains.indexOf(dragSrc);
      const toIdx = mains.indexOf(row);
      mains.splice(fromIdx, 1);
      mains.splice(toIdx, 0, dragSrc);
      mainRows().forEach(r => r.style.borderTop = '');
      // Reinsert groups in new order
      mains.forEach((mainRow, i) => {
        const id = mainRow.dataset.id;
        groupRows(id).forEach(r => tbody.appendChild(r));
        const el = document.getElementById(`ch-seq-${id}`);
        if (el) el.textContent = `#${i + 1}`;
      });
      const ids = mains.map(r => parseInt(r.dataset.id));
      await apiFetch('/api/challenges/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    });
  });
}

function toggleNewChallengeRow() {
  const tbody = document.getElementById('new-challenge-tbody');
  if (!tbody) return;
  if (tbody.innerHTML.trim()) {
    tbody.innerHTML = '';
    return;
  }
  const autoGrow = `oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"`;
  tbody.innerHTML = `
    <tr class="challenge-admin-row challenge-group-start">
      <td rowspan="6" style="border:none;"></td>
      <td class="challenge-id-cell" rowspan="6" style="text-align:center;vertical-align:middle;color:var(--text-muted);font-size:12px;font-weight:600;">NEW</td>
      <td class="challenge-label-cell">Title</td>
      <td class="challenge-value-cell" colspan="1"><input class="adm-inline-input" id="new-ch-title" placeholder="Challenge title" style="width:100%;"></td>
      <td class="challenge-action-cell" rowspan="6" style="vertical-align:middle;"></td>
      <td class="challenge-action-cell" rowspan="6" style="vertical-align:middle;"></td>
      <td class="challenge-action-cell" rowspan="6" style="vertical-align:middle;"></td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Description</td>
      <td class="challenge-value-cell"><textarea class="adm-inline-input" id="new-ch-desc" placeholder="Scenario / question shown to participants" rows="2" style="width:100%;resize:none;overflow:hidden;" ${autoGrow}></textarea></td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Flag <span class="info-icon-wrap"><svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span class="info-popover"><strong>Matching</strong><span>Case-insensitive, extra spaces ignored, otherwise exact.</span><span><code>%username</code> the participant's username</span></span></span></td>
      <td class="challenge-value-cell"><input class="adm-inline-input" id="new-ch-flag" placeholder="Expected answer (supports %username)" style="width:100%;"></td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Points</td>
      <td class="challenge-value-cell">
        <input class="adm-inline-input" type="number" min="0" max="1000" value="50" id="new-ch-points" style="width:80px;">
        <span style="color:var(--text-muted);font-size:11px;">pts</span>
      </td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Hint <span style="font-weight:400;color:var(--text-muted);font-size:11px">(-5 pts)</span></td>
      <td class="challenge-value-cell"><textarea class="adm-inline-input" id="new-ch-hint" placeholder="Optional hint text for participants" rows="1" style="width:100%;resize:none;overflow:hidden;" ${autoGrow}></textarea></td>
    </tr>
    <tr class="challenge-admin-row challenge-group-end">
      <td colspan="2" style="padding:10px 12px;text-align:right;border-top:1px solid var(--border);">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-secondary" onclick="toggleNewChallengeRow()" style="padding:6px 0;font-size:12px;width:80px;">Cancel</button>
          <button class="btn-primary" onclick="addChallenge()" style="padding:6px 0;font-size:12px;width:80px;">Create</button>
        </div>
      </td>
    </tr>`;
  document.getElementById('new-ch-title')?.focus();
}
function toggleChallengeCollapse(id) {
  const row = document.getElementById(`ch-row-${id}`);
  if (!row) return;
  const collapsed = row.dataset.collapsed === 'true';
  const details = document.querySelectorAll(`.ch-detail-${id}`);
  const chevron = document.getElementById(`ch-chevron-${id}`);
  const chevronDown = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
  const chevronUp   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
  const span = collapsed ? 5 : 1;
  ['ch-drag', 'ch-idcell', 'ch-act2', 'ch-act3', 'ch-act4'].forEach(prefix => {
    const el = document.getElementById(`${prefix}-${id}`);
    if (el) el.rowSpan = span;
  });
  const labelCell = document.getElementById(`ch-titlelabel-${id}`);
  const titleRow = row.querySelector('.challenge-value-cell');
  const summaryType = document.getElementById(`ch-summary-type-${id}`);
  if (collapsed) {
    details.forEach(r => r.style.display = '');
    row.dataset.collapsed = 'false';
    if (chevron) chevron.innerHTML = chevronUp;
    if (labelCell) labelCell.style.display = '';
    if (titleRow) titleRow.colSpan = 1;
    if (summaryType) summaryType.style.display = 'none';
  } else {
    details.forEach(r => r.style.display = 'none');
    row.dataset.collapsed = 'true';
    if (chevron) chevron.innerHTML = chevronDown;
    if (labelCell) labelCell.style.display = 'none';
    if (titleRow) titleRow.colSpan = 2;
    if (summaryType) summaryType.style.display = '';
  }
}

function expandAllChallenges() {
  document.querySelectorAll('.challenge-group-start[data-collapsed="true"]').forEach(row => {
    const id = row.id.replace('ch-row-', '');
    toggleChallengeCollapse(id);
  });
}

function collapseAllChallenges() {
  document.querySelectorAll('.challenge-group-start[data-collapsed="false"]').forEach(row => {
    const id = row.id.replace('ch-row-', '');
    toggleChallengeCollapse(id);
  });
}

async function addChallenge() {
  const get = id => document.getElementById(id)?.value.trim() || '';
  const points = parseInt(get('new-ch-points'), 10);
  const body = {
    title: get('new-ch-title') || 'New challenge',
    description: get('new-ch-desc'),
    flag: get('new-ch-flag'),
    points: Number.isFinite(points) && points >= 0 ? points : 50,
    hint: get('new-ch-hint') || null,
    visible: 0,
  };
  if (!body.flag) { showAlert('Missing flag', 'Set the expected answer before creating the challenge.'); return; }
  const res = await apiFetch('/api/challenges', { method: 'POST', body: JSON.stringify(body) });
  const d = await res.json();
  if (d.id) {
    const tbody = document.getElementById('new-challenge-tbody');
    if (tbody) tbody.innerHTML = '';
    loadChallenges();
    loadDashboard();
  } else {
    showAlert('Create failed', d.error || 'Unknown error');
  }
}
async function deleteChallenge(id) {
  showConfirm({ title: 'Delete challenge', body: 'This will also remove all participant completions for this challenge.', onOk: async () => {
    await apiFetch(`/api/challenges/${id}`, { method: 'DELETE' });
    loadChallenges();
    loadDashboard();
    loadAdminCodes();
  }});
}

async function toggleAllChallengesVisible() {
  const challenges = Array.isArray(_challengesCache) ? _challengesCache : [];
  if (!challenges.length) return;
  const allVisible = challenges.every(c => !!c.visible);
  const nextVisible = allVisible ? 0 : 1;
  const btn = document.getElementById('challenge-toggle-all-btn');
  if (btn) { btn.disabled = true; }
  try {
    await Promise.all(challenges.map(c => apiFetch(`/api/challenges/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, visible: nextVisible })
    })));
    challenges.forEach(c => { c.visible = nextVisible; });
    loadChallenges();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAllChallenges() {
  showConfirm({ title: 'Delete all challenges', body: 'This will delete all challenges and all participant completion records.', onOk: async () => {
    await apiFetch('/api/challenges/all', { method: 'DELETE' });
    loadChallenges();
    loadDashboard();
    loadAdminCodes();
  }});
}

async function exportChallengesCSV() {
  const res = await apiFetch('/api/challenges/export');
  const text = await res.text();
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(text);
  a.download = 'challenges.csv';
  a.click();
}

async function importChallengesCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const csv = await file.text();
  const res = await apiFetch('/api/challenges/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
  const d = await res.json();
  event.target.value = '';
  if (d.ok) { showAlert('Import complete', `Imported ${d.imported} challenge(s).`); loadChallenges(); }
  else showAlert('Import error', d.error || 'Unknown error');
}

// ── Student: Challenges panel ─────────────────────────────

let participantChallenges = [];

// The challenge board is the participant's main view: bring it back to the
// front (closing side panels) and refresh it.
function showBoard() {
  closeLeaderboardPanel();
  closePanel();
  showChallengeTab('list');
  loadParticipantChallenges();
}

function showChallengeTab(tab) {
  ['list', 'history', 'scoring'].forEach(name => {
    document.getElementById(`chtab-panel-${name}`).style.display = tab === name ? '' : 'none';
    document.getElementById(`chtab-${name}`).classList.toggle('active', tab === name);
  });
  if (tab === 'history') loadParticipantChallengeHistory();
}
async function loadParticipantChallengeHistory() {
  const el = document.getElementById('participant-challenge-history');
  if (!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">Loading...</div>';
  try {
    const res = await apiFetch('/api/challenges/participant/history');
    const { history, total_points, completed, total, hints_used, failed_attempts } = await res.json();

    // Score strip
    const scoreStrip = `
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value">${total_points}</div>
          <div class="ctf-sidebar-score-label">Total pts</div>
        </div>
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value">${completed}/${total}</div>
          <div class="ctf-sidebar-score-label">Done</div>
        </div>
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value" style="color:#f59e0b;">${hints_used}</div>
          <div class="ctf-sidebar-score-label">Hints used</div>
        </div>
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value" style="color:#ef4444;">${failed_attempts}</div>
          <div class="ctf-sidebar-score-label">Penalties</div>
        </div>
      </div>`;

    if (!history.length) {
      el.innerHTML = scoreStrip + '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">No activity yet.</div>';
      return;
    }

    const timelineItems = history.map(h => {
      const dt = new Date(h.ts + (h.ts.includes('Z') ? '' : 'Z'));
      const formatted = dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      let dotClass, iconSvg, ptsText, ptsColor, eventLabel;
      if (h.result === 'success') {
        dotClass   = 'ctf-sidebar-tl-dot--success';
        iconSvg    = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        ptsText    = `+${h.points_earned} pts`;
        ptsColor   = '#22c55e';
        eventLabel = 'Completed';
      } else if (h.result === 'hint') {
        dotClass   = 'ctf-sidebar-tl-dot--hint';
        iconSvg    = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        ptsText    = '−5 pts';
        ptsColor   = '#f59e0b';
        eventLabel = 'Hint used';
      } else {
        dotClass   = 'ctf-sidebar-tl-dot--fail';
        iconSvg    = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        ptsText    = '−5 pts';
        ptsColor   = '#ef4444';
        eventLabel = 'Failed attempt';
      }
      return `<div class="ctf-sidebar-tl-item">
        <div class="ctf-sidebar-tl-dot ${dotClass}">${iconSvg}</div>
        <div class="ctf-sidebar-tl-body">
          <div class="ctf-sidebar-tl-title">#${h.order_num} ${escHtml(h.title)}</div>
          <div class="ctf-sidebar-tl-meta">${eventLabel} · ${formatted}</div>
        </div>
        <div class="ctf-sidebar-tl-pts" style="color:${ptsColor};">${ptsText}</div>
      </div>`;
    }).join('');

    el.innerHTML = scoreStrip + `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:8px;">Activity timeline</div>` + timelineItems;
  } catch {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);">Failed to load history.</div>';
  }
}

function openLeaderboardPanel() {
  const panel = document.getElementById('leaderboard-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  closePanel();
  panel.classList.add('open');
  loadChallengesLeaderboard();
}
function closeLeaderboardPanel() {
  document.getElementById('leaderboard-panel')?.classList.remove('open');
}

let participantTotalPoints = 0;
let participantAttemptCount = 0;

let _ctfState = 'stop';

async function loadParticipantChallenges() {
  const list = document.getElementById('challenges-list');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">Loading...</div>';
  try {
    const res = await apiFetch('/api/challenges/participant');
    const data = await res.json();
    _ctfState = data.ctf_state || 'stop';
    participantChallenges = data.challenges || data;
    participantTotalPoints = data.total_points ?? 0;
    participantAttemptCount = data.attempt_count ?? 0;
    renderCTFStateButtons(_ctfState);
    renderParticipantChallenges();
  } catch (e) {
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Failed to load challenges.</div>';
  }
}

function confirmUseHint(challengeId) {
  showConfirm({
    title: 'Use hint?',
    subtitle: 'This action cannot be undone',
    body: 'Using this hint will cost you -5 points. This action cannot be undone.',
    okLabel: 'Use hint (-5 pts)',
    onOk: () => useHint(challengeId),
  });
}

async function useHint(challengeId) {
  try {
    const res = await apiFetch(`/api/challenges/participant/${challengeId}/hint`, { method: 'POST' });
    const data = await res.json();
    if (data.hint) {
      // Update local cache
      const c = participantChallenges.find(x => x.id === challengeId);
      if (c) { c.hint_used = true; c.hint_text = data.hint; }
      // Show hint in card without full re-render
      const revealEl = document.getElementById(`ch-hint-reveal-${challengeId}`);
      const textEl = document.getElementById(`ch-hint-text-${challengeId}`);
      if (textEl) textEl.textContent = data.hint;
      if (revealEl) revealEl.style.display = '';
      // Replace "Use hint" button with "Hint used"
      const btn = document.querySelector(`button[onclick="confirmUseHint(${challengeId})"]`);
      if (btn) {
        btn.textContent = 'Hint used';
        btn.disabled = true;
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text-muted)';
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.6';
        btn.removeAttribute('onclick');
      }
      // Refresh score
      loadParticipantChallenges();
    }
  } catch {}
}

function renderParticipantChallenges() {
  const list = document.getElementById('challenges-list');
  if (!list) return;
  if (_ctfState === 'stop') {
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">The CTF has not started yet.</div>';
    updateChallengesProgressBar();
    return;
  }
  if (!participantChallenges.length) {
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">No challenges available yet.</div>';
    updateChallengesProgressBar();
    return;
  }

  const completed = participantChallenges.filter(c => c.completed).length;
  const total = participantChallenges.length;

  list.innerHTML = participantChallenges.map(c => {
    const pts = c.points ?? 50;
    const isCompleted = c.completed;
    const isLocked = c.locked;

    // Card hierarchy: pending = prominent (accent left border), locked = red warning, completed = muted/recessed
    const badgeContent = isCompleted
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : isLocked
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        : `<span style="font-size:11px;color:#fff;font-weight:700;">${c.order_num}</span>`;

    // Completed = green gradient (same as Control Center "run" semaphore); pending = left accent stripe; locked = red warning
    const cardStyle = isCompleted
      ? 'border:1px solid rgba(22,163,74,.5);border-radius:10px;padding:9px 14px;background:linear-gradient(120deg,rgba(22,163,74,.10),transparent 70%);position:relative;'
      : isLocked
        ? 'border:1px solid rgba(239,68,68,0.4);border-radius:10px;padding:11px 14px;background:rgba(239,68,68,0.04);position:relative;'
        : 'border:1px solid rgba(0,102,255,.5);border-radius:10px;padding:11px 14px;background:var(--bg-secondary);position:relative;';

    // Points badge: green for completed, normal for others
    const ptsLabel = isCompleted
      ? `<span style="font-size:11px;font-weight:700;color:#16a34a;background:rgba(22,163,74,.12);border:1px solid rgba(22,163,74,.4);padding:2px 7px;border-radius:10px;">+${c.points_earned ?? pts} pts ✓</span>`
      : `<span style="font-size:11px;font-weight:600;color:var(--text-secondary);background:var(--bg-primary);border:1px solid var(--border);padding:2px 7px;border-radius:10px;">${pts} pts</span>`;

    const labelColor = isCompleted ? '#16a34a' : isLocked ? '#ef4444' : 'var(--text-muted)';
    const titleColor = isCompleted ? '#15803d' : isLocked ? 'var(--text-muted)' : 'var(--text-primary)';
    const titleWeight = isCompleted ? '600' : '700';

    return `
    <div class="challenge-card ${isCompleted ? 'completed' : isLocked ? 'locked' : ''}" id="challenge-card-${c.id}" style="${cardStyle}transition:border-color 0.2s;">
      <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;">
            <span style="font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${labelColor};">Challenge #${c.order_num}${isCompleted ? ' ✓' : isLocked ? ' 🔒' : ''}</span>
            ${ptsLabel}
          </div>
          <div style="font-size:${isCompleted ? '13px' : '14px'};font-weight:${titleWeight};color:${titleColor};margin-bottom:${isCompleted ? '0' : '4px'};">${escHtml(c.title)}</div>
          ${c.description && !isCompleted ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:9px;white-space:pre-wrap;">${escHtml(c.description)}</div>` : ''}
          ${isCompleted
            ? ``
            : isLocked
              ? `<div id="ch-cooldown-${c.id}" data-until="${c.cooldown_until || ''}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#ef4444;background:rgba(239,68,68,0.08);padding:3px 8px;border-radius:6px;">⏳ Too many failed attempts — cooldown active</div>`
              : `<input id="ch-text-input-${c.id}" type="text" placeholder="Type your answer…" autocomplete="off" spellcheck="false" ${_ctfState !== 'run' ? 'disabled' : ''} style="margin-bottom:8px;width:100%;box-sizing:border-box;padding:7px 10px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);outline:none;" onkeydown="if(event.key==='Enter'){document.getElementById('ch-check-btn-${c.id}').click();}" />
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <button id="ch-check-btn-${c.id}" onclick="checkChallenge(${c.id}, this)" ${_ctfState !== 'run' ? 'disabled' : ''} style="padding:4px 12px;font-size:12px;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:6px;cursor:pointer;font-weight:600;${_ctfState !== 'run' ? 'opacity:0.4;cursor:not-allowed;' : ''}">Check</button>
                  ${c.retries_left !== null ? `<span style="font-size:11px;color:${c.retries_left <= 1 ? '#ef4444' : 'var(--text-secondary)'};">${c.retries_left} ${c.retries_left === 1 ? 'retry' : 'retries'} left</span>` : ''}
                  <span class="challenge-penalty-msg" style="display:none;font-size:11px;color:#ef4444;">Wrong answer — −5 pts</span>
                </div>
                ${c.has_hint ? (c.hint_used
                  ? `<button disabled style="padding:4px 12px;font-size:12px;border:1px solid var(--border);background:transparent;color:var(--text-muted);border-radius:6px;cursor:not-allowed;opacity:0.6;">Hint used</button>`
                  : _ctfState !== 'run'
                    ? `<button disabled style="padding:4px 12px;font-size:12px;border:1px solid #f59e0b;background:transparent;color:#f59e0b;border-radius:6px;cursor:not-allowed;opacity:0.4;font-weight:600;">Use hint</button>`
                    : `<button onclick="confirmUseHint(${c.id})" style="padding:4px 12px;font-size:12px;border:1px solid #f59e0b;background:transparent;color:#f59e0b;border-radius:6px;cursor:pointer;font-weight:600;">Use hint</button>`
                ) : ''}
              </div>
              ${c.hint_used ? `<div id="ch-hint-reveal-${c.id}" style="margin-top:7px;padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:12px;color:var(--text-secondary);"><strong style="color:#f59e0b;">Hint:</strong> <span id="ch-hint-text-${c.id}">${escHtml(c.hint || '')}</span></div>` : `<div id="ch-hint-reveal-${c.id}" style="display:none;margin-top:7px;padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:12px;color:var(--text-secondary);"><strong style="color:#f59e0b;">Hint:</strong> <span id="ch-hint-text-${c.id}"></span></div>`}`
          }
      </div>
    </div>`;
  }).join('');

  updateChallengesProgressBar(completed, total);
  startCooldownTickers();
}

let _cooldownTickerInterval = null;
function startCooldownTickers() {
  if (_cooldownTickerInterval) clearInterval(_cooldownTickerInterval);
  const tick = () => {
    const els = document.querySelectorAll('[id^="ch-cooldown-"][data-until]');
    if (!els.length) { clearInterval(_cooldownTickerInterval); _cooldownTickerInterval = null; return; }
    let anyActive = false;
    els.forEach(el => {
      const until = new Date(el.dataset.until).getTime();
      const remaining = until - Date.now();
      if (remaining <= 0) {
        // Cooldown expired — reload challenges
        clearInterval(_cooldownTickerInterval);
        _cooldownTickerInterval = null;
        loadParticipantChallenges();
      } else {
        anyActive = true;
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        el.textContent = `⏳ Cooldown: ${mins}:${String(secs).padStart(2, '0')} remaining`;
      }
    });
    if (!anyActive) { clearInterval(_cooldownTickerInterval); _cooldownTickerInterval = null; }
  };
  tick();
  _cooldownTickerInterval = setInterval(tick, 1000);
}

function updateChallengesProgressBar(completed, total) {
  const bar = document.getElementById('challenges-progress-bar');
  if (!bar) return;
  if (total === undefined) {
    completed = participantChallenges.filter(c => c.completed).length;
    total = participantChallenges.length;
  }
  if (total === 0) { bar.innerHTML = ''; return; }
  const pct = Math.round((completed / total) * 100);
  const penaltyLine = participantAttemptCount > 0
    ? `<span style="color:#ef4444;">−${participantAttemptCount * 5} pts penalties</span>`
    : '';
  bar.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-secondary);margin-bottom:6px;">
      <span>${completed}/${total} completed</span>
      <span style="display:flex;align-items:center;gap:8px;">
        ${penaltyLine}
        <span style="font-size:13px;font-weight:700;color:var(--accent);">${participantTotalPoints} pts</span>
      </span>
    </div>
    <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width 0.4s ease;"></div>
    </div>
  `;
}

async function checkChallenge(id, btn) {
  const textInput = document.getElementById(`ch-text-input-${id}`);
  const participant_text = textInput ? textInput.value.trim() : '';
  if (!participant_text) { textInput?.focus(); return; }
  btn.disabled = true;
  btn.textContent = 'Checking...';
  try {
    const res = await apiFetch(`/api/challenges/participant/${id}/check`, {
      method: 'POST',
      body: JSON.stringify({ participant_text })
    });
    const d = await res.json();
    if (res.status === 403 && d.error === 'ctf_not_running') {
      await loadParticipantChallenges();
      return;
    }
    if (res.status === 429) {
      await loadParticipantChallenges();
      return;
    }
    if (d.found) {
      const idx = participantChallenges.findIndex(c => c.id === id);
      if (idx >= 0) {
        participantChallenges[idx].completed = true;
        participantChallenges[idx].points_earned = d.points_earned ?? participantChallenges[idx].points ?? 50;
        participantChallenges[idx].locked = false;
        participantChallenges[idx].retries_left = null;
        participantTotalPoints += participantChallenges[idx].points_earned;
      }
      renderParticipantChallenges();
      launchFireworks();
    } else {
      participantAttemptCount++;
      participantTotalPoints -= 5;
      // Update retries_left in local cache
      const idx = participantChallenges.findIndex(c => c.id === id);
      if (idx >= 0) {
        if (d.retries_left !== undefined && d.retries_left !== null) {
          participantChallenges[idx].retries_left = d.retries_left;
          participantChallenges[idx].locked = d.retries_left === 0;
          participantChallenges[idx].cooldown_until = d.cooldown_until || null;
        }
      }
      if (d.retries_left === 0) {
        renderParticipantChallenges();
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Check';
      // Update retries counter in DOM if visible
      if (idx >= 0 && participantChallenges[idx].retries_left !== null) {
        renderParticipantChallenges();
        return;
      }
      updateChallengesProgressBar();
      const card = document.getElementById(`challenge-card-${id}`);
      if (card) {
        card.style.borderColor = '#ef4444';
        const penaltyMsg = card.querySelector('.challenge-penalty-msg');
        if (penaltyMsg) penaltyMsg.style.display = 'inline';
        setTimeout(() => {
          card.style.borderColor = 'var(--border)';
          if (penaltyMsg) penaltyMsg.style.display = 'none';
        }, 3000);
      }
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Check';
  }
}

async function loadChallengesLeaderboard() {
  const el = document.getElementById('challenges-leaderboard');
  if (!el) return;
  el.innerHTML = '<div class="lb-c-empty">Loading...</div>';
  try {
    const res = await apiFetch('/api/challenges/leaderboard');
    const { total, rows } = await res.json();
    el.innerHTML = _renderLeaderboardC(rows, total, userInfo?.code);
  } catch {
    el.innerHTML = '<div class="lb-c-empty">Failed to load leaderboard.</div>';
  }
}

function launchFireworks() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#ec4899','#06b6d4'];

  const totalFrames = 280;
  const burstSchedule = [0, 30, 60, 100, 140, 180, 220];

  function addBurst() {
    const x = canvas.width * 0.1 + Math.random() * canvas.width * 0.8;
    const y = canvas.height * 0.15 + Math.random() * canvas.height * 0.45;
    for (let i = 0; i < 70; i++) {
      const angle = (Math.PI * 2 * i) / 70;
      const speed = 3 + Math.random() * 6;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: colors[Math.floor(Math.random() * colors.length)], size: 3 + Math.random() * 3 });
    }
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (burstSchedule.includes(frame)) addBurst();
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.10;
      p.vx *= 0.99;
      p.alpha -= 0.008;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    frame++;
    if (frame < totalFrames) requestAnimationFrame(animate);
    else { canvas.remove(); }
  }
  animate();
}

// ── Changelog ─────────────────────────────────────────────
async function openChangelog() {
  document.getElementById('changelog-modal').style.display = 'flex';
  const body = document.getElementById('changelog-body');
  body.innerHTML = '<span style="color:var(--text-secondary);">Loading…</span>';
  try {
    const res = await apiFetch('/api/admin/changelog');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Parse markdown into simple HTML
    const html = data.content
      .split('\n')
      .map(line => {
        if (line.startsWith('## ')) return `<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin:16px 0 6px;">${line.slice(3)}</div>`;
        if (line.startsWith('# ')) return '';
        if (line.startsWith('- ')) return `<div style="padding:2px 0 2px 12px;border-left:2px solid var(--border);">${line.slice(2)}</div>`;
        if (line.trim() === '') return '';
        return `<div>${line}</div>`;
      })
      .join('');
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<span style="color:#ef4444;">Error: ${e.message}</span>`;
  }
}

// ── About ──
async function loadAboutVersion() {
  const el = document.getElementById('about-version-local');
  if (!el) return;
  try {
    const res = await apiFetch('/api/admin/version');
    const data = res.ok ? await res.json() : null;
    el.textContent = data?.version || 'unknown';
  } catch { el.textContent = 'unknown'; }
}
