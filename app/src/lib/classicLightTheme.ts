/** Только собранная классическая версия. Встраиваем в HTML: работает и в его офлайн-кеше, без нового запроса. */
const rules = `
& {
  color-scheme: light;
  --bg: #fff;
  --card: #fff;
  --text: #20232e;
  --muted: #596071;
  --border: #dde1e9;
  --bgfx-base: #fff;
  --gl-bg-a: #fff;
  --gl-bg-b: #fff;
  --hd-shadow: none;
  --light-accent: color-mix(in oklab, var(--accent) 72%, #182030);
  --light-accent2: color-mix(in oklab, var(--accent2) 64%, #182030);
  --ok: #217044;
  --warn: #87500b;
  --danger: #b52f45;
}

/* Белая основа остаётся белой до конца длинной страницы, при чтении и в любой палитре. */
& .bgfx { background: #fff; }
& .bgfx-hog { opacity: .025; }
& .bgfx-stripes { opacity: .035; }
& .bgfx-glow { opacity: .035; }
& .bgfx::before { opacity: .06; }
& header, & .bottom-nav { background: rgb(255 255 255 / .97); }
& .brand-logo { filter: invert(1); }
& .gh-link img { filter: none; }

/* Герой сохраняет акценты и орбиты, но получает собственную светлую поверхность. */
& .home-hero {
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border);
  box-shadow: 0 12px 32px rgb(30 40 65 / .045);
}
& .home-hero::before {
  background: radial-gradient(circle at 85% 100%, color-mix(in srgb, var(--accent2) 13%, transparent), transparent 55%),
    linear-gradient(120deg, #fff 15%, color-mix(in srgb, var(--accent) 5%, #fff));
}
& .home-hero h1, & .hero-date strong { color: var(--text); text-shadow: none; }
& .home-hero .sub, & .hero-date span { color: var(--muted); text-shadow: none; }
& .hero-date { border-color: var(--border); }
& .hero-period { color: var(--light-accent); text-shadow: none; }
& .hero-orbit {
  border-color: color-mix(in srgb, var(--accent) 16%, transparent);
  box-shadow: 0 0 0 65px color-mix(in srgb, var(--accent) 3%, transparent),
    0 0 0 130px color-mix(in srgb, var(--accent) 2%, transparent);
}
& .hero-hedgehog { filter: drop-shadow(0 3px 5px rgb(30 40 65 / .12)); }
& .home-hero::after {
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  mix-blend-mode: normal;
}
&[data-palette='aurora'] .home-hero::after { opacity: .12; }

/* Непрозрачные вложенные карточки и формы вместо серого стекла поверх декора. */
& .dash-panel.homework-panel .hw-item,
& .sched-homework-slot .hw-item, & .dash-panel .deadline-row {
  background: var(--card);
}
& .app-dialog { background: var(--card); box-shadow: 0 20px 65px rgb(30 40 65 / .16); }
& .app-dialog::backdrop, & .ss-overlay, & .side-backdrop {
  background: rgb(35 42 60 / .22);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
& input::placeholder, & textarea::placeholder { color: var(--muted); opacity: 1; }
& .ss-box kbd, & .ss-text small, & .plan-hint, & .empty-line { opacity: 1; }
& .sched-entry.is-past { opacity: 1; }

/* У светлых палитр исходный акцент слишком бледный для небольшого текста на белом. */
& .panel-head > a, & .sched-eyebrow, & .deadline-day, & .deadline-status,
& .material-icon, & .material-arrow, & .hw-due, & .hw-origin, & .hw-link,
& .tab.active, & .bn-item.active, & .fmt-pill, & .fact-pill,
& .lec.is-current .lec-name, & .lec-file.is-active, & .quiz-kind, & .quiz-chips span,
& .cs-chip, & .cs-more-ic, & .ro-hint b, & .ro-stake-stat b,
& .prose a, & .crumbs a, & .ss-kind { color: var(--light-accent); }
& .intro h1, & .quiz-full .quiz-title {
  background-image: linear-gradient(135deg, var(--light-accent), var(--light-accent2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: none;
}
& .role-pill { color: var(--ok); }
& .sched-kind, & .sched-live-text, & .link-badge, & .link-subject {
  color: color-mix(in oklab, var(--tone) 75%, #182030);
}
/* Фото студентов сохраняют свой тёмный градиент и белые подписи. */
& .student-overlay .fact-pill, & .student-overlay .role-pill { color: #fff; }
& .dl-page { --dl-ok: var(--ok); --dl-warn: var(--warn); --dl-danger: var(--danger); }
& .quiz { --q-ok: var(--ok); --q-warn: var(--warn); --q-bad: var(--danger); }
& .deadline-row.is-late .deadline-status, & .hw-due.overdue,
& .quiz-err, & .form-error, & .diagram-error, & .diagram-source-wrap pre .is-error,
& .prose .mermaid-err { color: var(--danger); }
& #sched-override, & .sched-edit-warning { color: var(--warn); }
& .deadline-row.is-late .deadline-status { background: color-mix(in srgb, var(--danger) 8%, #fff); }

/* На светлых заливках кнопок белые буквы пропадают (циан, зелёная и особые палитры). */
& .btn-primary, & .plan-form button, & .side-fab,
& .hw-filters button[aria-pressed='true'], & .mat-switch a.is-active,
& .week-indicator, & .week-pill.sel {
  background: var(--light-accent);
  color: #fff;
  border-color: var(--light-accent);
}
& .week-pill[aria-selected='true'], & .week-pill[aria-selected='true'] strong,
& .week-pill[aria-selected='true'] .week-dots { color: #fff; }
& .quiz-opt.is-sel .quiz-mark, & .font-option[aria-checked='true'] .font-option-tick {
  background: var(--light-accent);
  border-color: var(--light-accent);
}
& .quiz-opt.is-correct .quiz-mark { background: var(--ok); border-color: var(--ok); }
& .quiz-opt.is-wrong .quiz-mark { background: var(--danger); border-color: var(--danger); }

/* Светлая подсветка кода: недостаточно сменить только фон atom-one-dark. */
& .prose pre { background: #f6f8fb; color: var(--text); border: 1px solid var(--border); }
& .prose .hljs { background: transparent; color: var(--text); }
& .prose :not(pre) > code { background: #eef1f6; color: var(--text); }
& .prose .code-copy { background: #fff; color: var(--muted); border-color: var(--border); }
& .prose .code-copy.copied { color: var(--ok); border-color: var(--ok); }
& .hljs-comment, & .hljs-quote, & .hljs-meta { color: #596579; }
& .hljs-keyword, & .hljs-selector-tag, & .hljs-doctag { color: #8138a1; }
& .hljs-number, & .hljs-literal, & .hljs-symbol, & .hljs-bullet,
& .hljs-variable, & .hljs-template-variable, & .hljs-attr { color: #855219; }
& .hljs-string, & .hljs-regexp, & .hljs-addition { color: #287344; }
& .hljs-title, & .hljs-section, & .hljs-selector-id,
& .hljs-built_in, & .hljs-builtin-name, & .hljs-link { color: #2458a6; }
& .hljs-type, & .hljs-class .hljs-title { color: #80520c; }
& .hljs-tag, & .hljs-name, & .hljs-attribute, & .hljs-deletion { color: #ad3543; }
& .hljs-subst { color: var(--text); }
& .callout { background: color-mix(in srgb, var(--c-color) 7%, #fff); }
& .callout-title { color: color-mix(in oklab, var(--c-color) 65%, #182030); }
& .prose blockquote { color: var(--muted); }

/* Встроенный проигрыватель алгоритмов добавляет свои стили после загрузки конспекта. */
& .arr-code { background: #f6f8fb; }
& .arr-code-head { color: var(--muted); border-color: var(--border); }
& .arr-code-body, & .arr-line.is-current { color: var(--text); }
& .arr-line .ln { color: var(--muted); }
& .arr-line.is-current {
  background: color-mix(in srgb, var(--accent) 10%, #fff);
  border-left-color: var(--light-accent);
}
& .arr-res.is-true, & .arr-log-row .t, & .ro-sum-total.is-plus { color: var(--ok); }
& .arr-res.is-false, & .arr-log-row .f { color: var(--danger); }
& .arr-kind { color: var(--light-accent); }
& .arr-controls .arr-play { background: var(--light-accent); border-color: var(--light-accent); }
& .sl-jp b {
  background: none;
  color: var(--warn);
}

/* Наведение тоже остаётся светлым и берёт выбранную палитру. */
@media (hover: hover) {
  & .btn-primary:hover, & .plan-form button:hover { background: var(--light-accent2); border-color: var(--light-accent2); }
  & .card:hover, & .material-link:hover, & .dash-panel:hover,
  & .dl-card:hover, & .hw-item:hover, & .link-card:hover {
    box-shadow: 0 6px 18px rgb(30 40 65 / .07);
  }
  & .dash-panel.homework-panel .hw-item:hover { background: color-mix(in srgb, var(--accent) 4%, #fff); }
}
`;

// Один набор правил для явной и системной светлой темы. Явный выбор всегда важнее системного.
// Обычные селекторы без @scope/@container: не требуем новой поддержки CSS от классического сайта.
export const CLASSIC_LIGHT_THEME = `
@media screen and (prefers-color-scheme: light) {
  ${rules.replaceAll('&', ':root:not([data-theme="dark"])')}
}
@media screen {
  ${rules.replaceAll('&', ':root[data-theme="light"]')}
}
`;
