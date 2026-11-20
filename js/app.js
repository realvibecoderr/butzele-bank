/* Butzele Bank – App-Logik: Daten, Stimmung, Ansichten. Alles bleibt lokal im Browser. */
(function () {
  'use strict';

  const KEY = 'butzele-bank-v1';
  const DAY = 864e5;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const fmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const euro = (c) => fmt.format(c / 100);
  const euroS = (c) => (c % 100 === 0 ? fmt0 : fmt).format(c / 100);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const daysAgo = (iso) => Math.round((startOfDay(Date.now()) - startOfDay(iso)) / DAY);
  const relDay = (iso) => { const n = daysAgo(iso); return n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`; };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fromYmd = (s) => {
    if (!s || s === ymd(new Date())) return new Date().toISOString();
    const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString();
  };
  const dayLabel = (iso) => {
    const n = daysAgo(iso);
    if (n === 0) return 'Heute';
    if (n === 1) return 'Gestern';
    return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: n > 300 ? 'numeric' : undefined });
  };
  const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }); };

  function parseAmount(s) {
    s = String(s || '').trim().replace(/\s|€/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return Math.round(parseFloat(s) * 100);
  }

  // ---------- Daten ----------
  const DEFAULT_STASHES = [
    { name: 'Lebensmittel', emoji: '🛒', budget: 30000, kw: 'rewe edeka aldi lidl netto penny kaufland tegut norma denns alnatura' },
    { name: 'Kaffee', emoji: '☕', budget: 4000, kw: 'starbucks coffee kaffee café cafe bäckerei baeckerei espresso' },
    { name: 'Essen gehen', emoji: '🍔', budget: 12000, kw: 'lieferando wolt restaurant mcdonald burger pizza döner doener sushi uber eats' },
    { name: 'Shopping', emoji: '🛍️', budget: 10000, kw: 'amazon zalando h&m zara ikea otto dm rossmann about you' },
    { name: 'Mobilität', emoji: '🚗', budget: 8000, kw: 'deutsche bahn db vertrieb bvg mvg hvv uber bolt aral shell esso tankstelle' },
    { name: 'Spaß', emoji: '🎉', budget: 7000, kw: 'spotify netflix kino steam playstation disney eventim' },
  ];
  const GOAL_EMOJI = ['🏠', '💻', '✈️', '🚲', '🚗', '💍', '🎮', '📱', '🎓', '🏖️', '🐶', '🎸', '🛋️', '🧳', '🎁', '🛟'];
  const STASH_EMOJI = ['🛒', '☕', '🍔', '🛍️', '🚗', '🎉', '🏠', '💊', '🐶', '📚', '💡', '🎁', '🍺', '💇', '🏋️', '📱'];
  const GOAL_COLORS = ['#36B873', '#F2BE4B', '#E4675A', '#7C9CE0', '#C07AE0', '#F08BB0'];

  function fresh() {
    return {
      v: 1, dogName: 'Butzele', sound: true, onboarded: false,
      createdAt: new Date().toISOString(), cycleStart: new Date().toISOString(),
      stashes: DEFAULT_STASHES.map((s) => ({ id: uid(), ...s })), goals: [], tx: [],
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); return Object.assign(fresh(), s); }
    } catch (e) { /* kaputte Daten → frisch starten */ }
    return fresh();
  }
  let S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Speichern fehlgeschlagen – ist der Speicher voll?'); }
  }

  function calc() {
    const goalIds = new Set(S.goals.map((g) => g.id));
    const goalSaved = {}, spent = {};
    let saved = 0, free = 0, lastDep = null;
    const cs = S.cycleStart;
    for (const t of S.tx) {
      if (t.type === 'deposit' || t.type === 'withdraw') {
        const v = t.type === 'deposit' ? t.amount : -t.amount;
        saved += v;
        if (t.goalId && goalIds.has(t.goalId)) goalSaved[t.goalId] = (goalSaved[t.goalId] || 0) + v; else free += v;
        if (t.type === 'deposit' && (!lastDep || t.date > lastDep)) lastDep = t.date;
      } else if (t.type === 'expense' && t.date >= cs) {
        const k = t.stashId || '_none';
        spent[k] = (spent[k] || 0) + t.amount;
      }
    }
    const budget = S.stashes.reduce((a, s) => a + s.budget, 0);
    const spentTotal = Object.values(spent).reduce((a, b) => a + b, 0);
    return { saved, free, goalSaved, spent, lastDep, budget, spentTotal };
  }

  // Woche beginnt Montag
  function weekStart(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function streak() {
    const weeks = new Set(S.tx.filter((t) => t.type === 'deposit').map((t) => weekStart(t.date).getTime()));
    const cur = weekStart(Date.now());
    const thisWeek = weeks.has(cur.getTime());
    const w = new Date(cur); if (!thisWeek) w.setDate(w.getDate() - 7);
    let n = 0;
    while (weeks.has(w.getTime())) { n++; w.setDate(w.getDate() - 7); }
    const last = [];
    const x = new Date(cur); x.setDate(x.getDate() - 7 * 7);
    for (let i = 0; i < 8; i++) { last.push({ on: weeks.has(x.getTime()), cur: i === 7, label: x.getDate() + '.' + (x.getMonth() + 1) + '.' }); x.setDate(x.getDate() + 7); }
    return { n, thisWeek, last };
  }

  const MOODS = [
    { label: 'Sehr traurig', lines: (d, n) => [`Seit ${d} Tagen keine Einzahlung… es regnet in meinem Körbchen.`, 'Hast du mich vergessen? 🥺', `Ein kleines Sparli würde ${n} retten.`] },
    { label: 'Traurig', lines: (d) => [`Schon ${d} Tage nichts… ich warte hier.`, 'Mein Napf ist so leer. 🥺', 'Nur 5 € und ich steh wieder auf!'] },
    { label: 'Zufrieden', lines: () => ['Alles okay. Ein Sparli wär trotzdem schön.', 'Ich schnupper schon mal, ob was kommt.', 'Wuff. Ganz entspannt hier.'] },
    { label: 'Glücklich', lines: () => ['Schwanz wedelt auf Hochtouren!', 'Gut gespart! Leckerli?', 'Wir zwei sind ein gutes Team.'] },
    { label: 'Überglücklich', lines: () => ['WUFF! Du bist großartig!', 'Mein Herz und mein Napf sind voll!', 'Noch ein Sparli und ich mach Zoomies!'] },
  ];

  function mood(c, st) {
    const ref = c.lastDep || S.createdAt;
    const d = daysAgo(ref);
    let lvl;
    if (!c.lastDep) lvl = d <= 4 ? 2 : d <= 12 ? 1 : 0;
    else lvl = d === 0 ? 4 : d <= 3 ? 3 : d <= 7 ? 2 : d <= 14 ? 1 : 0;
    if (lvl === 3 && st.n >= 4) lvl = 4;
    const over = S.stashes.filter((s) => (c.spent[s.id] || 0) > s.budget);
    if (over.length && lvl > 1) lvl--;
    return { lvl, days: d, over, first: !c.lastDep };
  }
  function moodLine(md) {
    if (md.first && md.lvl >= 2) return `Füttere mich mit deiner ersten Einzahlung! 🪙`;
    if (md.over.length && Math.random() < 0.5) return `Der Napf „${md.over[0].name}“ ist übergelaufen… 😬`;
    return pick(MOODS[md.lvl].lines(md.days, S.dogName));
  }

  function goalInfo(g, saved) {
    const pct = g.target ? clamp(saved / g.target, 0, 1) : 0;
    let status = 'open', perMonth = 0;
    if (saved >= g.target) status = 'done';
    else if (g.date) {
      const [y, m] = g.date.split('-').map(Number);
      const end = new Date(y, m, 0, 23, 59).getTime(), start = new Date(g.createdAt).getTime(), now = Date.now();
      const monthsLeft = Math.max(1, (y - new Date().getFullYear()) * 12 + (m - 1 - new Date().getMonth()) + 1);
      perMonth = Math.ceil((g.target - saved) / monthsLeft / 100) * 100;
      if (now >= end) status = 'late';
      else status = pct >= (now - start) / Math.max(1, end - start) - 0.02 ? 'ok' : 'behind';
    }
    return { pct, status, perMonth };
  }

  // ---------- Hund ----------
  const dog = new Butzele.Dog($('#dogCanvas'), {
    onEvent: (e) => { if (e === 'coin') Sfx.coin(); if (e === 'jump') Sfx.bark(); if (e === 'party') Sfx.party(); },
  });
  Sfx.enabled = S.sound;

  function fitCanvas(cv, maxW) {
    const dpr = window.devicePixelRatio || 1;
    const avail = Math.min(maxW || 9999, cv.parentElement.clientWidth);
    const scale = Math.max(1, Math.floor(avail * dpr / Butzele.W)) / dpr;
    cv.style.width = Butzele.W * scale + 'px';
    cv.style.height = Butzele.H * scale + 'px';
  }

  let bubbleTimer = 0;
  function bubble(text, ms = 3600) {
    const b = $('#bubble');
    b.textContent = text; b.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove('show'), ms);
  }

  const PET_LINES = {
    hi: ['Hihi, das kitzelt!', 'Mehr kraulen! 🐾', '♥ ♥ ♥', 'Wuff wuff!'],
    mid: ['Wuff?', 'Kraulen ist gut. Sparen ist besser.', '*wedel wedel*'],
    lo: ['Kraulen hilft… ein bisschen.', '*schnief*', 'Ein Sparli wär schöner. 🥺'],
  };
  let lastPet = 0;
  $('#dogCanvas').addEventListener('click', () => {
    const now = Date.now(); if (now - lastPet < 500) return; lastPet = now;
    dog.react('pet'); Sfx.pet();
    const l = dog.mood >= 3 ? PET_LINES.hi : dog.mood === 2 ? PET_LINES.mid : PET_LINES.lo;
    bubble(pick(l), 2200);
  });

  // ---------- Icons ----------
  const ICON = {
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    edit: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    upload: '<svg class="i" viewBox="0 0 24 24"><path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4"/></svg>',
  };
  const PIXEL_HEART = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/></svg>';

  // ---------- Ansichten ----------
  let tab = 'home', histFilter = 'all';

  function render() {
    const c = calc(), st = streak(), md = mood(c, st);
    dog.setMood(md.lvl);
    renderDogCard(c, st, md);
    $('#dogCard').hidden = tab !== 'home';
    const v = $('#view');
    v.innerHTML = tab === 'home' ? homeHTML(c, st, md) : tab === 'stashes' ? stashesHTML(c) : tab === 'goals' ? goalsHTML(c) : historyHTML();
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'home') fitCanvas($('#dogCanvas'), 520);
  }

  function renderDogCard(c, st, md) {
    const card = $('#dogCard');
    card.className = 'dog-card mood-' + md.lvl;
    $('#moodPill').textContent = `${S.dogName} ist ${MOODS[md.lvl].label.toLowerCase()}`;
    $('#hearts').innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="ph ${i <= md.lvl ? 'on' : ''}">${PIXEL_HEART}</span>`).join('');
    $('#hearts').setAttribute('aria-label', `Stimmung ${md.lvl + 1} von 5`);
    $('#totalSaved').textContent = euro(c.saved);
    $('#totalSub').textContent = c.lastDep ? `gespart · letzte Einzahlung ${relDay(c.lastDep)}` : 'gespart · noch keine Einzahlung';
    $('#streakBadge').innerHTML = `<span class="flame">🔥</span><b>${st.n}</b>`;
    $('#streakBadge').title = `${st.n} Wochen Spar-Serie`;
  }

  function homeHTML(c, st, md) {
    const remain = c.budget - c.spentTotal;
    const rp = c.budget ? clamp(remain / c.budget, 0, 1) : 0;
    const streakText = st.thisWeek ? 'Diese Woche schon gespart – stark!' : st.n > 0 ? 'Zahl diese Woche noch ein, sonst reißt die Serie! ⏳' : 'Spar jede Woche etwas und bau eine Serie auf.';
    const goals = S.goals.slice(0, 3);
    return `
      <div class="actions">
        <button class="btn btn-primary btn-xl" data-action="deposit"><span aria-hidden="true">🐾</span> Einzahlen</button>
        <button class="btn btn-soft btn-xl" data-action="expense">Ausgabe</button>
      </div>

      <section class="card streak-card">
        <div class="row">
          <div class="streak-num"><span>🔥</span>${st.n}</div>
          <div class="grow">
            <div class="h3">${st.n === 1 ? '1 Woche' : st.n + ' Wochen'} Spar-Serie</div>
            <div class="muted">${streakText}</div>
          </div>
        </div>
        <div class="weeks">${st.last.map((w) => `<div class="wk ${w.on ? 'on' : ''} ${w.cur ? 'cur' : ''}"><i></i><small>${w.cur ? 'jetzt' : w.label}</small></div>`).join('')}</div>
      </section>

      <button class="card link-card" data-action="tab" data-tab="stashes">
        <div class="row between">
          <div>
            <div class="eyebrow">Diesen Zyklus noch frei</div>
            <div class="h2 ${remain < 0 ? 'neg' : ''}">${euro(remain)}</div>
          </div>
          <div class="muted right">von ${euroS(c.budget)}<br>seit ${new Date(S.cycleStart).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</div>
        </div>
        <div class="bar"><i class="${barClass(rp)}" style="width:${rp * 100}%"></i></div>
      </button>

      <div class="section-title"><span>Deine Ziele</span>${S.goals.length ? '<button class="link" data-action="tab" data-tab="goals">Alle</button>' : ''}</div>
      ${goals.length ? goals.map((g) => {
        const s = c.goalSaved[g.id] || 0, gi = goalInfo(g, s);
        return `<button class="card goal-mini" data-action="deposit" data-goal="${g.id}">
          <span class="tile">${g.emoji}</span>
          <span class="grow"><span class="row between"><b>${esc(g.name)}</b><span class="muted">${euroS(s)} / ${euroS(g.target)}</span></span>
          <span class="bar"><i style="width:${gi.pct * 100}%;background:${g.color}"></i></span></span>
        </button>`;
      }).join('') : `<button class="card empty" data-action="new-goal"><span class="tile">🎯</span><span><b>Erstes Sparziel anlegen</b><br><span class="muted">Urlaub, Laptop, Notgroschen … ${esc(S.dogName)} hilft beim Durchhalten.</span></span></button>`}
    `;
  }

  function barClass(p) { return p > 0.5 ? '' : p > 0.2 ? 'mid' : 'low'; }

  function stashesHTML(c) {
    const remain = c.budget - c.spentTotal;
    const none = c.spent._none || 0;
    return `
      <section class="card dark-card">
        <div class="eyebrow">Noch frei in diesem Zyklus</div>
        <div class="big ${remain < 0 ? 'neg' : ''}">${euro(remain)}</div>
        <div class="muted-l">von ${euroS(c.budget)} · seit ${new Date(S.cycleStart).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</div>
        <button class="btn btn-payday" data-action="payday">Zahltag! 💸</button>
      </section>

      <div class="section-title"><span>Deine Näpfe</span><button class="link" data-action="new-stash">+ Napf</button></div>
      <div class="list">
        ${S.stashes.map((s) => {
          const sp = c.spent[s.id] || 0, left = s.budget - sp, p = s.budget ? clamp(left / s.budget, 0, 1) : 0;
          return `<div class="stash">
            <button class="stash-main" data-action="expense" data-stash="${s.id}" aria-label="Ausgabe für ${esc(s.name)} eintragen">
              <span class="tile">${s.emoji}</span>
              <span class="grow">
                <span class="name">${esc(s.name)}</span>
                <span class="muted small">${euroS(sp)} ausgegeben · ${euroS(s.budget)} im Napf</span>
                <span class="bar"><i class="${barClass(p)}" style="width:${p * 100}%"></i></span>
              </span>
              <span class="right"><b class="${left < 0 ? 'neg' : ''}">${euroS(left)}</b><small class="pct ${barClass(p)}">${Math.round(p * 100)} %</small></span>
            </button>
            <button class="icon-btn ghost" data-action="edit-stash" data-id="${s.id}" aria-label="${esc(s.name)} bearbeiten">${ICON.edit}</button>
          </div>`;
        }).join('')}
        ${none ? `<div class="muted small pad">Ohne Napf: ${euro(none)} ausgegeben</div>` : ''}
      </div>
      <p class="hint">Tippe auf einen Napf, um eine Ausgabe einzutragen. Am Zahltag werden alle Näpfe wieder aufgefüllt.</p>
    `;
  }

  function goalsHTML(c) {
    if (!S.goals.length) {
      return `<section class="card empty-big">
        <div class="emoji-xl">🎯</div>
        <div class="h2">Noch keine Sparziele</div>
        <p class="muted">Leg ein Ziel an – ${esc(S.dogName)} feiert jede Einzahlung mit dir und dreht durch, wenn du es erreichst.</p>
        <button class="btn btn-primary" data-action="new-goal">Ziel anlegen</button>
      </section>`;
    }
    const infos = S.goals.map((g) => goalInfo(g, c.goalSaved[g.id] || 0));
    const behind = infos.filter((i) => i.status === 'behind' || i.status === 'late').length;
    const banner = behind === 0
      ? `<div class="banner ok"><span class="emoji">🐶</span><div><b>Du bist auf Kurs! 🎉</b><br>${S.goals.length} ${S.goals.length === 1 ? 'Ziel' : 'Ziele'} · ${esc(S.dogName)} bleibt happy</div></div>`
      : `<div class="banner warn"><span class="emoji">🥺</span><div><b>${behind} ${behind === 1 ? 'Ziel braucht' : 'Ziele brauchen'} Futter</b><br>Ein kleines Sparli bringt dich zurück auf Kurs.</div></div>`;
    return banner + S.goals.map((g, i) => {
      const s = c.goalSaved[g.id] || 0, gi = infos[i];
      const sub = gi.status === 'done' ? 'Erreicht! 🏆' : gi.status === 'late' ? 'Zieldatum vorbei' : g.date ? `noch ca. ${euroS(gi.perMonth)} pro Monat` : 'ohne Zieldatum';
      return `<section class="card goal" style="--gc:${g.color}">
        <div class="row between">
          <div class="row"><span class="tile">${g.emoji}</span><div><div class="h3">${esc(g.name)}</div><div class="muted small">${g.date ? 'Ziel: ' + monthLabel(g.date) : 'Kein Datum'}</div></div></div>
          <button class="icon-btn ghost" data-action="edit-goal" data-id="${g.id}" aria-label="${esc(g.name)} bearbeiten">${ICON.edit}</button>
        </div>
        <div class="row between amounts"><b>${euro(s)} gespart</b><span class="muted">${euroS(g.target)} Ziel</span></div>
        <div class="bar thick"><i style="width:${gi.pct * 100}%;background:${g.color}"></i></div>
        <div class="row between small"><span class="muted">${Math.floor(gi.pct * 100)} % geschafft</span><span class="muted">${sub}</span></div>
        <button class="btn btn-mint btn-block" data-action="deposit" data-goal="${g.id}">${ICON.plus} Geld einzahlen</button>
      </section>`;
    }).join('') + `<button class="btn btn-soft btn-block" data-action="new-goal">${ICON.plus} Neues Ziel</button>`;
  }

  function txMeta(t) {
    const g = t.goalId && S.goals.find((x) => x.id === t.goalId);
    const s = t.stashId && S.stashes.find((x) => x.id === t.stashId);
    if (t.type === 'deposit') return { icon: g ? g.emoji : '🪙', title: t.note || (g ? g.name : 'Freies Sparen'), sub: 'Einzahlung' + (g && t.note ? ' · ' + g.name : ''), sign: '+', cls: 'pos' };
    if (t.type === 'withdraw') return { icon: g ? g.emoji : '🪙', title: t.note || (g ? g.name : 'Freies Sparen'), sub: 'Entnahme' + (g && t.note ? ' · ' + g.name : ''), sign: '−', cls: 'wd' };
    return { icon: s ? s.emoji : '💸', title: t.note || (s ? s.name : 'Ausgabe'), sub: 'Ausgabe' + (s ? ' · ' + s.name : ''), sign: '−', cls: '' };
  }

  function historyHTML() {
    const list = S.tx.filter((t) => histFilter === 'all' || (histFilter === 'save' ? t.type !== 'expense' : t.type === 'expense'))
      .slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const groups = [];
    for (const t of list) {
      const k = ymd(t.date);
      if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, label: dayLabel(t.date), items: [] });
      groups[groups.length - 1].items.push(t);
    }
    return `
      <div class="row between hist-top">
        <div class="chips tight">
          ${[['all', 'Alle'], ['save', 'Sparen'], ['spend', 'Ausgaben']].map(([k, l]) => `<button class="chip ${histFilter === k ? 'on' : ''}" data-action="filter" data-f="${k}">${l}</button>`).join('')}
        </div>
        <button class="btn btn-soft btn-sm" data-action="import">${ICON.upload} CSV</button>
      </div>
      ${groups.length ? groups.map((g) => `
        <div class="section-title"><span>${g.label}</span></div>
        <div class="card list-card">
          ${g.items.map((t) => { const m = txMeta(t); return `<button class="tx" data-action="tx" data-id="${t.id}">
            <span class="tile sm">${m.icon}</span>
            <span class="grow"><span class="name">${esc(m.title)}</span><span class="muted small">${esc(m.sub)}${t.source === 'csv' ? ' · Import' : ''}</span></span>
            <b class="amt ${m.cls}">${m.sign}${euro(t.amount)}</b></button>`; }).join('')}
        </div>`).join('') : `<section class="card empty-big"><div class="emoji-xl">📜</div><div class="h3">Noch keine Buchungen</div><p class="muted">Trag eine Einzahlung ein oder importier den CSV-Export deiner Bank.</p></section>`}
    `;
  }

  // ---------- Sheets ----------
  function openSheet(title, body, onMount) {
    const root = document.createElement('div');
    root.className = 'sheet-backdrop';
    root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grabber"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn ghost" data-close aria-label="Schließen">${ICON.x}</button></div>
      <div class="sheet-body">${body}</div></div>`;
    const close = () => { root.classList.add('closing'); setTimeout(() => root.remove(), 200); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) close(); });
    document.body.appendChild(root);
    if (onMount) onMount(root.querySelector('.sheet'), close);
    return close;
  }

  function choiceGroup(sheet, sel, initial, onChange) {
    let val = initial;
    const items = $$(sel, sheet);
    const paint = () => items.forEach((b) => b.classList.toggle('on', b.dataset.val === val));
    items.forEach((b) => b.addEventListener('click', () => { val = b.dataset.val; paint(); onChange && onChange(val); }));
    paint();
    return () => val;
  }

  function amountField(sheet) {
    const inp = $('[name=amount]', sheet);
    $$('[data-add]', sheet).forEach((b) => b.addEventListener('click', () => {
      const cur = parseAmount(inp.value) || 0;
      inp.value = String((cur + Number(b.dataset.add) * 100) / 100).replace('.', ',');
      inp.classList.remove('err');
    }));
    return inp;
  }
  function shake(el) { el.classList.remove('err'); void el.offsetWidth; el.classList.add('err'); el.focus(); }

  const AMOUNT_FIELD = (chips) => `
    <label class="amount-field"><input name="amount" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="Betrag in Euro"><span>€</span></label>
    <div class="chips center">${chips.map((v) => `<button type="button" class="chip" data-add="${v}">+${v} €</button>`).join('')}</div>`;

  function depositSheet({ goalId = '', mode = 'deposit' } = {}) {
    const goalChoices = [`<button type="button" class="choice" data-val=""><span>🪙</span>Freies Sparen</button>`]
      .concat(S.goals.map((g) => `<button type="button" class="choice" data-val="${g.id}"><span>${g.emoji}</span>${esc(g.name)}</button>`)).join('');
    openSheet('Sparen', `
      <div class="seg"><button type="button" data-val="deposit">Einzahlen</button><button type="button" data-val="withdraw">Entnehmen</button></div>
      <form autocomplete="off">
        ${AMOUNT_FIELD([5, 10, 20, 50, 100])}
        <div class="field-label" id="whereLbl">Wohin?</div>
        <div class="choices">${goalChoices}</div>
        <label class="field"><span>Notiz (optional)</span><input name="note" maxlength="60" placeholder="z. B. Rest vom Monat"></label>
        <label class="field"><span>Datum</span><input name="date" type="date" value="${ymd(new Date())}" max="${ymd(new Date())}"></label>
        <button class="btn btn-primary btn-block btn-xl" type="submit" id="goBtn">Einzahlen 🐾</button>
      </form>`, (sh, close) => {
      const inp = amountField(sh);
      const getMode = choiceGroup(sh, '.seg button', mode, (m) => {
        $('#whereLbl', sh).textContent = m === 'deposit' ? 'Wohin?' : 'Woher?';
        $('#goBtn', sh).textContent = m === 'deposit' ? 'Einzahlen 🐾' : 'Entnehmen';
        $('#goBtn', sh).className = 'btn btn-block btn-xl ' + (m === 'deposit' ? 'btn-primary' : 'btn-coral');
      });
      if (mode === 'withdraw') $$('.seg button', sh)[1].click();
      const getGoal = choiceGroup(sh, '.choice', goalId);
      setTimeout(() => inp.focus(), 250);
      $('form', sh).addEventListener('submit', (e) => {
        e.preventDefault();
        const cents = parseAmount(inp.value);
        if (!(cents > 0) || cents > 1e10) return shake(inp);
        const m = getMode(), gid = getGoal() || null, c = calc();
        const avail = gid ? (c.goalSaved[gid] || 0) : c.free;
        if (m === 'withdraw' && cents > avail) { toast(`Da sind nur ${euro(avail)} drin.`); return shake(inp); }
        const before = gid ? (c.goalSaved[gid] || 0) : 0;
        S.tx.push({ id: uid(), type: m, amount: cents, date: fromYmd($('[name=date]', sh).value), goalId: gid, note: $('[name=note]', sh).value.trim(), source: 'manual' });
        save(); close();
        if (m === 'deposit') celebrateDeposit(cents, gid, before);
        else { goHome(); dog.react('expense'); Sfx.oops(); bubble('Oh… okay. Gib gut drauf acht. 🥺'); render(); }
      });
    });
  }

  function goHome() { if (tab !== 'home') { tab = 'home'; render(); } window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function celebrateDeposit(cents, gid, before) {
    goHome();
    const g = gid && S.goals.find((x) => x.id === gid);
    const after = g ? (calc().goalSaved[g.id] || 0) : 0;
    if (g && before < g.target && after >= g.target) {
      dog.react('party');
      bubble(`Ziel „${g.name}“ erreicht! 🏆`, 4800);
    } else {
      dog.react('deposit');
      bubble(pick([`Wuff! +${euroS(cents)} 🪙`, `Lecker Sparli! +${euroS(cents)}`, `Mehr davon! +${euroS(cents)}`, `+${euroS(cents)}! Schwanzwedeln!`]), 3600);
    }
    render();
  }

  function expenseSheet(stashId = '') {
    const ch = S.stashes.map((s) => `<button type="button" class="choice" data-val="${s.id}"><span>${s.emoji}</span>${esc(s.name)}</button>`).join('')
      + `<button type="button" class="choice" data-val=""><span>💸</span>Ohne Napf</button>`;
    openSheet('Ausgabe eintragen', `
      <form autocomplete="off">
        ${AMOUNT_FIELD([2, 5, 10, 20, 50])}
        <div class="field-label">Aus welchem Napf?</div>
        <div class="choices">${ch}</div>
        <label class="field"><span>Notiz (optional)</span><input name="note" maxlength="60" placeholder="z. B. Cappuccino"></label>
        <label class="field"><span>Datum</span><input name="date" type="date" value="${ymd(new Date())}" max="${ymd(new Date())}"></label>
        <button class="btn btn-ink btn-block btn-xl" type="submit">Eintragen</button>
      </form>`, (sh, close) => {
      const inp = amountField(sh);
      const getStash = choiceGroup(sh, '.choice', stashId || (S.stashes[0] ? S.stashes[0].id : ''));
      setTimeout(() => inp.focus(), 250);
      $('form', sh).addEventListener('submit', (e) => {
        e.preventDefault();
        const cents = parseAmount(inp.value);
        if (!(cents > 0) || cents > 1e10) return shake(inp);
        const sid = getStash() || null;
        S.tx.push({ id: uid(), type: 'expense', amount: cents, date: fromYmd($('[name=date]', sh).value), stashId: sid, note: $('[name=note]', sh).value.trim(), source: 'manual' });
        save(); close();
        const c = calc(), st = S.stashes.find((s) => s.id === sid);
        const over = st && (c.spent[st.id] || 0) > st.budget;
        Sfx.oops();
        if (tab === 'home') {
          dog.react('expense', { big: over });
          bubble(over ? `Autsch! „${st.name}“ ist leer… 😬` : pick(['Hmpf. Okay.', '*zuckt kurz zusammen*', 'War das wirklich nötig? 👀', 'Notiert. Ich behalt das im Auge.']));
        } else toast(over ? `„${st.name}“ ist überzogen 😬` : `Eingetragen · ${S.dogName} zuckt kurz zusammen`);
        render();
      });
    });
  }

  function emojiPicker(list, cur) {
    return `<div class="emoji-grid">${list.map((e) => `<button type="button" class="emo" data-val="${e}">${e}</button>`).join('')}</div>`;
  }

  function goalSheet(id) {
    const g = S.goals.find((x) => x.id === id);
    openSheet(g ? 'Ziel bearbeiten' : 'Neues Sparziel', `
      <form autocomplete="off">
        <label class="field"><span>Name</span><input name="name" maxlength="30" required placeholder="z. B. Barcelona" value="${esc(g ? g.name : '')}"></label>
        <div class="field-label">Symbol</div>
        ${emojiPicker(GOAL_EMOJI)}
        <label class="field"><span>Zielbetrag</span><input name="target" inputmode="decimal" required placeholder="1.000" value="${g ? String(g.target / 100).replace('.', ',') : ''}"></label>
        <label class="field"><span>Bis wann? (optional)</span><input name="date" type="month" value="${g && g.date ? g.date : ''}"></label>
        <button class="btn btn-primary btn-block btn-xl" type="submit">${g ? 'Speichern' : 'Ziel anlegen'}</button>
        ${g ? `<div class="row gap top-gap"><button type="button" class="btn btn-soft grow" data-wd>Geld entnehmen</button><button type="button" class="btn btn-danger grow" data-del>Löschen</button></div>` : ''}
      </form>`, (sh, close) => {
      const getEmo = choiceGroup(sh, '.emo', g ? g.emoji : GOAL_EMOJI[0]);
      $('form', sh).addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('[name=name]', sh).value.trim(), target = parseAmount($('[name=target]', sh).value);
        if (!name) return shake($('[name=name]', sh));
        if (!(target > 0)) return shake($('[name=target]', sh));
        const date = $('[name=date]', sh).value || null;
        if (g) Object.assign(g, { name, target, date, emoji: getEmo() });
        else S.goals.push({ id: uid(), name, emoji: getEmo(), target, date, color: GOAL_COLORS[S.goals.length % GOAL_COLORS.length], createdAt: new Date().toISOString() });
        save(); close(); render();
        if (!g) toast(`Ziel „${name}“ angelegt 🎯`);
      });
      const del = $('[data-del]', sh);
      if (del) del.addEventListener('click', () => {
        const saved = calc().goalSaved[g.id] || 0;
        if (!confirm(`Ziel „${g.name}“ löschen?${saved ? ` Die ${euro(saved)} bleiben als freies Sparen erhalten.` : ''}`)) return;
        S.goals = S.goals.filter((x) => x.id !== g.id);
        S.tx.forEach((t) => { if (t.goalId === g.id) t.goalId = null; });
        save(); close(); render();
      });
      const wd = $('[data-wd]', sh);
      if (wd) wd.addEventListener('click', () => { close(); setTimeout(() => depositSheet({ goalId: g.id, mode: 'withdraw' }), 220); });
    });
  }

  function stashSheet(id) {
    const s = S.stashes.find((x) => x.id === id);
    openSheet(s ? 'Napf bearbeiten' : 'Neuer Napf', `
      <form autocomplete="off">
        <label class="field"><span>Name</span><input name="name" maxlength="24" required placeholder="z. B. Haustier" value="${esc(s ? s.name : '')}"></label>
        <div class="field-label">Symbol</div>
        ${emojiPicker(STASH_EMOJI)}
        <label class="field"><span>Budget pro Zyklus</span><input name="budget" inputmode="decimal" required placeholder="100" value="${s ? String(s.budget / 100).replace('.', ',') : ''}"></label>
        <button class="btn btn-primary btn-block btn-xl" type="submit">${s ? 'Speichern' : 'Napf anlegen'}</button>
        ${s ? '<button type="button" class="btn btn-danger btn-block top-gap" data-del>Napf löschen</button>' : ''}
      </form>`, (sh, close) => {
      const getEmo = choiceGroup(sh, '.emo', s ? s.emoji : STASH_EMOJI[0]);
      $('form', sh).addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('[name=name]', sh).value.trim(), budget = parseAmount($('[name=budget]', sh).value);
        if (!name) return shake($('[name=name]', sh));
        if (!(budget >= 0)) return shake($('[name=budget]', sh));
        if (s) Object.assign(s, { name, budget, emoji: getEmo() });
        else S.stashes.push({ id: uid(), name, budget, emoji: getEmo(), kw: '' });
        save(); close(); render();
      });
      const del = $('[data-del]', sh);
      if (del) del.addEventListener('click', () => {
        if (!confirm(`Napf „${s.name}“ löschen? Bisherige Ausgaben bleiben im Verlauf (ohne Napf).`)) return;
        S.stashes = S.stashes.filter((x) => x.id !== s.id);
        S.tx.forEach((t) => { if (t.stashId === s.id) t.stashId = null; });
        save(); close(); render();
      });
    });
  }

  function txSheet(id) {
    const t = S.tx.find((x) => x.id === id); if (!t) return;
    const m = txMeta(t);
    openSheet(m.sub.split(' · ')[0], `
      <div class="tx-detail">
        <div class="tile lg">${m.icon}</div>
        <div class="big amt ${m.cls}">${m.sign}${euro(t.amount)}</div>
        <div class="h3">${esc(m.title)}</div>
        <div class="muted">${new Date(t.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${t.source === 'csv' ? ' · aus CSV-Import' : ''}</div>
      </div>
      <button class="btn btn-danger btn-block" data-del>Buchung löschen</button>`, (sh, close) => {
      const b = $('[data-del]', sh);
      b.addEventListener('click', () => {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Wirklich löschen?'; return; }
        S.tx = S.tx.filter((x) => x.id !== id); save(); close(); render(); toast('Gelöscht');
      });
    });
  }

  function settingsSheet() {
    openSheet('Einstellungen', `
      <label class="field"><span>Name deines Dackels</span><input name="dn" maxlength="20" value="${esc(S.dogName)}"></label>
      <label class="toggle"><input type="checkbox" name="snd" ${S.sound ? 'checked' : ''}><span>Geräusche (Münze, Wuff)</span></label>

      <div class="section-title"><span>Konto verbinden</span></div>
      <div class="card info">
        <p><b>Kontoauszug importieren:</b> Lade in deinem Online-Banking die Umsätze als CSV herunter und importier sie hier. Geht mit Sparkasse, DKB, ING, N26, Comdirect, Volksbank u. v. m.</p>
        <button class="btn btn-soft btn-block" data-s="import">${ICON.upload} CSV-Datei importieren</button>
        <p class="muted small">Automatische Live-Verbindung zum Konto ist vorbereitet, braucht aber einen Bank-Zugangsdienst (PSD2) und einen kleinen Server – siehe README im Repository.</p>
      </div>

      <div class="section-title"><span>Daten</span></div>
      <div class="stack">
        <button class="btn btn-soft btn-block" data-s="export">Backup speichern (JSON)</button>
        <button class="btn btn-soft btn-block" data-s="restore">Backup wiederherstellen</button>
        <button class="btn btn-soft btn-block" data-s="demo">Demo-Daten laden</button>
        <button class="btn btn-danger btn-block" data-s="reset">Alles zurücksetzen</button>
      </div>
      <p class="muted small center top-gap">Deine Daten bleiben nur auf diesem Gerät.</p>`, (sh, close) => {
      $('[name=dn]', sh).addEventListener('change', (e) => { S.dogName = e.target.value.trim() || 'Butzele'; save(); render(); });
      $('[name=snd]', sh).addEventListener('change', (e) => { S.sound = Sfx.enabled = e.target.checked; save(); if (S.sound) Sfx.pet(); });
      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        const k = b.dataset.s;
        if (k === 'import') { close(); pickFile('.csv,text/csv,text/plain', importCSV); }
        if (k === 'export') exportBackup();
        if (k === 'restore') pickFile('.json,application/json', restoreBackup);
        if (k === 'demo') { if (S.tx.length && !confirm('Demo-Daten ersetzen deine aktuellen Daten. Fortfahren?')) return; loadDemo(); close(); }
        if (k === 'reset') { if (!confirm('Wirklich alles löschen? Das kann nicht rückgängig gemacht werden.')) return; localStorage.removeItem(KEY); S = fresh(); S.onboarded = true; save(); close(); render(); toast('Alles zurückgesetzt'); }
      });
    });
  }

  function pickFile(accept, cb) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.addEventListener('change', () => { if (inp.files[0]) cb(inp.files[0]); });
    inp.click();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `butzele-backup-${ymd(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function restoreBackup(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.tx) || !Array.isArray(d.stashes)) throw new Error('format');
      if (!confirm('Backup laden? Deine aktuellen Daten werden ersetzt.')) return;
      S = Object.assign(fresh(), d); save();
      $$('.sheet-backdrop').forEach((x) => x.remove());
      render(); toast('Backup geladen ✅');
    } catch (e) { toast('Das ist keine gültige Backup-Datei.'); }
  }

  // ---------- CSV-Import ----------
  function guessStash(text) {
    const t = text.toLowerCase();
    for (const s of S.stashes) {
      for (const k of (s.kw || '').split(/\s+/).filter(Boolean)) {
        if (new RegExp('(^|[^a-zäöü])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zäöü]|$)').test(t)) return s.id;
      }
    }
    return '';
  }

  async function importCSV(file) {
    let res;
    try { res = BankCSV.parse(BankCSV.decode(await file.arrayBuffer())); }
    catch (e) { res = { rows: [], error: 'Die Datei konnte nicht gelesen werden.' }; }
    if (!res.rows.length) { toast(res.error || 'Keine Buchungen gefunden.'); return; }
    const known = new Set(S.tx.map((t) => t.importKey).filter(Boolean));
    const rows = res.rows.sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => ({ ...r, dupe: known.has(r.key), stash: r.amount < 0 ? guessStash(r.text) : '' }));
    rows.forEach((r) => { r.on = !r.dupe; });
    const pos = rows.filter((r) => r.amount > 0).length, neg = rows.length - pos;
    const goalOpts = `<option value="">Freies Sparen</option>` + S.goals.map((g) => `<option value="${g.id}">${esc(g.emoji + ' ' + g.name)}</option>`).join('');
    const stashOpts = `<option value="">Ohne Napf</option>` + S.stashes.map((s) => `<option value="${s.id}">${esc(s.emoji + ' ' + s.name)}</option>`).join('');

    openSheet('Import prüfen', `
      <p class="muted">${rows.length} Buchungen gefunden · ${pos} Gutschriften · ${neg} Belastungen${rows.some((r) => r.dupe) ? ' · bereits importierte sind abgewählt' : ''}</p>
      <div class="card info small">
        <b>Tipp:</b> Ist das dein <b>Sparkonto</b>, sind Gutschriften Einzahlungen. Beim <b>Girokonto</b> sind Belastungen deine Ausgaben (die Näpfe werden automatisch erraten).
      </div>
      <div class="grid2">
        <label class="field"><span>Gutschriften (+)</span><select name="pos"><option value="deposit">als Einzahlung</option><option value="ignore">ignorieren</option></select></label>
        <label class="field"><span>… einzahlen in</span><select name="goal">${goalOpts}</select></label>
      </div>
      <label class="field"><span>Belastungen (−)</span><select name="neg"><option value="expense">als Ausgabe (Napf raten)</option><option value="withdraw">als Entnahme vom Ersparten</option><option value="ignore">ignorieren</option></select></label>
      <div class="row between"><button type="button" class="link" data-all>Alle an/aus</button><span class="muted small" id="cnt"></span></div>
      <div class="imp-list">${rows.slice(0, 400).map((r, i) => `
        <label class="imp ${r.dupe ? 'dupe' : ''}">
          <input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}>
          <span class="grow"><span class="name">${esc(r.text)}</span><span class="muted small">${new Date(r.date).toLocaleDateString('de-DE')}${r.dupe ? ' · schon da' : ''}</span></span>
          <span class="right"><b class="amt ${r.amount > 0 ? 'pos' : ''}">${r.amount > 0 ? '+' : '−'}${euro(Math.abs(r.amount))}</b>
          ${r.amount < 0 ? `<select class="mini" data-s="${i}">${stashOpts}</select>` : ''}</span>
        </label>`).join('')}</div>
      <button class="btn btn-primary btn-block btn-xl" data-go>Übernehmen</button>`, (sh, close) => {
      $$('select[data-s]', sh).forEach((sel) => { sel.value = rows[+sel.dataset.s].stash; sel.addEventListener('change', () => { rows[+sel.dataset.s].stash = sel.value; }); });
      const posSel = $('[name=pos]', sh), negSel = $('[name=neg]', sh);
      const count = () => {
        const n = rows.filter((r) => r.on && ((r.amount > 0 && posSel.value !== 'ignore') || (r.amount < 0 && negSel.value !== 'ignore'))).length;
        $('#cnt', sh).textContent = `${n} ausgewählt`;
        $('[data-go]', sh).textContent = n ? `${n} Buchungen übernehmen` : 'Nichts ausgewählt';
        $$('select[data-s]', sh).forEach((s) => { s.hidden = negSel.value !== 'expense'; });
      };
      $$('input[data-i]', sh).forEach((cb) => cb.addEventListener('change', () => { rows[+cb.dataset.i].on = cb.checked; count(); }));
      posSel.addEventListener('change', count); negSel.addEventListener('change', count);
      $('[data-all]', sh).addEventListener('click', () => {
        const to = !rows.every((r) => r.on);
        rows.forEach((r, i) => { r.on = to; const cb = $(`input[data-i="${i}"]`, sh); if (cb) cb.checked = to; }); count();
      });
      count();
      $('[data-go]', sh).addEventListener('click', () => {
        let dep = 0, depSum = 0, n = 0;
        const goal = $('[name=goal]', sh).value || null;
        for (const r of rows) {
          if (!r.on) continue;
          const base = { id: uid(), date: r.date, note: r.text.slice(0, 60), source: 'csv', importKey: r.key };
          if (r.amount > 0 && posSel.value === 'deposit') { S.tx.push({ ...base, type: 'deposit', amount: r.amount, goalId: goal }); dep++; depSum += r.amount; n++; }
          else if (r.amount < 0 && negSel.value === 'expense') { S.tx.push({ ...base, type: 'expense', amount: -r.amount, stashId: r.stash || null }); n++; }
          else if (r.amount < 0 && negSel.value === 'withdraw') { S.tx.push({ ...base, type: 'withdraw', amount: -r.amount, goalId: null }); n++; }
        }
        if (!n) return;
        save(); close();
        toast(`${n} Buchungen importiert ✅`);
        if (dep) celebrateDeposit(depSum, null, 0); else render();
      });
    });
  }

  // ---------- Zahltag ----------
  function payday() {
    const c = calc();
    const el = document.createElement('div');
    el.className = 'payday';
    el.innerHTML = `<div class="payday-inner">
      <button class="icon-btn ghost payday-x" data-close aria-label="Schließen">${ICON.x}</button>
      <div class="payday-stage"><canvas class="pixel"></canvas></div>
      <h1>ZAHLTAG!! <span aria-hidden="true">🎉</span></h1>
      <p>Alle Näpfe werden wieder aufgefüllt. ${esc(S.dogName)} hat sich noch nie so gefreut. Lass uns diesen Monat zählen!</p>
      <div class="refill">${S.stashes.map((s) => {
        const left = clamp((s.budget - (c.spent[s.id] || 0)) / (s.budget || 1), 0, 1);
        return `<div class="refill-row"><span>${s.emoji}</span><b>${esc(s.name)}</b><span class="bar"><i data-to="100" style="width:${left * 100}%"></i></span><em>${euroS(s.budget)}</em></div>`;
      }).join('')}</div>
      <div class="card payday-save">
        <div class="h3">Direkt was zur Seite legen?</div>
        <p class="muted small">Pay yourself first – ${esc(S.dogName)} liebt das.</p>
        ${AMOUNT_FIELD([25, 50, 100, 200])}
      </div>
      <button class="btn btn-white btn-block btn-xl" data-go>Los geht's 🐾</button>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('noscroll');
    const cv = $('canvas', el);
    const pd = new Butzele.Dog(cv, { onEvent: (e) => { if (e === 'party') Sfx.party(); } });
    pd.setMood(4);
    requestAnimationFrame(() => { fitCanvas(cv, 360); pd.react('party'); });
    const iv = setInterval(() => pd.react('party'), 4200);
    setTimeout(() => $$('.refill i', el).forEach((i) => { i.style.width = '100%'; }), 500);
    const inp = amountField(el);
    const close = () => { clearInterval(iv); pd.destroy(); el.remove(); document.body.classList.remove('noscroll'); };
    $('[data-close]', el).addEventListener('click', close);
    $('[data-go]', el).addEventListener('click', () => {
      const cents = inp.value.trim() ? parseAmount(inp.value) : 0;
      if (inp.value.trim() && !(cents > 0)) return shake(inp);
      S.cycleStart = new Date().toISOString();
      if (cents > 0) S.tx.push({ id: uid(), type: 'deposit', amount: cents, date: new Date().toISOString(), goalId: null, note: 'Zahltag-Sparen', source: 'manual' });
      save(); close();
      if (cents > 0) celebrateDeposit(cents, null, 0);
      else { goHome(); dog.react('party'); bubble('Neuer Monat, volle Näpfe! 🐾'); render(); }
    });
  }

  // ---------- Onboarding & Demo ----------
  function onboarding() {
    openSheet('Hallo! 🐾', `
      <p class="lead">Das ist <b>Butzele</b>, dein Spar-Dackel.</p>
      <ul class="how">
        <li><span>🪙</span>Jede Einzahlung macht Butzele glücklich – mit Freudensprüngen.</li>
        <li><span>🌧️</span>Lange nichts gespart? Dann wird's traurig im Körbchen.</li>
        <li><span>🥣</span>Mit Näpfen behältst du deine Ausgaben im Blick.</li>
        <li><span>🔥</span>Spar jede Woche etwas und bau eine Serie auf.</li>
      </ul>
      <label class="field"><span>Wie soll dein Dackel heißen?</span><input name="dn" maxlength="20" value="Butzele"></label>
      <button class="btn btn-primary btn-block btn-xl" data-ok>Los geht's</button>
      <button class="link center-block top-gap" data-demo>Erst mal mit Demo-Daten ausprobieren</button>`, (sh, close) => {
      const done = () => { S.dogName = $('[name=dn]', sh).value.trim() || 'Butzele'; S.onboarded = true; save(); close(); render(); Sfx.unlock(); setTimeout(() => { dog.react('pet'); bubble(`Wuff! Ich bin ${S.dogName}! 🐾`); }, 300); };
      $('[data-ok]', sh).addEventListener('click', done);
      $('[data-demo]', sh).addEventListener('click', () => { S.onboarded = true; close(); loadDemo(); });
    });
  }

  function loadDemo() {
    const name = S.dogName, d = fresh();
    d.dogName = name; d.onboarded = true; d.sound = S.sound;
    const ago = (n, h = 12) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    d.createdAt = ago(80); d.cycleStart = ago(12, 8);
    const y = new Date().getFullYear(), mo = new Date().getMonth() + 1;
    d.goals = [
      { id: uid(), name: 'Barcelona', emoji: '✈️', target: 120000, date: `${y + (mo + 5 > 12 ? 1 : 0)}-${pad(((mo + 4) % 12) + 1)}`, color: GOAL_COLORS[2], createdAt: ago(70) },
      { id: uid(), name: 'Neues Fahrrad', emoji: '🚲', target: 90000, date: `${y + 1}-${pad(mo)}`, color: GOAL_COLORS[0], createdAt: ago(60) },
      { id: uid(), name: 'Notgroschen', emoji: '🛟', target: 300000, date: null, color: GOAL_COLORS[3], createdAt: ago(80) },
    ];
    const tx = [];
    const dep = (n, a, gi, note) => tx.push({ id: uid(), type: 'deposit', amount: a, date: ago(n), goalId: gi == null ? null : d.goals[gi].id, note: note || '', source: 'manual' });
    [[63, 15000, 2], [56, 5000, 0], [49, 2500, 1], [42, 10000, 2, 'Zahltag-Sparen'], [35, 4000, 0], [28, 2000, 1], [21, 7500, 0], [14, 10000, 2, 'Zahltag-Sparen'], [9, 3000, 1], [2, 2500, 0, 'Rest vom Wochenende']]
      .forEach(([n, a, g, note]) => dep(n, a, g, note));
    const st = (name) => d.stashes.find((s) => s.name === name).id;
    [[11, 4380, 'Lebensmittel', 'REWE'], [10, 340, 'Kaffee', 'Cappuccino'], [9, 1890, 'Essen gehen', 'Pizza mit Lea'], [8, 2999, 'Shopping', 'Neue Socken'], [7, 6120, 'Lebensmittel', 'Wocheneinkauf'], [6, 420, 'Kaffee', 'Flat White'], [5, 4900, 'Mobilität', 'Deutschlandticket'],
      [4, 1250, 'Spaß', 'Kino'], [3, 3870, 'Lebensmittel', 'Aldi'], [2, 380, 'Kaffee', ''], [1, 2600, 'Essen gehen', 'Sushi'], [0, 360, 'Kaffee', 'Espresso']]
      .forEach(([n, a, s, note]) => tx.push({ id: uid(), type: 'expense', amount: a, date: ago(n, 14), stashId: st(s), note, source: 'manual' }));
    d.tx = tx;
    S = d; save(); tab = 'home'; render();
    toast('Demo-Daten geladen 🐶');
    setTimeout(() => dog.react('pet'), 300);
  }

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]'); if (!b || b.closest('.sheet-backdrop')) return;
    Sfx.unlock();
    const a = b.dataset.action;
    if (a === 'tab') { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }
    else if (a === 'deposit') depositSheet({ goalId: b.dataset.goal || '' });
    else if (a === 'expense') expenseSheet(b.dataset.stash || '');
    else if (a === 'new-goal') goalSheet(null);
    else if (a === 'edit-goal') goalSheet(b.dataset.id);
    else if (a === 'new-stash') stashSheet(null);
    else if (a === 'edit-stash') stashSheet(b.dataset.id);
    else if (a === 'payday') payday();
    else if (a === 'settings') settingsSheet();
    else if (a === 'filter') { histFilter = b.dataset.f; render(); }
    else if (a === 'tx') txSheet(b.dataset.id);
    else if (a === 'import') pickFile('.csv,text/csv,text/plain', importCSV);
  });

  window.addEventListener('resize', () => { if (tab === 'home') fitCanvas($('#dogCanvas'), 520); });
  // Stimmung neu berechnen, wenn die App wieder geöffnet wird (z. B. am nächsten Tag)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  render();
  if (!S.onboarded) onboarding();
  else {
    const c = calc(), md = mood(c, streak());
    setTimeout(() => bubble(moodLine(md), 4200), 700);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  window.ButzeleApp = { get state() { return S; }, render, loadDemo };
})();
