/* casino:step6 */
/*
  Звук казино: Web Audio, всё синтезируется (файлов нет). Флаг — тот же hh_save_v1.sfx, что и в игре «Ёжик»; по умолчанию выключен.
  Музыка — только фанфара джекпота. destroy() гасит все узлы и таймеры (вызывается роутером при уходе со страницы).

  Шаг 6 казино: звук зависит от темы (js/casino-themes.js → makeThemeSounds). makeSlotsAudio(тема?) — без аргумента тема берётся из
  сохранения слотов; audio.theme(имя) переключает на лету. На остановку барабана — «колокольчик» из inharmonic-партиалов (1 : 2.76 : 5.4),
  на выигрыш — быстрый «звон монет» (число монет растёт с уровнем выигрыша), во время вращения — лёгкая трещотка вместо пилообразного гула.
  Для столов: audio.deal() / chip() / ballTick() / ballDrop().
*/
import { makeThemeSounds, storedThemeId } from './casino-themes.js';
export { makeThemeSounds };

const KEY = 'hh_save_v1';
const hz = (base, semi) => base * Math.pow(2, semi / 12);
const PENT = [0, 2, 4, 7, 9];
const COINS = { small: 4, good: 7, big: 12, mega: 18, epic: 26 };
const MELODY = { small: 3, good: 4, big: 6, mega: 8, epic: 10 };
export function readSfx() { try { return Boolean(JSON.parse(localStorage.getItem(KEY) || '{}').sfx); } catch { return false; } }
function writeSfx(on) { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; s.sfx = on; localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* приватный режим */ } }

export function makeSlotsAudio(themeName) {
  let ctx = null, master = null, noiseBuf = null, on = readSfx(), fanfare = 0, dead = false;
  let spinning = false, ratchetT = 0, reelsLeft = 5;
  let P = makeThemeSounds(themeName === undefined ? storedThemeId() : themeName);
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  function ensure() {
    if (dead) return null;
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, d, o = {}) {
    if (!on || !ensure()) return;
    const t0 = ctx.currentTime + (o.delay || 0), a = o.a || 0.006, v = o.v || 0.2, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + a + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + a + d + 0.05);
  }
  function noise(d, v, fc, delay = 0, type = 'lowpass') {
    if (!on || !ensure()) return;
    const t0 = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; f.type = type; f.frequency.value = fc; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0, Math.random() * 0.5); src.stop(t0 + d + 0.05);
  }
  // Колокольчик / монета: 2–4 партиала с негармоническими отношениями и быстрым затуханием
  function bell(f0, o = {}) {
    if (!on || !ensure()) return;
    const partials = o.partials || P.bell.partials, v = o.v ?? P.bell.vol, dk = o.decay ?? P.bell.decay, t0 = ctx.currentTime + Math.max(0, o.delay || 0);
    for (const [ratio, gain, share, type] of partials) {
      const f = f0 * ratio; if (f > 11000) continue;
      const len = Math.max(0.04, dk * share), osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * gain), t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.003 + len);
      osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + len + 0.05);
    }
  }
  const arp = (semis, base, step, o = {}) => semis.forEach((s, i) => tone(hz(base, s), o.d || 0.22, { type: o.type || P.lead || 'triangle', v: o.v || 0.15, delay: i * step }));
  // Звон монет: n быстрых «колокольчиков» вверх по гамме темы, с лёгким разбросом и звонким шорохом
  function coins(n, gain = 1) {
    const C = P.coin, sc = C.scale, step = Math.max(0.026, C.step - n * 0.0009);
    for (let i = 0; i < n; i++) {
      const semi = sc[i % sc.length] + 12 * (Math.floor(i / sc.length) % 3) - 12, f = Math.min(3200, hz(C.base, semi));
      const delay = Math.max(0, i * step + (Math.random() - 0.5) * 0.012), v = C.vol * gain * (0.7 + 0.3 * (n > 1 ? i / (n - 1) : 1));
      bell(f, { delay, v, decay: C.decay, partials: C.partials });
      if (C.clatter && i % 2 === 0) noise(0.04, C.clatter, 6500, delay, 'highpass');
    }
  }
  // Трещотка: короткие щелчки, реже по мере остановки барабанов
  function ratchetStep() {
    ratchetT = 0; if (dead || !spinning) return;
    const R = P.ratchet;
    tone(R.f * (0.94 + Math.random() * 0.12), 0.012, { type: R.type, v: R.v, a: 0.001 });
    if (R.noise) noise(0.01, R.noise, 5000, 0, 'highpass');
    ratchetT = setTimeout(ratchetStep, R.gap + (5 - reelsLeft) * R.slow);
  }
  const api = {
    get on() { return on; },
    get themeName() { return P.id; },
    theme(name) { P = makeThemeSounds(name); return api; },
    set(v) { on = Boolean(v); writeSfx(on); if (on) { ensure(); api.click(); } else api.stopAll(); },
    click() { const u = P.ui.click; tone(u.f, 0.04, { type: u.type, v: u.v }); },
    nope() { const u = P.ui.nope; tone(u.f, 0.12, { type: u.type, to: u.to, v: u.v }); },
    lever() { noise(0.18, 0.1, 900); tone(180, 0.18, { type: 'sawtooth', to: 90, v: 0.08 }); },
    whirStart() { if (!on || !ensure() || spinning) return; spinning = true; reelsLeft = 5; ratchetStep(); },
    whirStop() { spinning = false; if (ratchetT) { clearTimeout(ratchetT); ratchetT = 0; } },
    // остановка барабана i: глухой «ударный» тон + колокольчик (выше с каждым барабаном)
    thunk(i = 0) {
      reelsLeft = Math.max(0, 4 - i);
      const S = P.stop, T = S.thunk;
      tone(T.f - i * 8, 0.13, { type: T.type, to: T.to, v: T.v }); noise(0.07, 0.1, 500);
      bell(hz(S.base, S.scale[i % S.scale.length] + 12 * Math.floor(i / S.scale.length)), { v: S.vol, decay: P.bell.decay * 0.7 });
    },
    wild() { noise(0.45, 0.14, 2600, 0, 'bandpass'); tone(300, 0.4, { to: 1100, v: 0.1 }); bell(hz(P.stop.base, 12), { delay: 0.25, v: 0.1 }); },
    scatter(n = 1) { const s = PENT[n % 5]; bell(hz(880, s), { v: 0.12, decay: 0.6 }); bell(hz(1320, s), { delay: 0.06, v: 0.08, decay: 0.6 }); },
    heartbeat() { tone(70, 0.12, { v: 0.3 }); tone(62, 0.14, { v: 0.24, delay: 0.17 }); },
    tick(k = 0) { tone(900 + (k % 8) * 40, 0.03, { type: 'square', v: 0.035 }); },
    win(tier = 'small') {
      const n = COINS[tier] || 4, m = MELODY[tier] || 3;
      coins(n, tier === 'epic' ? 1.25 : 1);
      if (m >= 4) arp(Array.from({ length: m }, (_, i) => PENT[i % 5] + 12 * Math.floor(i / 5)), 523, 0.08, { d: 0.2 + m * 0.02, v: 0.09 });
      if (m >= 6) arp([0, 7, 12, 16], 262, 0.1, { type: 'sine', v: 0.1 });
      if (m >= 8) tone(hz(98, 0), 0.5, { type: 'sine', to: 70, v: 0.2 });
    },
    berry(k = 0) { tone(hz(660, PENT[k % 5]), 0.1, { to: hz(660, PENT[k % 5]) * 1.5, v: 0.14 }); },
    feature() { arp([0, 4, 7, 12, 16, 19], 392, 0.09, { d: 0.3 }); coins(6, 0.8); },
    segfault() { tone(300, 0.5, { type: 'sawtooth', to: 40, v: 0.16 }); noise(0.4, 0.14, 700); },
    shake() { noise(0.08, 0.12, 1200); tone(220, 0.06, { type: 'square', v: 0.05 }); },
    crack(r = 'common') { noise(0.2, 0.16, 3000, 0, 'highpass'); const n = { common: 3, rare: 4, epic: 5, legendary: 7 }[r] || 3; arp(Array.from({ length: n }, (_, i) => PENT[i % 5] + 7), 523, 0.09, { d: 0.35, v: 0.14 }); },
    wheelTick() { tone(1300, 0.025, { type: 'square', v: 0.05 }); },
    flip() { tone(500, 0.08, { to: 900, v: 0.1 }); tone(900, 0.08, { to: 500, v: 0.1, delay: 0.09 }); },
    gambleLose() { tone(240, 0.35, { type: 'triangle', to: 90, v: 0.14 }); },
    heat() { tone(300, 0.5, { to: 900, v: 0.08 }); },
    // столы (блэкджек / рулетка): звуки берутся из набора темы
    deal() { const d = P.table.deal; tone(d.f, 0.07, { type: d.type, to: d.to, v: d.v }); noise(0.05, 0.05, 3500, 0, 'highpass'); },
    chip() { const c = P.table.chip; bell(c.base, { v: c.vol, decay: c.decay, partials: [[1, 1, 1, 'sine'], [2.76, 0.5, 0.5, 'sine']] }); noise(0.03, 0.04, 4500, 0, 'highpass'); },
    ballTick() { const b = P.table.ball; tone(b.f * (0.9 + Math.random() * 0.2), 0.02, { type: b.type, v: b.v, a: 0.001 }); },
    ballDrop() { const d = P.table.drop; tone(d.f, 0.18, { type: d.type, to: d.to, v: d.v }); bell(hz(P.stop.base, 7), { delay: 0.05, v: 0.1 }); },
    // единственная «музыка» — фанфара джекпота, закольцована до stopFanfare()
    fanfare() {
      if (!on || !ensure() || fanfare) return;
      const bar = () => { arp([0, 4, 7, 12, 7, 12, 16, 19], 262, 0.12, { type: 'square', v: 0.07, d: 0.18 }); arp([-12, -5, 0, -5], 130, 0.24, { type: 'triangle', v: 0.14, d: 0.4 }); coins(5, 0.7); };
      bar(); fanfare = setInterval(bar, 1000);
    },
    stopFanfare() { if (fanfare) { clearInterval(fanfare); fanfare = 0; } },
    stopAll() { api.stopFanfare(); api.whirStop(); },
    destroy() { dead = true; api.stopAll(); timers.forEach(clearTimeout); timers.clear(); if (ctx) { try { ctx.close(); } catch { /* уже закрыт */ } ctx = null; } },
    later,
  };
  return api;
}
