import { describeGeometry, geometrySvg, parseGeometry } from './geometry';
import { matrixSvg, parseMatrix } from './matrix';
import { escapeMarkup, type StudyLanguage } from './source';

export type StudyModel = ReturnType<typeof parseGeometry> | ReturnType<typeof parseMatrix>;
export const parseStudyDiagram = (lang: StudyLanguage, source: string): StudyModel =>
  lang === 'matrix' ? parseMatrix(source) : parseGeometry(source);

export function printStudySvg(model: StudyModel) {
  return model.kind === 'matrix' ? matrixSvg(model, model.printIndex) : geometrySvg(model, model.view, true);
}

const button = (action: string, text: string, label = text) =>
  `<button type="button" data-study-action="${action}" aria-label="${label}">${text}</button>`;

export function studyArt(model: StudyModel) {
  const geometry = model.kind === 'geometry3d';
  const name = geometry ? 'Поворот сцены стрелками, масштаб клавишами плюс и минус, сброс клавишей 0' : 'Матрица';
  const image = geometry ? geometrySvg(model, model.view, true, true) : matrixSvg(model, 0, true);
  const matrixControls =
    model.kind === 'matrix' && model.frames.length > 1
      ? `<div class="study-controls" role="group" aria-label="Шаги матрицы">
           ${button('first', 'С начала')}${button('previous', 'Назад')}${button('next', 'Далее')}
           <label>Шаг <input type="range" min="0" max="${model.frames.length - 1}" value="0" data-study-step></label>
           <output data-study-status aria-live="polite"></output>
         </div>`
      : '';
  const geometryControls = geometry
    ? `<div class="study-controls" role="group" aria-label="Вид 3D-сцены">
         ${button('left', '↶', 'Повернуть влево')}${button('right', '↷', 'Повернуть вправо')}
         ${button('up', '↑', 'Повернуть вверх')}${button('down', '↓', 'Повернуть вниз')}
         ${button('zoom-in', '+', 'Приблизить сцену')}${button('zoom-out', '−', 'Отдалить сцену')}
         ${button('x', 'YZ', 'Вид вдоль оси x')}${button('y', 'XZ', 'Вид вдоль оси y')}${button('z', 'XY', 'Вид вдоль оси z')}
         ${button('reset', 'Сбросить вид')}
         ${model.shapes.some((shape) => shape.type === 'plane') ? '<label><input type="checkbox" data-study-plane checked> Плоскость</label>' : ''}
       </div>
       <details class="study-description"><summary>Координаты объектов</summary>
       <ul>${describeGeometry(model)
         .map((line) => `<li>${escapeMarkup(line)}</li>`)
         .join('')}</ul></details>`
    : '';
  return `<div class="study-diagram" data-study-kind="${model.kind}">
    <div class="study-live" data-pdf-hide>
      <div class="study-stage" data-study-stage tabindex="0" role="group" aria-label="${name}">${image}</div>
      ${geometryControls}${matrixControls}
    </div>
    <div class="study-print" data-export-frame>${printStudySvg(model)}</div>
  </div>`;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function mountStudyDiagram(root: HTMLElement, model: StudyModel) {
  const stage = root.querySelector<HTMLElement>('[data-study-stage]')!;
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const controls = root.querySelector<HTMLElement>('.study-controls');

  if (model.kind === 'matrix') {
    let step = 0;
    const range = root.querySelector<HTMLInputElement>('[data-study-step]');
    const status = root.querySelector<HTMLOutputElement>('[data-study-status]');
    const last = model.frames.length - 1;
    const setStep = (value: number) => {
      step = clamp(value, 0, last);
      stage.innerHTML = matrixSvg(model, step, true);
      if (range) range.value = String(step);
      if (status) status.value = `${step} из ${last} · ${model.frames[step]!.description}`;
      for (const action of ['first', 'previous', 'next']) {
        const control = controls?.querySelector<HTMLButtonElement>(`[data-study-action="${action}"]`);
        control?.setAttribute('aria-disabled', String(action === 'next' ? step === last : step === 0));
      }
    };
    controls?.addEventListener(
      'click',
      (event) => {
        const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-study-action]');
        if (!target || target.getAttribute('aria-disabled') === 'true') return;
        setStep(target.dataset.studyAction === 'first' ? 0 : step + (target.dataset.studyAction === 'next' ? 1 : -1));
      },
      options,
    );
    range?.addEventListener('input', () => setStep(Number(range.value)), options);
    setStep(0);
  } else {
    let camera = { ...model.view };
    let pointer: { id: number; x: number; y: number } | undefined;
    const plane = root.querySelector<HTMLInputElement>('[data-study-plane]');
    const draw = () => {
      stage.innerHTML = geometrySvg(model, camera, plane?.checked ?? false, true);
    };
    const rotate = (x: number, y: number) => {
      camera.yaw = (camera.yaw + x) % 360;
      camera.pitch = clamp(camera.pitch + y, -90, 90);
    };
    const zoom = (factor: number) => {
      camera.zoom = clamp(camera.zoom * factor, 0.45, 4);
    };
    const act = (action: string) => {
      switch (action) {
        case 'left':
          rotate(-15, 0);
          break;
        case 'right':
          rotate(15, 0);
          break;
        case 'up':
          rotate(0, 15);
          break;
        case 'down':
          rotate(0, -15);
          break;
        case 'zoom-in':
          zoom(1.18);
          break;
        case 'zoom-out':
          zoom(1 / 1.18);
          break;
        case 'x':
          camera = { ...camera, yaw: 90, pitch: 0 };
          break;
        case 'y':
          camera = { ...camera, yaw: 0, pitch: 0 };
          break;
        case 'z':
          camera = { ...camera, yaw: 0, pitch: 90 };
          break;
        case 'reset':
          camera = { ...model.view };
          if (plane) plane.checked = true;
          break;
        default:
          return;
      }
      draw();
    };
    controls?.addEventListener(
      'click',
      (event) => {
        const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-study-action]');
        if (target) act(target.dataset.studyAction!);
      },
      options,
    );
    plane?.addEventListener('change', draw, options);
    stage.addEventListener(
      'keydown',
      (event) => {
        const actions: Record<string, string> = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
          '+': 'zoom-in',
          '-': 'zoom-out',
          '0': 'reset',
        };
        if (!Object.hasOwn(actions, event.key)) return;
        event.preventDefault();
        act(actions[event.key]!);
      },
      options,
    );
    stage.addEventListener(
      'pointerdown',
      (event) => {
        if (pointer || event.button !== 0) return;
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        stage.setPointerCapture(event.pointerId);
      },
      options,
    );
    stage.addEventListener(
      'pointermove',
      (event) => {
        if (!pointer || pointer.id !== event.pointerId) return;
        rotate((event.clientX - pointer.x) * 0.55, (event.clientY - pointer.y) * 0.55);
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        draw();
      },
      options,
    );
    stage.addEventListener(
      'lostpointercapture',
      () => {
        pointer = undefined;
      },
      options,
    );
  }

  return () => abort.abort();
}
