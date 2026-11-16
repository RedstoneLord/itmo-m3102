import {test,expect,type Page} from '@playwright/test';
test.use({serviceWorkers:'block'});
async function open(page:Page,hash='#/month/2026-11-14') {
  await page.addInitScript(() => localStorage.setItem('m3102-classic-view-v1', '{"version":1,"view":"classic"}'));
  await page.context().route('**/data/timetable-live.json', (route) => route.fulfill({ status: 404 }));
 await page.clock.install({time:new Date('2026-11-14T12:00:00+03:00')});
 await page.context().route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.fulfill({contentType:'text/javascript',body:r.request().url().includes('/marked/')?'window.marked={use(){}}':''}));
 await page.route('**/data/schedule.json',r=>r.fulfill({json:{anchorMonday:'2026-11-09',anchorParity:'odd',cycle:Array.from({length:14},(_,i)=>i%7===6?[]:[{id:'a',subject:'Дискретная математика: очень длинное русское название курса',kind:'lecture',start:'13:30',end:'15:00',room:'2304'},{id:'b',subject:'Основы программирования',kind:'lab',start:'15:20',end:'16:50',room:'1419'}]),vacations:[],overrides:{}}}));
 await page.addInitScript(()=>{localStorage.setItem('m3102-student-v1','{"login":""}');localStorage.setItem('m3102-settings-v1','{"theme":"auto","reduceMotion":true}');});
 await page.goto('../'+hash);
 await expect(page.locator('.timetable-page')).toBeVisible();
}
test('неделя: карточки дней, полные названия, постоянные цвета и переход к паре',async({page})=>{
 await open(page,'#/week/2026-11-14');
 await expect(page.locator('.week-day')).toHaveCount(7);
 await expect(page.locator('.week-day').first()).toContainText('Дискретная математика: очень длинное русское название курса');
 await expect(page.locator('.week-day').last()).toContainText('Без занятий');
 const card=page.locator('.timetable-lesson').first();
 const color=await card.getAttribute('data-subject-color');
 await page.locator('.week-day a').first().click();
 await expect(page.locator('.sched-entry').first()).toHaveAttribute('data-subject-color',color!);
 await expect(page.locator('.sched-card').first()).toContainText('Лекция');
});
test('месяц: 7 колонок, клавиатура, выбор дня и переход года',async({page})=>{
 await open(page);
 await expect(page.locator('.month-cell')).toHaveCount(42);
 const columns=await page.locator('.is-month').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 expect(columns).toBe(7);
 const current=page.locator('[data-month-day="2026-11-14"]');
 await current.focus();await page.keyboard.press('ArrowDown');
 await expect(page.locator('[data-month-day="2026-11-21"]')).toBeFocused();
 await expect(page.locator('.month-agenda h2')).toContainText('21 ноября');
 await page.reload();await expect(page.locator('[data-month-day="2026-11-21"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-overview-next]').click();
 await expect(page.locator('.timetable-period h2')).toContainText('декабрь 2026');
 await page.locator('[data-overview-next]').click();
 await expect(page.locator('.timetable-period h2')).toContainText('январь 2027');
});
test('календарный лист остаётся сеткой на телефоне, 140%, все даты доступны @phone',async({page})=>{
 await open(page);
 for(const width of [320,360,390,430,760]) {
  await page.setViewportSize({width,height:844});
  await page.evaluate(()=>document.documentElement.dataset.textScale='140');
  expect(await page.locator('.is-month').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(7);
  for(const day of await page.locator('[data-month-day]').all()) {
   const rect=await day.boundingBox();expect(rect!.width).toBeGreaterThanOrEqual(34);expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-month-day="2026-11-16"]').click();
  await expect(page.locator('.month-agenda')).toContainText('Ауд. 2304');
 }
});
test('система меняет семантические цвета без явного data-theme',async({page})=>{
 await open(page);await expect(page.locator('html')).not.toHaveAttribute('data-theme');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('body')).toHaveCSS('background-color','rgb(245, 246, 248)');
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('body')).toHaveCSS('background-color','rgb(18, 20, 26)');
});
test('месяц: настоящие подписи сохраняют читаемый цвет во всех палитрах',async({page})=>{
 await open(page);
 for(const theme of ['light','dark'] as const) {
  await page.emulateMedia({colorScheme:theme});
  for(const palette of ['purple','orange','green','blue','cyan','gold','neon','aurora','graphite','sakura','ruby','tropic']) {
   await page.evaluate(p=>{if(p==='purple')document.documentElement.removeAttribute('data-palette');else document.documentElement.dataset.palette=p;},palette);
   await expect(page.locator('.month-previews a').first()).toHaveCSS('color',theme==='light'?'rgb(32, 37, 48)':'rgb(237, 240, 246)');
  }
 }
});
