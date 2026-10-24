import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../js/slots-math.js';
import * as Art from '../js/slots-art.js';

// Шаг 4 казино: у каждого символа есть рисунок и подпись, ёжик нарисован новой геометрией, хуки скинов на месте.
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('каждый символ слотов нарисован и подписан', () => {
  for (const s of M.SYMBOLS) { assert.ok(Art.SYMBOL_IDS.includes(s), 'спрайт ' + s); assert.ok(Art.LABELS[s], 'подпись ' + s); assert.ok(Art.SPRITE.includes('id="sl-' + s + '"'), 'symbol ' + s); }
  for (const s of ['claude', 'itmo', 'seven', 'capsule']) assert.ok(Art.sym(s, 40).includes('data-sym="' + s + '"'), s);
});

test('SVG-спрайты: теги сбалансированы, ссылки на градиенты существуют', () => {
  const ids = new Set([...Art.SPRITE.matchAll(/id="(g-[\w-]+)"/g)].map(m => m[1]));
  for (const m of Art.SPRITE.matchAll(/url\(#(g-[\w-]+)\)/g)) assert.ok(ids.has(m[1]), 'градиент ' + m[1]);
  const open = (Art.SPRITE.match(/<(?!\/|!)[a-zA-Z]+(?:\s[^>]*?)?(?<!\/)>/g) || []).filter(t => !/^<(path|circle|ellipse|rect|stop|use|polyline|line)\b/.test(t)).length;;
  const close = (Art.SPRITE.match(/<\/[a-zA-Z]+>/g) || []).length;
  assert.equal(open, close);
});

test('ёжик: геометрия одна в SVG и canvas, ключи на месте', () => {
  const html = read('index.html'), art = read('js/slots-art.js');
  assert.ok(html.includes('casino:step4 hedgehog') && art.includes('casino:step4 hedgehog'));
  for (const key of ['body', 'under', 'fringe', 'farLeg', 'belly', 'neck', 'head', 'nose', 'mouth', 'stripes', 'toes']) assert.ok(html.includes(key + ':') && art.includes(key + ':'), key);
  const grab = src => /var HOG = (\{[^\n]*\n[\s\S]*?\n\});/.exec(src) || /const HOG = (\{[^\n]*\n[\s\S]*?\n\});/.exec(src);
  assert.equal(grab(html)[1], grab(art)[1]);
  for (const h of ['hog', 'king', 'rust']) assert.ok(Art.SPRITE.includes('translate(100.56 -7.36) scale(-0.198 0.198)'), h);
});

test('скины символов', () => {
  assert.equal(Art.skinClass('theme:arcade'), 'sk-arcade'); assert.equal(Art.skinClass('forest'), ''); assert.equal(Art.skinClass('nope'), '');
  assert.ok(Art.symSkinned('seven', 40, 'theme:vault').includes('sk-vault'));
});
