// Прежние библиотеки читалки загружаются только когда нужны. Новых CDN-зависимостей нет.
const libraries = {
  mermaid: ['mermaid', 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js'],
  pdf: ['pdfjsLib', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js'],
  exportPdf: ['jspdf', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
  capture: ['html2canvas', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'],
};
const pending = new Map();
export function loadClassicLibrary(name) {
  const [global, url] = libraries[name];
  if (window[global]) return Promise.resolve();
  if (pending.has(name)) return pending.get(name);
  const task = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (window[global]) resolve();
      else {
        pending.delete(name);
        script.remove();
        reject(new Error('Библиотека не запустилась'));
      }
    };
    script.onerror = () => {
      pending.delete(name);
      script.remove();
      reject(new Error('Не удалось загрузить библиотеку'));
    };
    document.head.append(script);
  });
  pending.set(name, task);
  return task;
}
