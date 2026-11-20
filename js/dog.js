/* Butzele – der Pixel-Dackel.
   Jeder Frame wird in ein kleines Pixelraster (104 × 60) gemalt und per CSS
   pixelig hochskaliert. Der Dackel besteht aus einfachen Formen; Umriss und
   Schattierung entstehen automatisch. Deshalb lassen sich Posen frei animieren. */
(function () {
  'use strict';

  const W = 104, H = 60;   // Welt
  const DW = 86;           // Breite des Dackel-Rasters
  const GY = 51;           // unterste Pfotenreihe
  const DOG_X = 6;         // Versatz Dackel → Welt
  const FLIP_C = 79;       // Spiegelachse: x' = FLIP_C − x (Rumpfmitte bleibt stehen)

  // Farbpalette (Index → RGB[A])
  const O = 1, B = 2, D = 3, L = 4, E = 5, F = 6, K = 7, WT = 8, T = 9, TD = 10, CR = 11,
    GO = 12, BL = 13, SH = 14, HR = 15, CG = 16, CD = 17, CL = 18, CLD = 19, WA = 20,
    PF = 21, GR = 22, BU = 23, OR = 24, EL = 25, CLL = 26;
  const PAL = [
    null,
    [46, 24, 13],        // O  Umriss
    [201, 117, 58],      // B  Fell
    [158, 82, 36],       // D  Fell Schatten
    [233, 160, 98],      // L  Fell Licht
    [122, 58, 24],       // E  Ohr
    [138, 70, 30],       // F  ferne Beine
    [28, 16, 10],        // K  Augen/Nase
    [255, 255, 255],     // WT weiß
    [255, 128, 146],     // T  Zunge
    [208, 70, 94],       // TD Zunge dunkel / Maul
    [228, 70, 92],       // CR Halsband
    [255, 214, 92],      // GO Gold
    [255, 150, 168],     // BL Bäckchen
    [46, 24, 13, 55],    // SH Schatten
    [255, 92, 116],      // HR Herz
    [255, 196, 56],      // CG Münze
    [204, 136, 22],      // CD Münze dunkel
    [222, 228, 240],     // CL Wolke
    [150, 162, 186],     // CLD Wolke dunkel
    [104, 170, 255],     // WA Wasser
    [255, 255, 255, 190],// PF Puff
    [64, 200, 120],      // GR Konfetti grün
    [110, 140, 255],     // BU Konfetti blau
    [255, 160, 50],      // OR Konfetti orange
    [158, 80, 38],       // EL Ohr Licht
    [250, 252, 255],     // CLL Wolke Licht
  ];

  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  class Grid {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); this.shear = 0; this.cx = 0; }
    clear() { this.d.fill(0); this.shear = 0; return this; }
    get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x]; }
    put(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
    set(x, y, c) {
      x = Math.round(x);
      y = Math.round(y) + (this.shear ? Math.round(this.shear * (x - this.cx)) : 0);
      this.put(x, y, c);
    }
    rect(x, y, w, h, c) {
      x = Math.round(x); y = Math.round(y);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    }
    ellipse(cx, cy, rx, ry, c) {
      if (rx <= 0 || ry <= 0) return;
      const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    rrect(x, y, w, h, r, c) {
      for (let py = Math.floor(y); py < y + h; py++) for (let px = Math.floor(x); px < x + w; px++) {
        const cx = px + 0.5, cy = py + 0.5;
        const dx = Math.max(x + r - cx, 0, cx - (x + w - r));
        const dy = Math.max(y + r - cy, 0, cy - (y + h - r));
        if (dx * dx + dy * dy <= r * r) this.set(px, py, c);
      }
    }
    stroke(x0, y0, x1, y1, r0, r1, c) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n, r = lerp(r0, r1, t), x = lerp(x0, x1, t), y = lerp(y0, y1, t);
        if (r < 0.75) this.set(Math.floor(x), Math.floor(y), c); else this.ellipse(x, y, r, r, c);
      }
    }
    sprite(rows, x, y, map) {
      x = Math.round(x); y = Math.round(y);
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
        const c = map[rows[j][i]]; if (c) this.put(x + i, y + j, c);
      }
    }
    // Licht oben, Schatten unten – automatisch aus der Silhouette
    shade(base, light, dark) {
      const { w, h, d } = this, out = d.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (d[i] !== base) continue;
        if (y === 0 || !d[i - w]) out[i] = light;
        else if (y >= h - 2 || !d[i + w] || !d[i + 2 * w]) out[i] = dark;
      }
      this.d = out; return this;
    }
    outline(c = O) {
      const { w, h, d } = this, out = d.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (d[i]) continue;
        if ((x > 0 && d[i - 1]) || (x < w - 1 && d[i + 1]) || (y > 0 && d[i - w]) || (y < h - 1 && d[i + w])) out[i] = c;
      }
      this.d = out; return this;
    }
    // Auf ein anderes Raster kopieren. keepUnder(x,y): dort keinen Umriss über vorhandene Pixel malen.
    drawOn(dst, ox = 0, oy = 0, flip = false, keepUnder = null) {
      const { w, h, d } = this;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = d[y * w + x]; if (!c) continue;
        const tx = (flip ? FLIP_C - x : x) + ox, ty = y + oy;
        if (keepUnder && c === O && dst.get(tx, ty) && keepUnder(tx, ty)) continue;
        dst.put(tx, ty, c);
      }
    }
  }

  // ---------- Sprites für Effekte ----------
  const MAP = { o: O, r: HR, w: WT, y: GO, g: CG, d: CD, b: WA, p: BL, k: K };
  const HEART = ['.oo.oo.', 'orrorro', 'orwrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'];
  const HEART_S = ['r.r', 'rrr', '.r.'];
  const COIN = [
    ['.oooo.', 'oyyggo', 'oyggdo', 'oyggdo', 'oggddo', '.oooo.'],
    ['.oo.', 'oygo', 'oygo', 'oygo', 'ogdo', '.oo.'],
    ['.o.', 'oyo', 'ogo', 'ogo', 'odo', '.o.'],
    ['.oo.', 'oygo', 'oygo', 'oygo', 'ogdo', '.oo.'],
  ];
  const SPARK = ['..w..', '..w..', 'wwyww', '..w..', '..w..'];
  const SPARK_S = ['.w.', 'wyw', '.w.'];
  const ZZ = ['wwwww', '...w.', '..w..', '.w...', 'wwwww'];
  const SWEAT = ['..o..', '.obo.', 'obbbo', 'obwbo', '.ooo.'];
  const EXCL = ['ooo', 'oyo', 'oyo', 'oyo', 'ooo', 'oyo', 'ooo'];

  const CLOUD = (() => {
    const g = new Grid(24, 12);
    g.ellipse(7, 6.5, 5, 3.5, CL); g.ellipse(12, 5, 5.5, 4.2, CL); g.ellipse(17, 6.5, 4.5, 3.2, CL);
    g.rect(4, 7, 16, 3, CL);
    g.shade(CL, CLL, CLD); g.outline(O);
    return g;
  })();

  // ---------- Der Dackel ----------
  const scratch = new Grid(DW, H);
  function layer(dst, fn, shade, keepUnder) {
    scratch.clear(); fn(scratch); scratch.shear = 0;
    if (shade) scratch.shade(shade[0], shade[1], shade[2]);
    scratch.outline();
    scratch.drawOn(dst, 0, 0, false, keepUnder);
  }

  function leg(s, x, y0, swing, c) {
    const n = GY - y0;
    for (let j = 0; j <= n; j++) {
      const off = Math.round(swing * j / Math.max(1, n));
      if (j === n) s.rect(x + off, y0 + j, 5, 1, c === F ? F : D);
      else s.rect(x + off, y0 + j, 4, 1, c);
    }
  }

  function basePose() {
    return {
      ox: 0, oy: 0, flip: false, lie: false, lift: 0, hx: 0, hy: 0, tilt: 0, ear: 0,
      tailA: -2.4, tailCurve: 0.5, legs: [0, 0, 0, 0], eyes: 'open', brows: false,
      mouth: 'smile', tongue: 3, blush: false, nose: 0, excl: false, sweat: false, rain: false,
    };
  }

  function anchors(p) {
    const top = (p.lie ? 41 : 36) - p.lift;
    return {
      top,
      head: [62 + p.hx, top - 14 + p.hy],
      mouth: [72 + p.hx, top - 3 + p.hy],
      eye: [64 + p.hx, top - 8 + p.hy],
      nose: [77 + p.hx, top - 6 + p.hy],
      back: [56 + p.hx, top - 12 + p.hy],
      feet: [40, GY],
    };
  }
  function toWorld(pt, p) { return [(p.flip ? FLIP_C - pt[0] : pt[0]) + DOG_X + p.ox, pt[1] + p.oy]; }

  function drawDog(g, p) {
    const { top } = anchors(p);
    const bot = top + 10;
    const hx = p.hx, hy = p.hy;
    const hcx = 62 + hx, hcy = top - 7 + hy;
    const headShear = (gr) => { gr.shear = p.tilt; gr.cx = hcx; };

    // ferne Beine
    if (!p.lie) layer(g, (s) => { leg(s, 54, bot + 1, p.legs[3], F); leg(s, 27, bot + 1, p.legs[1], F); });

    // Schwanz
    layer(g, (s) => {
      let x = 21, y = top + 2, a = p.tailA;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const r = 1.7 - i * 0.11, nx = x + Math.cos(a), ny = y + Math.sin(a);
        s.stroke(x, y, nx, ny, r, r - 0.11, B);
        x = nx; y = ny; a += p.tailCurve / n;
      }
    }, [B, L, D]);

    // liegend: Vorderpfoten nach vorn gestreckt (Kopf liegt darauf)
    if (p.lie) layer(g, (s) => { s.rrect(52, 48, 29, 4, 2, B); }, [B, L, D]);

    // Rumpf, Hals, Kopf, Schnauze – eine Silhouette
    layer(g, (s) => {
      s.rrect(19, top, 41, 11, 5.5, B);
      s.ellipse(51, top + 6.5, 8, 5, B);
      s.stroke(54, top + 3, 58 + hx * 0.7, top - 3 + hy * 0.8, 4, 3.6, B);
      headShear(s);
      s.ellipse(hcx, hcy - 0.5, 7.6, 7, B);
      s.ellipse(70.5 + hx, top - 4.5 + hy, 5.2, 3.8, B);
    }, [B, L, D]);

    // Halsband
    {
      const sx = 54, sy = top + 3, ex = 58 + hx * 0.7, ey = top - 3 + hy * 0.8;
      const len = Math.hypot(ex - sx, ey - sy) || 1, vx = (ex - sx) / len, vy = (ey - sy) / len;
      const nx = -vy, ny = vx;
      const mx = lerp(sx, ex, 0.5), my = lerp(sy, ey, 0.5);
      let tag = null;
      for (let k = -7; k <= 7; k += 0.5) for (let w = -0.6; w <= 1.2; w += 0.6) {
        const x = Math.round(mx + nx * k + vx * w), y = Math.round(my + ny * k + vy * w);
        const c = g.get(x, y);
        if (c === B || c === L || c === D) { g.put(x, y, CR); if (!tag || y > tag[1]) tag = [x, y]; }
      }
      if (tag) { g.put(tag[0], tag[1] + 1, GO); g.put(tag[0] + 1, tag[1] + 1, GO); g.put(tag[0], tag[1] + 2, CD); }
    }

    // nahe Beine bzw. Hinterkeule im Liegen
    if (!p.lie) {
      layer(g, (s) => { leg(s, 49, bot + 1, p.legs[2], B); leg(s, 23, bot + 1, p.legs[0], B); }, null, (x, y) => y <= bot);
    } else {
      layer(g, (s) => { s.ellipse(28, 46.5, 6.5, 4.5, B); s.rrect(29, 48, 9, 4, 2, B); }, [B, L, D]);
    }

    // Schlappohr
    layer(g, (s) => {
      headShear(s);
      const e = p.ear;
      let ex, ey, rx, ry;
      if (e >= 0) { ex = lerp(57.5, 51.5, e); ey = lerp(hcy + 2, hcy - 5, e); rx = lerp(3.8, 6.2, e); ry = lerp(7, 2.8, e); }
      else { const k = -e; ex = lerp(57.5, 57, k); ey = lerp(hcy + 2, hcy + 3.5, k); rx = lerp(3.8, 3.3, k); ry = lerp(7, 7.4, k); }
      if (p.lie) ry = Math.min(ry, GY - 1 - ey);
      s.ellipse(ex + hx, ey, rx, ry, E);
    }, [E, EL, E]);

    // Gesicht
    g.shear = p.tilt; g.cx = hcx;
    const ex = 64 + hx, ey = hcy - 3;
    const px = (x, y, c) => g.set(x, y, c);
    switch (p.eyes) {
      case 'open': g.rect(ex, ey, 2, 3, K); px(ex, ey, WT); break;
      case 'sad': g.rect(ex - 1, ey, 3, 3, K); px(ex - 1, ey, WT); px(ex, ey + 1, WT); break;
      case 'happy': px(ex - 1, ey + 2, K); px(ex, ey + 1, K); px(ex + 1, ey + 1, K); px(ex + 2, ey + 2, K); break;
      case 'squint': px(ex - 1, ey, K); px(ex, ey, K); px(ex + 1, ey + 1, K); px(ex, ey + 2, K); px(ex - 1, ey + 2, K); break;
      case 'heart': px(ex - 1, ey, HR); px(ex + 1, ey, HR); g.rect(ex - 1, ey + 1, 3, 1, HR); px(ex, ey + 2, HR); break;
      default: // blink, closed, sleep
        px(ex - 1, ey + 1, K); px(ex, ey + 2, K); px(ex + 1, ey + 2, K); px(ex + 2, ey + 1, K);
    }
    if (p.brows) { px(ex - 1, ey - 1, O); px(ex, ey - 1, O); px(ex + 1, ey - 2, O); px(ex + 2, ey - 2, O); }
    if (p.blush) { px(ex, ey + 4, BL); px(ex + 1, ey + 4, BL); }
    // Nase
    const nx = 74 + hx + (p.nose ? 1 : 0), ny = top - 7 + hy;
    g.rect(nx, ny, 3, 2, K); px(nx + 1, ny, WT);
    // Maul
    const my = top - 3 + hy;
    if (p.mouth === 'smile' || p.mouth === 'tongue') { px(66 + hx, my - 1, O); for (let x = 67; x <= 71; x++) px(x + hx, my, O); }
    else if (p.mouth === 'open') { for (let x = 67; x <= 72; x++) px(x + hx, my - 1, TD); for (let x = 67; x <= 72; x++) px(x + hx, my, T); }
    else if (p.mouth === 'frown') { for (let x = 67; x <= 71; x++) px(x + hx, my, O); px(66 + hx, my + 1, O); }
    else { for (let x = 68; x <= 70; x++) px(x + hx, my, D); }
    g.shear = 0;

    if (p.mouth === 'tongue') {
      layer(g, (s) => {
        headShear(s);
        s.rect(69 + hx, my + 1, 3, p.tongue, T);
        s.rect(70 + hx, my + 1, 1, Math.max(1, p.tongue - 1), TD);
      });
    }
  }

  // ---------- Animation ----------
  const IDLE_ACTIONS = {
    4: ['hop', 'hop', 'zoomies', 'spin', 'hearts', 'zoomies'],
    3: ['hop', 'tilt', 'hearts', 'wag'],
    2: ['sniff', 'tilt', 'yawn', 'wag'],
    1: ['sigh', 'lookup', 'thump', 'sigh'],
    0: ['sniffle', 'sleep', 'sigh', 'sleep'],
  };
  const ACTION_DUR = { hop: 0.6, spin: 1, zoomies: 3.4, hearts: 1.2, tilt: 1.6, wag: 1.6, sniff: 2.2, yawn: 1.6, sigh: 2.2, lookup: 2.6, thump: 1.3, sniffle: 2.4, sleep: 4.5 };

  class Dog {
    constructor(canvas, opts = {}) {
      this.cv = canvas;
      canvas.width = W; canvas.height = H;
      this.ctx = canvas.getContext('2d');
      this.img = this.ctx.createImageData(W, H);
      this.world = new Grid(W, H);
      this.dogGrid = new Grid(DW, H);
      this.mood = 2;
      this.reaction = null; this.action = null; this.parts = [];
      this.t = 0; this.last = performance.now();
      this.nextBlink = 1.5; this.nextAction = 2.5;
      this.onEvent = opts.onEvent || (() => {});
      this.loop = this.loop.bind(this);
      if (!opts.still) requestAnimationFrame(this.loop);
    }
    destroy() { this.dead = true; }
    setMood(m) {
      m = Math.max(0, Math.min(4, m | 0));
      if (m !== this.mood) { this.mood = m; this.action = null; this.nextAction = this.t + 1.5; }
    }
    react(kind, opts = {}) {
      const wasLying = this.mood <= 1 && !(this.reaction && this.reaction.kind !== 'expense');
      const dur = { deposit: (wasLying ? 0.45 : 0) + 0.45 + 2.2, expense: 1.7, pet: 1.5, party: 3.6 }[kind] || 1.5;
      this.reaction = { kind, t0: this.t, dur, opts, wasLying: kind === 'party' ? false : wasLying, f: {} };
      this.action = null;
      if (kind === 'party') this.onEvent('party');
    }

    loop(now) {
      if (this.dead) return;
      requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (!this.cv.isConnected || this.cv.offsetParent === null) return;
      this.t += dt;
      const p = this.pose();
      this.step(dt, p);
      this.render(p);
    }

    once(o, key, cond = true) { if (cond && !o.f[key]) { o.f[key] = true; return true; } return false; }

    emit(k, x, y, o) { this.parts.push(Object.assign({ k, x, y, vx: 0, vy: 0, g: 0, age: 0, life: 1, ph: Math.random() * 6 }, o)); }
    at(name, p) { return toWorld(anchors(p)[name], p); }
    hearts(p, n = 2) {
      const [x, y] = this.at('head', p);
      for (let i = 0; i < n; i++) this.emit('heart', x + rnd(-6, 6), y + rnd(-2, 2), { vx: rnd(-4, 4), vy: rnd(-18, -12), life: rnd(1.1, 1.6), delay: i * 0.18 });
    }
    sparks(x, y, n = 5, r = 10) { for (let i = 0; i < n; i++) this.emit('spark', x + rnd(-r, r), y + rnd(-r, r * 0.6), { life: rnd(0.35, 0.7), delay: rnd(0, 0.25) }); }
    coins(x, y, n = 4) { for (let i = 0; i < n; i++) this.emit('coin', x, y, { vx: rnd(-34, 34), vy: rnd(-46, -28), g: 110, life: 1.3 }); }
    confetti(n = 26) {
      const cs = [HR, CG, GR, BU, OR, BL];
      for (let i = 0; i < n; i++) this.emit('conf', rnd(0, W), rnd(-14, -1), { vy: rnd(14, 28), life: rnd(2.2, 3.4), c: pick(cs) });
    }
    puffs(p, n = 3, dir = 1) {
      const [x, y] = this.at('nose', p);
      const s = p.flip ? -1 : 1;
      for (let i = 0; i < n; i++) this.emit('puff', x + s * 2, y + 1, { vx: s * dir * rnd(8, 15), vy: rnd(-5, -1), life: rnd(0.6, 1), delay: i * 0.12 });
    }

    idle(p, m, t) {
      if (m === 4) {
        p.tailA = -2.0 + Math.sin(t * 22) * 0.55; p.mouth = 'tongue'; p.tongue = 3 + (Math.sin(t * 11) > 0 ? 1 : 0);
        p.lift = Math.sin(t * 11) > 0 ? 1 : 0; p.blush = true; p.eyes = (t % 4) < 2.6 ? 'happy' : 'open'; p.ear = 0.1;
      } else if (m === 3) {
        p.tailA = -2.15 + Math.sin(t * 15) * 0.45; p.mouth = 'tongue'; p.tongue = 2 + (Math.sin(t * 7) > 0 ? 1 : 0);
        p.lift = Math.sin(t * 7) > 0 ? 1 : 0; p.blush = (t % 7) < 2;
      } else if (m === 2) {
        p.tailA = -2.6 + Math.sin(t * 4) * 0.2; p.mouth = 'smile'; p.lift = Math.sin(t * 2.4) > 0.2 ? 1 : 0;
      } else {
        p.lie = true; p.hx = 3; p.hy = 9; p.ear = -1; p.eyes = 'sad'; p.brows = true; p.mouth = 'none';
        p.tailA = 2.95; p.tailCurve = -0.2;
        p.lift = Math.sin(t * (m === 1 ? 1.6 : 1.1)) > 0.4 ? 1 : 0;
        if (m === 0) p.rain = true;
      }
    }

    pose() {
      const t = this.t, p = basePose();
      this.idle(p, this.mood, t);
      let blink = false;
      if (t > this.nextBlink) {
        if (t > this.nextBlink + 0.13) this.nextBlink = t + rnd(2, 5.5); else blink = true;
      }
      const r = this.reaction;
      if (r && t - r.t0 > r.dur) { this.reaction = null; this.nextAction = t + 2; }
      if (this.reaction) this.applyReaction(p, this.reaction, t - this.reaction.t0);
      else {
        if (!this.action && t > this.nextAction) {
          const name = pick(IDLE_ACTIONS[this.mood]);
          this.action = { name, t0: t, dur: ACTION_DUR[name], f: {} };
        }
        const a = this.action;
        if (a) {
          const at = t - a.t0;
          if (at > a.dur) { this.action = null; this.nextAction = t + rnd(2.5, 6); }
          else this.applyAction(p, a, at);
        }
      }
      if (blink && (p.eyes === 'open' || p.eyes === 'sad')) p.eyes = 'blink';
      return p;
    }

    stand(p) {
      p.lie = false; p.hx = 0; p.hy = 0; p.ear = 0; p.brows = false; p.rain = false;
      p.tailA = -2.0 + Math.sin(this.t * 24) * 0.55; p.tailCurve = 0.5; p.lift = 0;
    }

    applyAction(p, a, at) {
      const u = at / a.dur, t = this.t, PI = Math.PI;
      switch (a.name) {
        case 'hop':
          p.oy = -Math.round(Math.sin(u * PI) * 6); p.ear = 0.6 * Math.sin(u * PI); p.legs = [-1, -1, 1, 1]; p.eyes = 'happy'; break;
        case 'spin':
          p.oy = -Math.round(Math.sin(u * PI) * 9); p.ear = 0.9; p.flip = u > 0.3 && u < 0.7; p.legs = [-2, -2, 2, 2]; p.eyes = 'happy'; break;
        case 'zoomies': {
          const ph = u * 2 * PI, s = Math.round(Math.sin(t * 26) * 2);
          p.ox = Math.round(Math.sin(ph) * 20); p.flip = Math.cos(ph) < 0;
          p.legs = [s, -s, -s, s]; p.oy = -Math.round(Math.abs(Math.sin(t * 13)) * 2);
          p.ear = 0.7; p.eyes = 'happy'; p.mouth = 'tongue'; p.tongue = 4;
          if (Math.random() < 0.25) { const [fx] = toWorld([p.flip ? 60 : 22, GY], p); this.emit('dust', fx, GY, { vx: (p.flip ? 1 : -1) * rnd(6, 14), vy: rnd(-6, -2), life: 0.4 }); }
          break;
        }
        case 'hearts':
          p.eyes = 'happy'; p.blush = true; p.tailA = -2.0 + Math.sin(t * 26) * 0.6;
          if (this.once(a, 'h1', at > 0.1)) this.hearts(p, 2);
          if (this.once(a, 'h2', at > 0.6)) this.hearts(p, 1);
          break;
        case 'tilt': p.tilt = Math.sin(u * PI) * 0.2; p.ear = 0.15; break;
        case 'wag': p.tailA = -2.1 + Math.sin(t * 24) * 0.55; p.eyes = 'happy'; break;
        case 'sniff':
          p.hy = 4; p.hx = 2; p.nose = Math.floor(at * 9) % 2; p.mouth = 'none';
          if (this.once(a, 's' + Math.floor(at / 0.6), at % 0.6 > 0.3)) this.puffs(p, 1, -0.5);
          break;
        case 'yawn':
          if (u > 0.2 && u < 0.8) { p.mouth = 'open'; p.eyes = 'closed'; p.lift = 1; p.hy = -1; p.ear = -0.3; }
          break;
        case 'sigh':
          if (u < 0.45) { p.lift = 1; p.hy -= 1; } else { p.lift = 0; p.eyes = 'closed'; }
          if (this.once(a, 'puff', u > 0.5)) this.puffs(p, 3);
          break;
        case 'lookup': {
          const env = Math.min(1, at / 0.4, (a.dur - at) / 0.4);
          p.hy = Math.round(lerp(9, 3, env)); p.ear = -0.5; p.eyes = 'sad';
          p.tailA = 2.95 - Math.abs(Math.sin(at * 6)) * 0.3 * env;
          break;
        }
        case 'thump': p.tailA = 2.95 - Math.abs(Math.sin(at * 12)) * 0.65; break;
        case 'sniffle':
          p.nose = Math.floor(at * 6) % 2;
          if (this.once(a, 't1', at > 0.3)) { const [x, y] = this.at('eye', p); this.emit('tear', x, y + 3, { vy: 4, g: 50, life: 0.9 }); }
          if (this.once(a, 't2', at > 1.3)) { const [x, y] = this.at('eye', p); this.emit('tear', x, y + 3, { vy: 4, g: 50, life: 0.9 }); }
          break;
        case 'sleep':
          p.eyes = 'sleep'; p.brows = false; p.lift = Math.sin(t * 1.5) > 0 ? 1 : 0;
          if (this.once(a, 'z' + Math.floor(at), at % 1 > 0.2)) { const [x, y] = this.at('nose', p); this.emit('z', x - 2, y - 6, { vx: rnd(3, 7), vy: -7, life: 2 }); }
          break;
      }
    }

    applyReaction(p, r, rt) {
      const t = this.t, PI = Math.PI;
      switch (r.kind) {
        case 'deposit': {
          const w = r.wasLying ? 0.45 : 0, ct = w + 0.45;
          if (this.once(r, 'coin')) {
            const sp = basePose(); sp.hy = -1;
            const [mx, my] = toWorld([73, anchors(sp).top - 6], sp);
            this.emit('coin', mx, -6, { vy: (my + 6) / ct, life: ct, falling: true });
          }
          if (rt < w) { // aufwachen: Kopf hoch, Ausrufezeichen
            p.hy = 2; p.eyes = 'open'; p.brows = false; p.ear = 0.2; p.excl = true; p.rain = false;
            p.tailA = 2.95 - Math.abs(Math.sin(rt * 14)) * 0.6;
            break;
          }
          this.stand(p);
          if (rt < ct) { p.hy = -1; p.mouth = 'open'; p.eyes = 'open'; }
          else if (rt < ct + 0.15) {
            p.lift = -1; p.eyes = 'happy'; p.mouth = 'smile';
            if (this.once(r, 'catch')) { const [x, y] = this.at('mouth', p); this.sparks(x, y - 2, 6, 8); this.onEvent('coin'); }
          } else if (rt < ct + 0.75) {
            const u = (rt - ct - 0.15) / 0.6;
            p.oy = -Math.round(Math.sin(u * PI) * 13); p.ear = 1; p.legs = [-2, -2, 2, 2];
            p.eyes = 'happy'; p.mouth = 'open'; p.blush = true;
            if (this.once(r, 'bark')) this.onEvent('jump');
            if (this.once(r, 'apex', u > 0.45)) { this.hearts(p, 3); const [x, y] = this.at('head', p); this.coins(x - 6, y + 4, 4); }
          } else if (rt < ct + 0.9) { p.lift = -1; p.eyes = 'happy'; p.mouth = 'tongue'; p.blush = true; }
          else if (rt < ct + 1.3) {
            const u = (rt - ct - 0.9) / 0.4;
            p.oy = -Math.round(Math.sin(u * PI) * 5); p.ear = 0.6; p.legs = [-1, -1, 1, 1];
            p.eyes = 'happy'; p.mouth = 'tongue'; p.blush = true;
          } else {
            p.eyes = 'happy'; p.mouth = 'tongue'; p.tongue = 3 + (Math.sin(t * 12) > 0 ? 1 : 0);
            p.lift = Math.sin(t * 12) > 0 ? 1 : 0; p.blush = true;
          }
          break;
        }
        case 'expense': {
          const early = rt < 0.35;
          p.eyes = early ? 'squint' : 'sad'; p.brows = !early; p.sweat = rt > 0.15 && rt < 1.45;
          if (r.wasLying) { p.ear = -1; }
          else {
            p.ox = early ? -1 : 0; p.ear = -0.8; p.mouth = 'frown'; p.tailA = 2.3; p.tailCurve = -0.3; p.lift = 0; p.hy = 1;
          }
          if (r.opts.big && this.once(r, 'tear', rt > 0.5)) { const [x, y] = this.at('eye', p); this.emit('tear', x, y + 3, { vy: 4, g: 50, life: 0.9 }); }
          break;
        }
        case 'pet':
          p.eyes = 'happy'; p.blush = true; p.brows = false;
          if (p.lie) { p.tailA = 2.95 - Math.abs(Math.sin(rt * 14)) * 0.7; p.hy = 6; p.ear = -0.4; p.mouth = 'smile'; }
          else { p.tailA = -2.0 + Math.sin(t * 26) * 0.6; p.tilt = Math.sin(rt * PI / 1.5) * 0.18; p.mouth = 'tongue'; p.lift = Math.sin(t * 14) > 0 ? 1 : 0; }
          if (this.once(r, 'h1', rt > 0.05)) this.hearts(p, 1);
          if (this.once(r, 'h2', rt > 0.55)) this.hearts(p, 1);
          break;
        case 'party': {
          this.stand(p);
          p.tailA = -2.0 + Math.sin(t * 26) * 0.6;
          p.eyes = Math.floor(rt * 3) % 3 === 0 ? 'heart' : 'happy'; p.mouth = 'tongue'; p.tongue = 4; p.blush = true;
          const hops = [[0, 0.7, 12], [0.9, 1.8, 15], [2.0, 2.7, 10]];
          hops.forEach(([a, b, h], i) => {
            if (rt >= a && rt < b) {
              const u = (rt - a) / (b - a);
              p.oy = -Math.round(Math.sin(u * PI) * h); p.ear = 1; p.legs = [-2, -2, 2, 2];
              if (i === 1) p.flip = u > 0.25 && u < 0.75;
              if (this.once(r, 'c' + i)) this.confetti(i === 0 ? 34 : 18);
              if (this.once(r, 'h' + i, u > 0.5)) this.hearts(p, 2);
            }
          });
          break;
        }
      }
    }

    step(dt, p) {
      // Umgebung: Herzen bei Hochstimmung, Regen bei großer Traurigkeit
      if (this.mood === 4 && !this.reaction && Math.random() < dt * 0.35) this.hearts(p, 1);
      if (p.rain && Math.random() < dt * 16 && this.cloudX != null) {
        const vy = rnd(40, 52); this.emit('drop', this.cloudX + rnd(4, 20), 12, { vy, life: (anchors(p).top - 16 - 12) / vy });
      }
      for (const q of this.parts) {
        if (q.delay > 0) { q.delay -= dt; continue; }
        q.age += dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.k === 'heart') q.x += Math.sin(q.age * 6 + q.ph) * 0.12;
        if (q.k === 'conf') q.x += Math.sin(q.age * 7 + q.ph) * 0.35;
      }
      this.parts = this.parts.filter((q) => q.age < q.life && q.y < H + 8);
    }

    render(p) {
      const wg = this.world.clear(), dg = this.dogGrid.clear();

      // Regenwolke
      if (p.rain) {
        const [hx] = this.at('head', p);
        this.cloudX = Math.round(hx - 9 + Math.sin(this.t * 0.8) * 1.5);
        CLOUD.drawOn(wg, this.cloudX, 1 + Math.round(Math.sin(this.t * 1.3) * 0.6));
      } else this.cloudX = null;

      drawDog(dg, p);
      const air = -p.oy;
      wg.ellipse((p.flip ? FLIP_C - 46 : 46) + DOG_X + p.ox, GY + 1.5, Math.max(10, 29 - air * 1.2), 1.7, SH);
      dg.drawOn(wg, DOG_X + p.ox, p.oy, p.flip);

      if (p.excl) { const [x, y] = this.at('head', p); wg.sprite(EXCL, x - 1, y - 9 - (Math.floor(this.t * 8) % 2), MAP); }
      if (p.sweat) { const [x, y] = this.at('back', p); wg.sprite(SWEAT, x - 5, y - 1 + Math.floor((this.t * 6) % 2), MAP); }

      for (const q of this.parts) {
        if (q.delay > 0) continue;
        const x = Math.round(q.x), y = Math.round(q.y);
        switch (q.k) {
          case 'heart': wg.sprite(q.age < 0.12 ? HEART_S : HEART, x - 3, y - 3, MAP); break;
          case 'coin': wg.sprite(COIN[Math.floor(q.age * 12) % 4], x - 3, y - 3, MAP); break;
          case 'spark': wg.sprite(q.age < q.life * 0.5 ? SPARK : SPARK_S, x - 2, y - 2, MAP); break;
          case 'z': wg.sprite(ZZ, x - 1, y - 1, { w: O }); wg.sprite(ZZ, x - 2, y - 2, MAP); break;
          case 'drop': wg.put(x, y, WA); wg.put(x, y + 1, WA); break;
          case 'tear': wg.put(x, y, WA); wg.put(x, y + 1, WA); break;
          case 'puff': wg.put(x, y, PF); if (q.age < q.life * 0.5) { wg.put(x + 1, y, PF); wg.put(x, y - 1, PF); } break;
          case 'dust': wg.put(x, y, PF); break;
          case 'conf': {
            const flat = Math.floor(q.age * 8 + q.ph) % 2;
            wg.put(x, y, q.c); wg.put(x + (flat ? 1 : 0), y + (flat ? 0 : 1), q.c); break;
          }
        }
      }
      paint(this.ctx, this.img, wg);
    }
  }

  function paint(ctx, img, grid) {
    const data = img.data, d = grid.d;
    for (let i = 0; i < d.length; i++) {
      const c = PAL[d[i]], j = i * 4;
      if (!c) { data[j + 3] = 0; continue; }
      data[j] = c[0]; data[j + 1] = c[1]; data[j + 2] = c[2]; data[j + 3] = c.length > 3 ? c[3] : 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Ein Standbild (z. B. für App-Icons)
  function snapshot(overrides = {}) {
    const g = new Grid(W, H), dg = new Grid(DW, H);
    const p = Object.assign(basePose(), overrides);
    drawDog(dg, p);
    dg.drawOn(g, DOG_X + p.ox, p.oy, p.flip);
    return { grid: g, paint: (ctx) => { const img = ctx.createImageData(W, H); paint(ctx, img, g); } };
  }

  window.Butzele = { Dog, snapshot, W, H };
})();
