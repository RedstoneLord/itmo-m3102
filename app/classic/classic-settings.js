import { ic } from './icons.js';

// Узлы перемещаются, а не копируются: старые обработчики и значения полей сохраняются.
export function organizeSettings(page) {
  if (!page.querySelector('#student-settings') || !page.querySelector('.prefs-extra')) return;
  let content = page.querySelector('.settings-content');
  if (content) return;
  const categories = [
    ['profile', 'Профиль'],
    ['home', 'Главная'],
    ['appearance', 'Оформление'],
    ['reading', 'Чтение и доступность'],
    ['data', 'Данные и офлайн'],
  ];
  const nav = document.createElement('nav');
  nav.className = 'settings-nav';
  nav.setAttribute('aria-label', 'Разделы настроек');
  nav.innerHTML = categories
    .map(([id, title]) => `<button class="btn2" data-settings-category="${id}" aria-controls="settings-${id}">${title}</button>`)
    .join('');
  content = document.createElement('div');
  content.className = 'settings-content';
  const sections = new Map(
    categories.map(([id, title]) => {
      const section = document.createElement('section');
      section.id = `settings-${id}`;
      section.setAttribute('aria-label', title);
      section.hidden = id !== 'profile';
      content.append(section);
      return [id, section];
    }),
  );
  for (const group of [...page.children]) {
    if (group.classList.contains('intro')) continue;
    if (group.id === 'home-settings-profile') sections.get('profile').append(group);
    else if (group.querySelector('[data-home-config]')) sections.get('home').append(group);
    else if (group.id === 'student-settings') sections.get('data').append(group);
    else if (group.classList.contains('prefs-extra')) sections.get('reading').append(group);
    else if (group.classList.contains('settings-group')) sections.get('appearance').append(group);
    else if (group.tagName === 'H2') group.remove();
  }
  // Узкий экспорт внешнего вида относится к данным, а параметры чтения остаются короткими.
  const reading = sections.get('reading');
  const data = sections.get('data');
  const disclosure = document.createElement('details');
  disclosure.innerHTML = '<summary>Перенос и сброс только настроек</summary>';
  for (const node of [...reading.querySelectorAll('.settings-note,.prefs-actions,[data-prefs-import],.prefs-status')]) {
    if (node.parentElement.closest('.prefs-actions')) continue;
    // Пояснения чекбоксов остаются рядом со своими настройками.
    if (node.classList.contains('settings-note') && !node.classList.contains('prefs-status') && !node.textContent.startsWith('Экспорт и импорт'))
      continue;
    disclosure.append(node);
  }
  data.append(disclosure);
  disclosure.className = 'prefs-extra';
  const back = document.createElement('button');
  back.className = 'btn2 btn-quiet settings-category-back';
  back.innerHTML = `${ic('arrowLeft', 18)} Все настройки`;
  page.append(nav, back, content);
  const select = (id, focus = false) => {
    for (const [key, section] of sections) section.hidden = key !== id;
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.settingsCategory === id ? 'page' : 'false'));
    page.dataset.categoryOpen = id;
    if (focus && matchMedia('(max-width:760px)').matches) back.focus();
  };
  nav.addEventListener('click', (e) => {
    const button = e.target.closest('[data-settings-category]');
    if (button) select(button.dataset.settingsCategory, true);
  });
  back.onclick = () => {
    const id = page.dataset.categoryOpen;
    delete page.dataset.categoryOpen;
    nav.querySelector(`[data-settings-category="${id}"]`)?.focus();
  };
  nav.querySelector('button').setAttribute('aria-current', 'page');
  // Прямые ссылки открывают нужную категорию и на телефоне.
  const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('section');
  if (sections.has(requested)) select(requested);
}
