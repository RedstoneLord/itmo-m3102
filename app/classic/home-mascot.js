import { drawHog } from './home-hog-art.js';

// Только декоративный рендерер. Игровой баланс и состояние сюда не подключаются.
export function mountMascot(hero) {
  const terrain = hero.querySelector('.home-terrain'),
    travel = hero.querySelector('.hog-travel'),
    height = hero.querySelector('.hog-height'),
    facing = hero.querySelector('.hog-facing'),
    canvas = hero.querySelector('canvas'),
    button = hero.querySelector('.home-motion');
  const ctx = canvas.getContext('2d'),
    media = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0,
    last = 0,
    elapsed = 0,
    paused = false,
    visible = true,
    dead = false,
    w = terrain.clientWidth,
    dpr = 0;
  const reduced = () => media.matches || document.documentElement.hasAttribute('data-reduce-motion');
  function draw(t = elapsed) {
    const ratio = devicePixelRatio || 1;
    if (dpr !== ratio) {
      dpr = ratio;
      canvas.width = 64 * dpr;
      canvas.height = 64 * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 64, 64);
    const phase = (t % 24000) / 24000,
      p = (1 - Math.cos(phase * Math.PI * 2)) / 2,
      right = phase < 0.5;
    const x = 16 + Math.max(0, w - 96) * p;
    // Та же квадратичная поверхность, что у SVG; персонаж опирается на неё лапами.
    const u = (((x + 32) / w) * 4) % 1,
      segment = Math.floor(((x + 32) / w) * 4),
      hill = (segment % 2 === 0 ? -1 : 1) * 40 * u * (1 - u);
    const rollAt = right ? 0.3 : 0.78,
      rollPhase = (phase - rollAt) / 0.065;
    const roll = !reduced() && rollPhase > 0 && rollPhase < 1;
    const curl = roll ? Math.min(1, rollPhase * 8, (1 - rollPhase) * 8) : 0;
    travel.style.transform = `translateX(${x}px)`;
    height.style.transform = `translateY(${hill}px)`;
    facing.style.transform = `scaleX(${right ? 1 : -1})`;
    ctx.save();
    ctx.translate(32, roll ? 35 : 39);
    drawHog(ctx, 16, { curl, roll: roll ? rollPhase * Math.PI * 2 : 0, leg: t / 100, run: reduced() || paused ? 0 : 0.55, hat: 'none', blink: 0 });
    ctx.restore();
    button.disabled = reduced();
    button.setAttribute('aria-label', paused ? 'Продолжить анимацию ёжика' : 'Приостановить анимацию ёжика');
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? '▷' : 'Ⅱ';
  }
  function loop(now) {
    frame = 0;
    if (dead || paused || reduced() || document.hidden || !visible) {
      last = 0;
      return;
    }
    if (last) elapsed += Math.min(1000, now - last);
    last = now;
    draw();
    frame = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    draw(reduced() ? 0 : elapsed);
    if (!dead && !paused && !reduced() && !document.hidden && visible) frame = requestAnimationFrame(loop);
  }
  const resize = new ResizeObserver(() => {
    w = terrain.clientWidth;
    draw(reduced() ? 0 : elapsed);
  });
  resize.observe(terrain);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  });
  intersection.observe(hero);
  const prefs = new MutationObserver(sync);
  prefs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-motion'] });
  const click = () => {
    paused = !paused;
    sync();
  };
  button.addEventListener('click', click);
  media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  hero.querySelector('.hog-facing img')?.remove();
  sync();
  return () => {
    dead = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    intersection.disconnect();
    prefs.disconnect();
    button.removeEventListener('click', click);
    media.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', sync);
  };
}
