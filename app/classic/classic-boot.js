// Этот маленький обычный скрипт работает даже при ошибке связывания ES-модулей.
(() => {
  let healthy = false;
  const recover = () => {
    if (healthy || document.getElementById('classic-boot-recovery')) return;
    const box = document.createElement('section');
    box.id = 'classic-boot-recovery';
    box.className = 'dash-panel';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<h1>Не удалось открыть сайт</h1><p>Часть файлов не загрузилась. Проверьте соединение и повторите попытку. Ваши задачи и прогресс сохранены.</p><button class="btn2 btn-primary">Повторить загрузку</button><p role="status"></p>';
    box.querySelector('button').onclick = async () => {
      const button = box.querySelector('button');
      button.disabled = true;
      box.querySelector('[role=status]').textContent = 'Проверяем выпуск сайта…';
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        await registration?.update();
        if (registration?.waiting) {
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          registration.waiting.postMessage({ type: 'ACTIVATE_CLASSIC' });
        } else location.reload();
      } catch {
        button.disabled = false;
        box.querySelector('[role=status]').textContent = 'Нет соединения. Можно повторить позже, данные остаются в браузере.';
      }
    };
    document.querySelector('#content')?.replaceChildren(box);
  };
  document.addEventListener('classic:booted', () => {
    healthy = true;
  });
  window.addEventListener('error', (e) => {
    if (/module|export|import|script/i.test(e.message || '')) recover();
  });
  setTimeout(recover, 12000);
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'CLASSIC_RELEASE_QUERY') event.ports[0]?.postMessage(document.documentElement.dataset.classicRelease || 'legacy');
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker?.ready
      .then((registration) => {
        const offer = () => {
          if (!registration.waiting || !healthy || document.getElementById('classic-shell-update')) return;
          const row = document.createElement('aside');
          row.id = 'classic-shell-update';
          row.className = 'student-actions';
          row.setAttribute('aria-label', 'Обновление сайта');
          row.innerHTML =
            '<span>Доступна новая версия сайта.</span><button class="btn2" data-shell-reload>Обновить сайт</button><button class="btn2 btn-quiet" data-shell-later>Позже</button>';
          row.querySelector('[data-shell-later]').onclick = () => row.remove();
          row.querySelector('[data-shell-reload]').onclick = () => {
            if (!registration.waiting) {
              location.reload();
              return;
            }
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
            registration.waiting.postMessage({ type: 'ACTIVATE_CLASSIC' });
          };
          document.querySelector('.wrap>footer')?.before(row);
        };
        offer();
        registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', offer));
      })
      .catch(() => {});
  });
})();
