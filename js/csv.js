/* Kontoauszug-Import: liest die CSV-Exporte deutscher Banken (Sparkasse, DKB, ING,
   N26, Comdirect, Volksbank …). Spalten werden über die Überschriften erkannt. */
window.BankCSV = (() => {
  'use strict';

  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }

  function detectDelim(text) {
    const lines = text.split(/\r?\n/).slice(0, 40);
    let best = ';', bestScore = -1;
    for (const d of [';', '\t', ',']) {
      const counts = lines.map((l) => l.split(d).length - 1).filter((n) => n > 0);
      if (!counts.length) continue;
      const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
      const score = counts.filter((n) => n === mode).length * Math.min(mode, 12);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function splitRows(text, delim) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
  }

  const norm = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();

  const DATE_KEYS = ['buchungstag', 'buchungsdatum', 'datum', 'date', 'booking date', 'buchung', 'valutadatum', 'wertstellung', 'valuta'];
  const TEXT_KEYS = ['beguenstigter', 'zahlungspflichtiger', 'zahlungsempfaenger', 'empfaenger', 'auftraggeber', 'payee', 'partner', 'name', 'verwendungszweck', 'buchungstext', 'beschreibung', 'description', 'reference', 'umsatzart'];

  // Überschrift passt, wenn sie mit dem Schlüssel beginnt (z. B. "Buchungstag", "Booking Date")
  const isKey = (h, k) => h === k || h.startsWith(k + ' ') || h.startsWith(k + '(');
  function findCol(head, keys) {
    for (const k of keys) {
      const i = head.findIndex((h) => isKey(h, k));
      if (i >= 0) return i;
    }
    return -1;
  }

  function parseAmount(s) {
    if (!s) return NaN;
    let v = s.replace(/\s|€|eur/gi, '');
    let neg = false;
    if (/^-|^−/.test(v)) { neg = true; v = v.slice(1); }
    if (/-$/.test(v)) { neg = true; v = v.slice(0, -1); }
    if (/^\+/.test(v)) v = v.slice(1);
    const lc = v.lastIndexOf(','), ld = v.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) v = lc > ld ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    else if (lc >= 0) v = v.replace(',', '.');
    else if (ld >= 0 && /\.\d{3}$/.test(v)) v = v.replace(/\./g, '');
    const n = Math.round(parseFloat(v) * 100);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }

  function parseDate(s) {
    if (!s) return null;
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1], 12); }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12);
    return null;
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function parse(text) {
    const delim = detectDelim(text);
    const rows = splitRows(text, delim);
    let hi = -1, head = null;
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
      const h = rows[i].map(norm);
      if (h.length < 3) continue;
      const hasDate = DATE_KEYS.some((k) => h.some((c) => isKey(c, k)));
      const hasAmt = h.some((c) => /betrag|amount|umsatz/.test(c) && !/saldo|waehrung|currency/.test(c)) ||
        (h.some((c) => c === 'soll' || c.startsWith('soll ')) && h.some((c) => c === 'haben' || c.startsWith('haben ')));
      if (hasDate && hasAmt) { hi = i; head = h; break; }
    }
    if (hi < 0) return { rows: [], error: 'Ich habe keine Spalten für Datum und Betrag gefunden.' };

    const cDate = findCol(head, DATE_KEYS);
    let cAmt = head.findIndex((h) => /betrag|amount/.test(h) && !/saldo|waehrung|currency|ursprung|original|fremd/.test(h));
    if (cAmt < 0) cAmt = head.findIndex((h) => /umsatz/.test(h) && !/art|saldo/.test(h));
    const cSoll = head.findIndex((h) => h === 'soll' || h.startsWith('soll '));
    const cHaben = head.findIndex((h) => h === 'haben' || h.startsWith('haben '));
    const cText = [];
    for (const k of TEXT_KEYS) head.forEach((h, i) => { if (h.includes(k) && !cText.includes(i) && i !== cDate && i !== cAmt) cText.push(i); });

    const out = [], seen = {};
    for (const r of rows.slice(hi + 1)) {
      const date = parseDate(r[cDate] || '');
      let amount = NaN;
      if (cAmt >= 0) amount = parseAmount(r[cAmt]);
      else {
        const s = parseAmount(r[cSoll]) || 0, h = parseAmount(r[cHaben]) || 0;
        amount = Math.abs(h) - Math.abs(s);
      }
      if (!date || !amount || isNaN(amount)) continue;
      const parts = [];
      for (const i of cText.slice(0, 3)) {
        const v = (r[i] || '').replace(/\s+/g, ' ').trim();
        if (!v || parts.some((p) => p.includes(v))) continue;
        const shorter = parts.findIndex((p) => v.includes(p));
        if (shorter >= 0) parts[shorter] = v; else parts.push(v);
      }
      const textOut = parts.join(' · ').slice(0, 120) || 'Buchung';
      // gleiche Buchung am selben Tag (z. B. zwei Kaffees) bekommt einen Zähler
      const base = hash(date.toDateString() + '|' + amount + '|' + textOut);
      seen[base] = (seen[base] || 0) + 1;
      out.push({ date: date.toISOString(), amount, text: textOut, key: 'csv:' + base + '#' + seen[base] });
    }
    if (!out.length) return { rows: [], error: 'Keine Buchungen in der Datei gefunden.' };
    return { rows: out };
  }

  return { decode, parse, parseAmount };
})();
