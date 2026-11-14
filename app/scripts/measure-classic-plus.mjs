// Три холодных мобильных прогона каждого выпуска. Зависимости CDN переигрываются локально одинаково.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
const cacheRoot=join(homedir(),'.npm/_npx');
const packageRoot=readdirSync(cacheRoot).map(x=>join(cacheRoot,x,'node_modules')).find(x=>existsSync(join(x,'lighthouse/core/index.js')));
if(!packageRoot) throw new Error('Install @lhci/cli@0.15.1 before running');
const {default:lighthouse}=await import(pathToFileURL(join(packageRoot,'lighthouse/core/index.js')));
const {launch}=await import(pathToFileURL(join(packageRoot,'chrome-launcher/dist/index.js')));
const before=readFileSync('/tmp/classic-previous-path','utf8').trim();
let root=before;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer((req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'') || 'index.html';
 if(path.includes('..')){res.writeHead(400);res.end();return;}
 if(path==='__seed.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Profile setup</title>');return;}
 if(path==='sw.js'){res.writeHead(404);res.end();return;}
 if(path.startsWith('__vendor__/')) {
  const file=resolve('/tmp/classic-vendors',path.slice(11).replaceAll('/','_'));
  if(!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'text/javascript','Cache-Control':'no-store'});res.end(readFileSync(file));return;
 }
 const file=resolve(root,path);
 if(!existsSync(file)){res.writeHead(404);res.end();return;}
 let bytes=readFileSync(file);
 if(path==='index.html') bytes=Buffer.from(bytes.toString().replaceAll('https://cdnjs.cloudflare.com/','/__vendor__/').replace(/<link[^>]+href="https:\/\/fonts\.googleapis\.com[^>]+>/g,''));
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const out=resolve('../docs/classic-plus-plus-evidence');mkdirSync(out,{recursive:true});const rows=[];
try {
 for(const phase of ['before','after']) {
  root=phase==='before'?before:resolve('site');
  for(let run=1;run<=3;run++) {
   const chrome=await launch({chromePath:chromium.executablePath(),chromeFlags:['--headless=new','--no-sandbox','--disable-gpu']});
   const browser=await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
   const page=await browser.contexts()[0].newPage();
   await page.goto(url+'__seed.html');await page.evaluate(()=>{localStorage.setItem('m3102-student-v1','{"login":""}');localStorage.setItem('m3102-settings-v1','{"theme":"light","reduceMotion":true}');});
   const cdp=await page.context().newCDPSession(page);await cdp.send('Network.clearBrowserCache');
   const result=await lighthouse(url,{port:chrome.port,output:'json',logLevel:'error',disableStorageReset:true,onlyCategories:['performance','accessibility','best-practices'],formFactor:'mobile',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:1,disabled:false},maxWaitForLoad:10000,blockedUrlPatterns:['*googleapis.com*','*gstatic.com*','*api.github.com*','*raw.githubusercontent.com*']});
   const lhr=result.lhr;
   const row={phase,run,performance:lhr.categories.performance.score,accessibility:lhr.categories.accessibility.score,bestPractices:lhr.categories['best-practices'].score,cls:lhr.audits['cumulative-layout-shift'].numericValue,lcp:lhr.audits['largest-contentful-paint'].numericValue,tbt:lhr.audits['total-blocking-time'].numericValue,transfer:lhr.audits['total-byte-weight'].numericValue,requests:lhr.audits['network-requests'].details.items.length};
   await browser.close();await chrome.kill();
   rows.push(row);writeFileSync(`${out}/lighthouse-${phase}-${run}.json`,JSON.stringify(lhr));console.log(JSON.stringify(row));
  }
 }
 writeFileSync(`${out}/performance.json`,JSON.stringify({method:'Fresh Chromium profile each run; Lighthouse mobile simulated throttling; same localhost server and Chrome, 390x844, cold HTTP cache, returning Guest, CDN replay; remote group API blocked; no SW during performance sampling',rows},null,2));
} finally {await new Promise(r=>server.close(r));}
