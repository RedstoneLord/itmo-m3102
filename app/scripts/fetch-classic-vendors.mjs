// Только для повторяемой проверки: существующие upstream-зависимости, без изменения поставки сайта.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const html=readFileSync('../index.html','utf8');
const urls=[...new Set(html.match(/https:\/\/cdnjs\.cloudflare\.com\/[^"'\s)<>]+/g))];
mkdirSync('/tmp/classic-vendors',{recursive:true});
for(const url of urls) {
 const response=await fetch(url);if(!response.ok) throw new Error(url+': '+response.status);
 const data=Buffer.from(await response.arrayBuffer());
 writeFileSync(resolve('/tmp/classic-vendors',new URL(url).pathname.replaceAll('/','_')),data);
 if(url.endsWith('.css')) for(const match of data.toString().matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) {
   if(!/\.woff2(?:[?#]|$)/.test(match[1])) continue;
   const font=new URL(match[1],url).href;if(!urls.includes(font))urls.push(font);
 }
}
console.log(`${urls.length} existing vendor assets saved for local measurement replay`);
