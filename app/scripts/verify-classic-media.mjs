// Контролируемый учебный документ: настоящие Markdown, KaTeX, PDF-экспорт и PDF.js.
import {chromium} from '@playwright/test';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('../docs/classic-plus-plus-evidence');
const markdown='# Проверка читалки\n\nКириллица и Latin: обычный текст, **важное определение**, ссылка и формула.\n\n## Математика\n\n$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$\n\n## Пример кода\n\n```cpp\nint sum(int n) {\n  return n * (n + 1) / 2;\n}\n```\n\n| Значение | Результат |\n| --- | --- |\n| 3 | 6 |\n| 10 | 55 |\n\nОбычные слова и названия должны оставаться читаемыми.\n';
const md='Конспекты/Проверка/Лекция_1/Пример.md';
const pdf='Конспекты/Проверка/Лекция_1/Пример.pdf';
const audio='Записи лекций/Проверка/Пример.wav';
const wav=Buffer.alloc(44+32000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
const browser=await chromium.launch();const results=[];
try {
for(const theme of ['light','dark']) {
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900},colorScheme:theme});
 await context.addInitScript(theme=>{localStorage.setItem('m3102-student-v1','{"login":""}');localStorage.setItem('m3102-settings-v1',JSON.stringify({theme,reduceMotion:true}));},theme);
 let pdfBytes;
 await context.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>{
  const url=r.request().url(),path=decodeURIComponent(new URL(url).pathname);
  if(path.endsWith(md))return r.fulfill({body:markdown,contentType:'text/plain'});
  if(path.endsWith(pdf)&&pdfBytes)return r.fulfill({body:pdfBytes,contentType:'application/pdf'});
  if(path.endsWith(audio))return r.fulfill({body:wav,contentType:'audio/wav'});
  if(url.includes('cdnjs.cloudflare.com')){const file=resolve('/tmp/classic-vendors',new URL(url).pathname.replaceAll('/','_'));if(existsSync(file))return r.fulfill({path:file,contentType:url.endsWith('.css')?'text/css':url.endsWith('.woff2')?'font/woff2':'text/javascript'});}
  return r.fulfill({body:'',contentType:url.includes('googleapis')?'text/css':'text/javascript'});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/#/note/'+encodeURI(md));
 await page.locator('#note-body .katex').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const fonts=await page.locator('#note-body').evaluate(el=>({body:getComputedStyle(el).fontFamily,math:getComputedStyle(el.querySelector('.katex')).fontFamily,code:getComputedStyle(el.querySelector('code')).fontFamily,width:el.getBoundingClientRect().width,wrap:document.querySelector('.wrap').getBoundingClientRect().width}));
 assert(fonts.body.includes('Golos'));assert(!fonts.math.includes('Golos'));assert(fonts.code.includes('mono'));assert(fonts.wrap>1280);
 await page.screenshot({path:`${out}/after-reader-fixture-1440-${theme}.png`});
 const downloadPromise=page.waitForEvent('download',{timeout:90000});await page.locator('#note-print-btn').click();const download=await downloadPromise;
 await download.saveAs(`${out}/reader-export-${theme}.pdf`);pdfBytes=readFileSync(`${out}/reader-export-${theme}.pdf`);assert(pdfBytes.length>10000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4173/#/view/'+encodeURI(pdf));await page.locator('#pdf-pages canvas').first().waitFor({timeout:20000});
 await page.screenshot({path:`${out}/after-pdf-390-${theme}.png`});
 await page.goto('http://127.0.0.1:4173/#/audio/'+encodeURI(audio));await page.locator('audio').waitFor();await page.waitForTimeout(300);
 await page.screenshot({path:`${out}/after-audio-390-${theme}.png`});
 assert.deepEqual(errors,[]);results.push({theme,fonts,exportBytes:pdfBytes.length,errors});await context.close();
}
writeFileSync(`${out}/media.json`,JSON.stringify({fixture:'Controlled educational Markdown and silent WAV; real renderer, font assets, export libraries and PDF.js',results},null,2));
console.log('Reader fonts, two PDF exports, PDF viewer and audio shell verified.');
} finally {await browser.close();}
