/*
  Оригинальные SVG-символы слотов «Колючий куш» в одном скрытом спрайте (viewBox 0 0 100 100).
  Никаких чужих логотипов: «ИТМО»-щит и «C++» — стилизованные рисунки. Подписи — по-русски для скринридеров.
*/
export const LABELS = {
  berry: 'Малина', apple: 'Яблоко', mush: 'Гриб-мухомор', git: 'Значок Git', orange: 'Апельсин', cpp: 'Шестиугольник C++', rust: 'Рыжий ёжик с шестерёнкой',
  pi: 'Свиток ∑ и π', hog: 'Ёжик', king: 'Король ёжиков', wild: 'Wild (карта с вопросом)', scatter: 'Щит-скаттер', bonus: 'Корзина с ягодами (бонус)', claude: 'Логотип Claude', itmo: 'Логотип ИТМО', seven: 'Счастливая семёрка', capsule: 'Золотая капсула', /* casino:step4 labels */
};
const g = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="g-${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const DEFS = [
  g('red', '#ff7a7a', '#c4232f'), g('pink', '#ff9ac4', '#d6246e'), g('orange', '#ffc15a', '#e8730e'), g('blue', '#6fb6ff', '#1b55c9'), g('green', '#9be37a', '#2c8c3c'),
  g('brown', '#a37850', '#5b3d2b'), g('peach', '#fbe0bd', '#e8b786'), g('gold', '#fff0a0', '#d99a1f'), g('navy', '#47c8e8', '#14316b'), g('parch', '#fff6dc', '#e2c78f'),
  g('violet', '#b69cff', '#5b3fd0'), g('wick', '#e2b46c', '#9a6a2d'), g('gitc', '#ff9a5c', '#d8381d'), g('rustc', '#ffb070', '#b5470f'), g('spark', '#ffc88a', '#d8552f'), g('itmo', '#5aa0ff', '#0f2a6b'), /* casino:step4 defs */
  '<radialGradient id="g-ball" cx=".5" cy=".5" r=".5" fx=".4" fy=".35"><stop offset="0" stop-color="#c99a6a"/><stop offset="1" stop-color="#5b3d2b"/></radialGradient>',
  '<radialGradient id="g-hogbody" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#b88b5c"/><stop offset="1" stop-color="#5b3d2b"/></radialGradient>',
  '<radialGradient id="g-rhogbody" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#f0a56a"/><stop offset="1" stop-color="#a8481a"/></radialGradient>',
  '<radialGradient id="g-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6a0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6a0" stop-opacity="0"/></radialGradient>',
].join('');

const sparkle = (x, y, r, fill) => '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';

/* casino:step4 hedgehog — ёжик по эмодзи-референсу (профиль). Геометрия HOG одна на SVG (js/slots-art.js) и canvas (index.html, drawHog).
   Координаты — в системе референса 512×512 (ёжик смотрит влево); и SVG, и canvas зеркалят её (scale(-k, k)), поэтому в игре ёжик смотрит вправо. */
const HOG = {
  body: 'M48 207L92 226L101 158L122 203L156 132L186 168L206 137L224 160L262 126L293 117L300 139L357 121L352 150L392 152L428 152L412 174L468 200L444 224L493 248L458 266L486 290L452 312L470 332L440 352L452 394L440 430C420 436 395 440 372 440L250 384L196 380L150 372L124 330L110 250Z',
  under: 'M190 296C240 330 290 385 372 440L440 430L441 418C400 424 350 410 310 380C270 350 235 320 190 296Z',
  fringe: 'M50 214L92 226C130 222 170 232 196 252L208 304C190 272 150 256 104 262C80 252 62 240 50 214Z',
  farLeg: 'M114 350C134 344 158 344 166 350C172 392 170 425 160 446C150 454 120 454 106 448C104 430 106 392 114 350Z',
  belly: 'M160 366C195 352 245 362 285 386L345 414L366 426C372 440 352 448 320 446L190 446C168 436 156 396 160 366Z',
  neck: 'M176 285C200 300 210 340 192 374C176 382 156 384 140 380C170 362 182 322 176 285Z',
  head: 'M18 312C28 276 80 246 138 246C186 248 206 290 204 332C202 372 150 390 92 380C48 372 18 342 18 312Z',
  nose: 'M20 306C24 297 40 295 52 300C56 311 52 324 39 326C28 324 20 318 20 306Z',
  mouth: 'M36 332C48 348 66 354 77 343',
  ear: [198, 281, 28, 36, 16], earIn: [194, 286, 15, 23, 16], eye: [136, 299, 12, 17], eyeShine: [133, 291, 3.5],
  pawNear: [166, 450, 36, 15], pawRear: [320, 446, 44, 17],
  toes: { far: [[113, 441, 7]], near: [[154, 447, 8], [170, 454, 7]], rear: [[301, 450, 8], [316, 456, 7]] },
  stripes: [[150, 212, 172, 168, 13, 'l'], [198, 238, 235, 190, 15, 'l'], [258, 205, 310, 165, 16, 'l'], [250, 265, 305, 222, 15, 'l'], [280, 303, 383, 242, 14, 'l'], [335, 232, 386, 205, 10, 'l'], [330, 328, 402, 298, 14, 'l'], [366, 358, 426, 346, 14, 'l'], [386, 389, 416, 392, 10, 'l'], [420, 316, 450, 304, 9, 'l'], [242, 174, 272, 156, 12, 'd'], [326, 190, 368, 160, 14, 'd'], [400, 264, 430, 254, 10, 'd']],
  c: { quill: '#85594f', dark: '#6c473d', fringe: '#6f4639', stripeL: '#b97d69', stripeD: '#6f4a43', peach: '#ffd3b6', peachD: '#f7c291', pink: '#f27ab0', nose: '#3d3f43', eye: '#161616' },
};
const mixHex = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const hogEll = (e, fill, extra) => '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + e[3] + '" fill="' + fill + '"' + (e[4] ? ' transform="rotate(' + e[4] + ' ' + e[0] + ' ' + e[1] + ')"' : '') + (extra || '') + '/>';
const hogToes = (list, fill) => list.map(t => '<circle cx="' + t[0] + '" cy="' + t[1] + '" r="' + t[2] + '" fill="' + fill + '"/>').join('');
// Сам ёжик в 100×100: группа зеркалит и масштабирует систему референса (k = 0.198, голова справа, лапы на y ≈ 85).
const HOG_FIT = 'translate(100.56 -7.36) scale(-0.198 0.198)';
const hedge = ({ hat = '', body = 'hogbody', back = HOG.c.dark, front = HOG.c.quill } = {}) => {
  const c = HOG.c, quill = front, dark = back, fringe = mixHex(front, back, 0.7), sl = mixHex(front, '#ffcfae', 0.36), sd = mixHex(front, '#2b1612', 0.28);
  const stripes = HOG.stripes.map(s => '<path d="M' + s[0] + ' ' + s[1] + 'L' + s[2] + ' ' + s[3] + '" stroke="' + (s[5] === 'd' ? sd : sl) + '" stroke-width="' + s[4] + '"/>').join('');
  return '<g transform="' + HOG_FIT + '">'
    + '<path d="' + HOG.farLeg + '" fill="' + c.peachD + '"/>' + hogToes(HOG.toes.far, c.pink)
    + '<path d="' + HOG.body + '" fill="' + quill + '"/>'
    + '<path d="' + HOG.body + '" fill="url(#g-' + body + ')" opacity=".22"/>'
    + '<path d="' + HOG.under + '" fill="' + dark + '"/>'
    + '<g fill="none" stroke-linecap="round">' + stripes + '</g>'
    + '<path d="' + HOG.belly + '" fill="' + c.peach + '"/>'
    + hogEll(HOG.pawNear, c.peach) + hogEll(HOG.pawRear, c.peach) + hogToes(HOG.toes.near, c.pink) + hogToes(HOG.toes.rear, c.pink)
    + '<path d="' + HOG.neck + '" fill="' + c.peachD + '"/>'
    + '<path d="' + HOG.fringe + '" fill="' + fringe + '"/>'
    + '<path d="' + HOG.head + '" fill="' + c.peach + '"/>'
    + hogEll(HOG.ear, c.peach) + hogEll(HOG.earIn, c.pink)
    + hogEll(HOG.eye, c.eye) + '<circle cx="' + HOG.eyeShine[0] + '" cy="' + HOG.eyeShine[1] + '" r="' + HOG.eyeShine[2] + '" fill="#fff"/>'
    + '<path d="' + HOG.nose + '" fill="' + c.nose + '"/><path d="' + HOG.mouth + '" stroke="' + c.nose + '" stroke-width="5" fill="none" stroke-linecap="round"/>'
    + '</g>' + hat;
};
// Шляпы короля и ржавого ёжика сидят на макушке (около x 73, y 38 в системе 100×100)
const crownHat = '<g transform="translate(75 43) rotate(12) scale(.55)"><path d="M-15 7L-17-9-8-2 0-13 8-2 17-9 15 7Z" fill="url(#g-gold)" stroke="#b9791a" stroke-width="2" stroke-linejoin="round"/><circle cx="-17" cy="-9" r="2.6" fill="#e8467c"/><circle cx="0" cy="-13" r="3" fill="#4aa8ff"/><circle cx="17" cy="-9" r="2.6" fill="#e8467c"/></g>';
const gearHat = '<g transform="translate(75 41) rotate(10) scale(.6)"><g fill="#c9622a" stroke="#7a2f08" stroke-width="1.4" stroke-linejoin="round">' + Array.from({ length: 8 }, (_, i) => '<rect x="-2.4" y="-10.5" width="4.8" height="5.5" rx="1" transform="rotate(' + i * 45 + ')"/>').join('') + '</g><circle r="7" fill="#ffd09a" stroke="#7a2f08" stroke-width="2"/><circle r="2.6" fill="#7a2f08"/></g>';

const spikes = (cx, cy, r, n, len, fill) => Array.from({ length: n }, (_, i) => { const a = Math.PI * (0.55 + 1.35 * i / (n - 1)), d = 0.19; const p = k => `${(cx + Math.cos(a + k) * r).toFixed(1)},${(cy + Math.sin(a + k) * r).toFixed(1)}`; return `<path d="M${p(-d)} L${(cx + Math.cos(a) * (r + len)).toFixed(1)},${(cy + Math.sin(a) * (r + len)).toFixed(1)} L${p(d)}Z" fill="${fill}"/>`; }).join('');
const S = {
  berry: '<g stroke="#a0124f" stroke-width="1.5">' + [[35, 44], [50, 40], [65, 44], [28, 58], [43, 56], [58, 56], [72, 58], [36, 71], [51, 70], [66, 71], [50, 83]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="url(#g-pink)"/><circle cx="${x - 3}" cy="${y - 3}" r="2.4" fill="#fff" fill-opacity=".7" stroke="none"/>`).join('') + '</g><path d="M50 36l-14-12 10 3 4-10 4 10 10-3z" fill="url(#g-green)" stroke="#1f6a2c" stroke-width="2" stroke-linejoin="round"/>',
  apple: '<path d="M50 30c-14-10-34-2-34 22 0 22 16 38 28 38 4 0 4-2 6-2s2 2 6 2c12 0 28-16 28-38 0-24-20-32-34-22z" fill="url(#g-red)" stroke="#8d1520" stroke-width="2.5"/><path d="M50 30q-2-12 6-20" stroke="#5b3d2b" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M56 22q16-14 28-2-12 14-28 2z" fill="url(#g-green)" stroke="#1f6a2c" stroke-width="2"/><ellipse cx="32" cy="48" rx="6" ry="11" fill="#fff" fill-opacity=".45" transform="rotate(18 32 48)"/>',
  mush: '<path d="M38 56h24l4 30c0 4-4 6-16 6s-16-2-16-6z" fill="#f6e6d0" stroke="#a88a62" stroke-width="2.5"/><path d="M8 58C8 28 28 12 50 12s42 16 42 46c0 4-4 5-8 5H16c-4 0-8-1-8-5z" fill="url(#g-red)" stroke="#8d1520" stroke-width="2.5"/><circle cx="30" cy="34" r="7" fill="#fff"/><circle cx="56" cy="26" r="8" fill="#fff"/><circle cx="76" cy="44" r="6" fill="#fff"/><circle cx="42" cy="50" r="4.5" fill="#fff"/>',
  git: '<rect x="18" y="18" width="64" height="64" rx="8" transform="rotate(45 50 50)" fill="url(#g-gitc)" stroke="#8d230f" stroke-width="3"/><g stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"><path d="M42 36v28M42 52q0-12 16-14"/></g><g fill="#fff"><circle cx="42" cy="34" r="6.5"/><circle cx="42" cy="66" r="6.5"/><circle cx="60" cy="38" r="6.5"/></g>',
  orange: '<circle cx="50" cy="55" r="36" fill="url(#g-orange)" stroke="#b5560b" stroke-width="3"/><path d="M50 19q4-10 12-8-1 9-12 8z" fill="url(#g-green)" stroke="#1f6a2c" stroke-width="2"/><ellipse cx="36" cy="40" rx="8" ry="13" fill="#fff" fill-opacity=".38" transform="rotate(28 36 40)"/><circle cx="40" cy="55" r="3.4" fill="#3a2410"/><circle cx="60" cy="55" r="3.4" fill="#3a2410"/><path d="M38 66q12 12 24 0" stroke="#3a2410" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  cpp: '<path d="M50 8l36 21v42L50 92 14 71V29z" fill="url(#g-blue)" stroke="#0f2f7a" stroke-width="3.5" stroke-linejoin="round"/><path d="M50 18l27 16v32L50 82 23 66V34z" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2"/><text x="50" y="62" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="28" fill="#fff" stroke="#0f2f7a" stroke-width="1.2">C++</text>',
  // рыжий ёжик с шестерёнкой на макушке (раньше — «краб-шестерёнка»)
  rust: hedge({ body: 'rhogbody', back: '#8a3410', front: '#c9622a', hat: gearHat }),
  pi: '<path d="M22 20h60v52c0 8-6 12-12 12H30c-6 0-10-4-10-10 0-4 2-7 6-7h4V30c0-6-4-10-8-10z" fill="url(#g-parch)" stroke="#8a6a32" stroke-width="3" stroke-linejoin="round"/><path d="M22 20c-8 0-12 4-12 9s5 8 12 8" fill="#e2c78f" stroke="#8a6a32" stroke-width="3"/><text x="52" y="46" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="25" fill="#5b3fd0">∑</text><text x="52" y="70" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="700" font-size="25" fill="#7a55e0">π</text>',
  hog: hedge(), king: hedge({ hat: crownHat }),
  wild: '<circle cx="50" cy="50" r="46" fill="url(#g-glow)"/>'
    + '<rect x="20" y="8" width="60" height="84" rx="8" fill="#fff" stroke="#e2b036" stroke-width="4"/>'
    + '<rect x="26" y="14" width="48" height="72" rx="5" fill="none" stroke="#d6246e" stroke-opacity=".35" stroke-width="1.5"/>'
    + '<path d="M38 38c0-9 5-14 12-14s12 5 12 13c0 11-12 11-12 22" fill="none" stroke="#d6246e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="50" cy="73" r="5" fill="#d6246e"/>'
    + '<text x="30" y="27" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="12" fill="#d6246e">?</text>'
    + '<text x="70" y="79" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="12" fill="#d6246e" transform="rotate(180 70 75)">?</text>'
    + sparkle(22, 16, 5, '#ffd84a') + sparkle(80, 20, 6, '#fff'),
  scatter: '<path d="M50 6l38 12v28c0 24-16 38-38 48C28 84 12 70 12 46V18z" fill="url(#g-navy)" stroke="#0b1f4a" stroke-width="3.5" stroke-linejoin="round"/><path d="M50 16l28 9v21c0 17-11 28-28 36-17-8-28-19-28-36V25z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/><path d="M50 28l5.5 12 13 1.4-9.8 8.7 2.9 12.9L50 56.2 38.4 63l2.9-12.9-9.8-8.7 13-1.4z" fill="#fff6a0" stroke="#b9911a" stroke-width="2" stroke-linejoin="round"/>',
  bonus: '<path d="M20 44q30-44 60 0" stroke="#8a5a1e" stroke-width="6" fill="none" stroke-linecap="round"/><g>' + [[34, 40], [50, 34], [66, 40], [42, 46], [58, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="url(#g-pink)" stroke="#a0124f" stroke-width="2"/>`).join('') + '</g><path d="M12 48h76l-8 40H20z" fill="url(#g-wick)" stroke="#6b4513" stroke-width="3" stroke-linejoin="round"/><path d="M20 60h60M22 72h56M36 48l-5 40M50 48v40M64 48l5 40" stroke="#6b4513" stroke-opacity=".55" stroke-width="2.5"/>',
};
const capsule = (c1, c2) => `<circle cx="50" cy="50" r="34" fill="${c2}"/><path d="M16 50a34 34 0 0 1 68 0z" fill="${c1}"/><path d="M16 50h68" stroke="#fff" stroke-opacity=".7" stroke-width="3"/><ellipse cx="36" cy="32" rx="8" ry="5" fill="#fff" fill-opacity=".55" transform="rotate(-30 36 32)"/><circle cx="50" cy="50" r="34" fill="none" stroke="#2a2540" stroke-opacity=".5" stroke-width="3"/>`;
/* casino:step4 symbols — спрайты claude / itmo (логотипы по присланным изображениям) и seven / capsule (оригинальные) */
/* casino:step4 logos — логотипы Claude и ИТМО по присланным изображениям (трассировка в векторные контуры; плашка ИТМО 100×36.41 по центру) */
S.claude = "<g transform='translate(10 10) scale(0.8)'><rect width='100' height='100' rx='22.5' fill='#d77655'/><path fill='#fcf2ee' fill-rule='evenodd' d='M32.4 13.9L30.3 16.8L31.1 20.7L36.1 29.1L42.2 40L41.6 40.6L24 27.3L20.9 27.1L19.1 29.1L19.5 32.4L20.7 33.8L22.7 35L26.2 37.7L41.8 48L42.6 49L42.2 49.4L40.8 49.4L40.6 49.2L38.9 49.2L38.7 49L33 48.6L32.8 48.4L29.7 48.4L29.5 48.2L20.9 47.9L20.7 47.7L18.2 47.7L18 47.5L15 47.3L13.7 48.2L13.5 49.2L15 51.4L16.8 51.8L28.5 52.1L28.7 52.3L40.2 52.5L40.4 52.7L42 52.7L42.4 53.1L42.4 53.5L42 54.1L27.5 62.1L22.7 65.4L21.3 66.6L21.1 68.9L22.5 70.1L24 70.1L24.2 69.9L26.2 69.7L45.3 57.2L45.5 57.4L45.3 58.2L42.2 61.7L29.9 77.7L29.7 79.9L31.4 80.9L32 80.9L33 80.5L38.3 74.8L48.6 60.5L49.6 59.8L49.8 60.4L49.2 61.9L48.4 68L45.3 82.4L45.3 83L46.3 85.2L47.9 86.3L50.2 85.5L51.2 84.4L52.1 72.1L52.3 71.9L52.7 65.8L52.9 65.6L52.9 63.7L53.1 63.5L53.1 62.5L53.5 62.1L54.3 62.9L57.6 68.8L60.7 73.2L60.9 73.8L65.6 80.5L67.8 80.9L68.4 80.5L69.3 80.3L69.9 79.3L69.7 76.6L69.3 75.4L61.1 63.3L61.3 62.5L67.2 67.2L70.1 69.9L76.4 74.6L77.7 75L78.7 73.6L78.3 72.1L61.1 56.1L61.3 55.7L62.3 55.7L82 60.5L82.6 60.5L86.1 58.8L86.3 57.2L84.8 55.3L82.6 53.9L73.8 53.3L73.6 53.1L65.8 53.1L65.6 52.9L61.9 52.7L61.5 52.3L62.3 52L64.6 51.6L68 50.6L68.8 50.6L71.3 49.8L79.7 48.2L85.2 46.9L86.1 44.5L85.9 43.4L83.6 42.2L73.8 43.8L70.9 44.5L68.2 44.9L67.2 45.3L65.4 45.5L64.5 45.9L63.9 45.9L63.5 45.5L66 41L75.8 28.3L76.8 25L74.4 21.7L71.3 21.7L69.7 22.9L65 27.9L59.6 34.8L57.2 38.1L56.1 39.3L55.7 39.3L55.5 39.1L55.5 38.1L58.2 24.6L59.2 17.2L57.8 15.2L56.1 14.5L54.3 15.6L53.7 16.2L52.7 18.8L52.3 24.4L52.1 24.6L52.1 26.8L52 27L52 29.1L51.8 29.3L51.6 32.6L51.4 32.8L51.2 36.1L51 36.3L50.8 41.2L50.2 41.4L49.6 40.2L49.2 38.3L42.4 25L38.1 15L36.9 13.9L33.4 13.5Z'/></g>";
S.itmo = "<rect y='31.79' width='100' height='36.41' rx='18.2' fill='#000'/><path fill='#fff' fill-rule='evenodd' d='M48.8 42.5L48.8 57.3L52.7 57.3L52.7 45.4L52.8 45.3L57.5 57.3L61.7 57.3L66.4 45.4L66.5 45.5L66.5 57.3L70.5 57.3L70.5 42.5L63.7 42.5L59.9 51.9L59.6 52.2L55.6 42.5ZM32.3 42.5L32.3 46.1L37.7 46.1L37.8 46.2L37.8 57.3L41.7 57.3L41.7 46.2L41.8 46.1L47.3 46.1L47.3 42.5ZM12.9 42.5L12.9 57.3L21 57.3L26.6 43L26.9 42.6L27 42.7L27 57.3L30.9 57.3L30.9 42.5L23 42.5L17.2 56.7L16.9 57.2L16.8 57.1L16.8 42.5ZM28.2 37.3L27.7 37.6L27.1 38.4L27 39.7L27.3 40.2L27.8 40.8L28.3 41L29.6 41L30.1 40.8L30.6 40.2L30.9 39.7L30.8 38.4L30.6 38L29.8 37.3L29.5 37.2Z'/><path fill='#f0f0f0' fill-rule='evenodd' d='M77 42.6L76.2 42.9L75.1 43.4L73.8 44.4L73 45.3L72.1 46.9L71.8 48.1L71.8 48.6L71.7 48.7L71.7 51.2L71.8 51.2L71.8 51.7L72.1 52.9L73 54.5L73.9 55.5L75.1 56.4L76.2 56.9L77.4 57.3L78.4 57.4L78.5 57.5L80.3 57.5L80.4 57.4L81 57.4L82.6 56.9L83.7 56.4L85 55.4L85.8 54.5L86.7 52.9L87 51.7L87 51.2L87.1 51.1L87.1 48.8L87 48.7L87 48.1L86.7 46.9L86.1 45.8L85.3 44.8L84.5 44L82.8 43L81.3 42.5L80.3 42.5L80.2 42.4L78.6 42.4L78.5 42.5L77.9 42.5L77.8 42.5ZM78.6 45.9L80.2 45.9L81.4 46.4L82.6 47.4L83 48.2L83.2 48.8L83.2 49.1L83.3 49.2L83.3 50.6L83.2 50.7L83.2 51.1L82.8 52.1L82.2 52.8L81.7 53.3L81.1 53.6L80.2 53.9L78.6 53.9L77.4 53.5L76.7 53L76.1 52.3L75.6 51.1L75.6 50.7L75.5 50.6L75.5 49.2L75.6 49.1L75.6 48.8L75.8 48.2L76.1 47.5L76.6 46.9L77.4 46.4Z'/>";
const SEVEN_D = 'M20 15H81V30L53 87H34L58 34H20Z';
S.seven = '<path d="' + SEVEN_D + '" fill="#ffd54a" stroke="#c98d0a" stroke-width="11" stroke-linejoin="round"/>'
  + '<path d="' + SEVEN_D + '" fill="url(#g-red)" stroke="#7a0f1d" stroke-width="3.2" stroke-linejoin="round"/>'
  + '<path d="M27 21H73" stroke="#fff" stroke-opacity=".6" stroke-width="4.5" stroke-linecap="round"/><path d="M62 38L45 74" stroke="#fff" stroke-opacity=".3" stroke-width="3.5" stroke-linecap="round"/>' + sparkle(84, 14, 7, '#fff8c0') + sparkle(16, 80, 5, '#fff8c0');
// capsule объявлена выше (const capsule), поэтому символ собираем здесь
S.capsule = '<circle cx="50" cy="50" r="48" fill="url(#g-glow)"/><g transform="translate(50 52) scale(1.12) translate(-50 -50)">' + capsule('#ffe27a', '#e0861a') + '</g>' + sparkle(80, 20, 8, '#fff') + sparkle(18, 30, 5, '#fff6a0') + sparkle(84, 74, 4, '#fff6a0');
const ICONS = {
  'cap-common': capsule('#b7c4d6', '#6b7a90'), 'cap-rare': capsule('#7ec4ff', '#2a6fd0'), 'cap-epic': capsule('#d6a0ff', '#7a35d0'), 'cap-legendary': capsule('#ffe27a', '#e0861a'),
  pointer: '<path d="M50 94L26 40a26 26 0 1 1 48 0z" fill="url(#g-gold)" stroke="#8a5a0a" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="34" r="8" fill="#fff" stroke="#8a5a0a" stroke-width="3"/>',
  flame: '<path d="M52 6c4 20 26 28 26 52 0 20-12 34-28 34S22 78 22 60c0-12 6-20 12-26 2 8 6 12 10 12-2-14 0-30 8-40z" fill="url(#g-orange)" stroke="#b5470f" stroke-width="3" stroke-linejoin="round"/><path d="M50 52c3 8 14 12 14 24 0 8-6 14-14 14s-14-6-14-14c0-8 6-12 8-18 2 4 4 6 6 6z" fill="#ffe27a"/>',
};
export const SYMBOL_IDS = Object.keys(S);
export const SPRITE = `<svg id="sl-sprite" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${DEFS}</defs>${Object.entries(S).map(([id, body]) => `<symbol id="sl-${id}" viewBox="0 0 100 100"><title>${LABELS[id]}</title>${body}</symbol>`).join('')}${Object.entries(ICONS).map(([id, body]) => `<symbol id="sl-${id}" viewBox="0 0 100 100">${body}</symbol>`).join('')}</svg>`;
export function ensureSprite() { if (typeof document !== 'undefined' && !document.getElementById('sl-sprite')) document.body.insertAdjacentHTML('afterbegin', SPRITE); }
export const sym = (id, size = 64, cls = '') => '<svg class="sl-sym ' + cls + '" data-sym="' + id + '" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" role="img" aria-label="' + (LABELS[id] || '') + '"><use href="#sl-' + id + '"/></svg>';
/* casino:step4 skins — CSS-хуки тем барабанов. sym() ставит data-sym="id"; класс скина вешается на контейнер барабанов,
   правила вида .sk-arcade .sl-sym[data-sym="seven"] { filter: … } пишет шаг 6 (css/casino-themes.css). Сам рисунок не меняется. */
export const SYMBOL_SKINS = { forest: '', night: 'sk-night', server: 'sk-server', velvet: 'sk-velvet', arcade: 'sk-arcade', vault: 'sk-vault' };
export const skinClass = theme => SYMBOL_SKINS[String(theme || '').replace(/^theme:/, '')] || '';
export const symSkinned = (id, size = 64, theme = '', cls = '') => sym(id, size, (skinClass(theme) + ' ' + cls).trim());
export const icon = (id, size = 28, cls = '') => `<svg class="sl-ic ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><use href="#sl-${id}"/></svg>`;
