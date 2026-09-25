const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const pinoHttp = require('pino-http');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(pinoHttp({ logger, autoLogging: false }));

// CORS: allow only the explicitly configured origin (defaults to same-origin / disabled).
// Set ALLOWED_ORIGIN=https://your-domain.com when the API is accessed from a different host.
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
// Make browsers revalidate the app files on every load (a cheap 304 when
// unchanged), so an updated container is picked up without a hard refresh.
const noCache = res => res.setHeader('Cache-Control', 'no-cache');
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => { if (/\.(html|js|css|json)$/.test(filePath)) noCache(res); },
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/challenges', require('./routes/challenges'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  noCache(res);
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  logger.info(`General Workshop CTF running at http://localhost:${PORT}`);
  logger.info('Default admin username: ADMIN-2026 (no default password — set one on first sign-in)');
});
