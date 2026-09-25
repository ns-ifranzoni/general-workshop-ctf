// Challenge CSV format shared by import, export and the bundled template:
//   seq,title,description,flag,points,hint,visible

const CSV_HEADER = 'seq,title,description,flag,points,hint,visible';

// RFC 4180-style parser: quoted fields may contain commas, "" and newlines.
// Returns an array of objects keyed by the lowercased header names.
function parseCsv(text) {
  const records = [];
  let row = [], field = '', inQuotes = false;
  const src = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      records.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }

  const nonEmpty = records.filter(r => r.some(v => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map(h => h.trim().toLowerCase());
  return nonEmpty.slice(1).map(cols =>
    Object.fromEntries(header.map((h, i) => [h, (cols[i] ?? '').trim()]))
  );
}

function challengeFromCsvRow(row) {
  const title = row.title;
  if (!title) return null;
  const points = parseInt(row.points, 10);
  return {
    title,
    description: row.description || '',
    flag: row.flag || null,
    points: Number.isFinite(points) && points >= 0 ? points : 50,
    hint: row.hint || null,
    visible: row.visible === undefined || row.visible === '' ? 1 : (parseInt(row.visible, 10) ? 1 : 0),
  };
}

const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

function challengeToCsvLine(c, i) {
  return [i + 1, esc(c.title), esc(c.description), esc(c.flag), c.points, esc(c.hint), c.visible].join(',');
}

module.exports = { CSV_HEADER, parseCsv, challengeFromCsvRow, challengeToCsvLine };
