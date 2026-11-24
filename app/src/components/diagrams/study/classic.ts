export { applyLayout, separateFlowNodes, classicEdges, sizeNode, NODE_FONT } from '../classicGraph';
import { mountStudyDiagram, parseStudyDiagram, printStudySvg, studyArt } from './player';
import { escapeMarkup, isStudyLanguage, STUDY_LANGUAGES, studyTypes, type StudyLanguage } from './source';

export { isStudyLanguage, mountStudyDiagram, parseStudyDiagram, printStudySvg, STUDY_LANGUAGES, studyArt, studyTypes };

export function editDiagramButton() {
  return `<button class="dgm-edit" type="button" data-dgm-edit data-pdf-hide aria-label="Редактировать" title="Редактировать"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20z"/></svg></button>`;
}

export function studyFigure(lang: StudyLanguage, source: string) {
  try {
    const model = parseStudyDiagram(lang, source);
    const { title, caption } = model.header;
    return `<figure class="dgm" data-study-figure data-dgm-lang="${lang}" data-dgm-src="${escapeMarkup(source)}">
      ${title ? `<div class="study-title">${escapeMarkup(title)}</div>` : ''}
      <div class="dgm-art">${studyArt(model)}</div>
      ${caption ? `<figcaption>${escapeMarkup(caption)}</figcaption>` : ''}
      ${editDiagramButton()}
    </figure>`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `<div class="mermaid-err" role="alert">${escapeMarkup(message)}</div>`;
  }
}

const mounted = new WeakSet<HTMLElement>();

export function mountStudyFigures(container: HTMLElement) {
  for (const figure of container.querySelectorAll<HTMLElement>('[data-study-figure]')) {
    const { dgmLang, dgmSrc } = figure.dataset;
    if (!dgmLang || !isStudyLanguage(dgmLang) || !dgmSrc || mounted.has(figure)) continue;
    mountStudyDiagram(figure, parseStudyDiagram(dgmLang, dgmSrc));
    mounted.add(figure);
  }
}

export function printStudyFigures(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.study-print').forEach((frame) => {
    frame.style.display = 'block';
  });
}

export function resolveStudySvg(svg: SVGSVGElement, markup: string) {
  const style = getComputedStyle(svg);
  return markup.replace(/var\((--study-[a-z]+)\)/g, (_, name) => style.getPropertyValue(name).trim() || '#18233a');
}
