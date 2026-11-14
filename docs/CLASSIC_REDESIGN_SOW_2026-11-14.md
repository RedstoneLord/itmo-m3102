# Classical site redesign: design audit and statement of work

Date: 14 November 2026. Source revision reviewed: `df97ee0`.

Audience: product designer and implementing developer/agent.
Status: implementation-ready brief. This document does not implement or publish changes.

## 1. Objective and scope

Make the classical version a coherent, readable student dashboard: quickly understand the next class, see today's schedule, and reach learning materials. Keep its identity, group content, existing routes, games, and personal progress.

The principal problem is inconsistent hierarchy. The original dashboard, later additions, and settings use different structures and densities. Generic paragraphs occupy prominent cards, setup controls compete with useful information, and the page exposes too many blocks before the visitor has chosen anything.

This is one coordinated redesign covering the homepage, first-run setup, home customization, settings organization, update strip, mascot, and shared controls used by those surfaces. Audit shared styles on schedule, homework, materials, and readers for regressions. Broader feature development from earlier reports is outside this scope.

Interpret “home tabs” as homepage blocks/widgets. Do not remove global navigation or make whole sections inaccessible when their home block is hidden. Identity is a single student or Guest; homepage blocks are a multiple selection.

## 2. Evidence and confidence

Reviewed the actual assembled classical site from `app/site`, including the homepage at the browser's initial desktop size and at 390 × 844, both light and dark themes, the order dialog, settings, and the modern first-run dialog. Also inspected the current source and existing tests. The local assembled snapshot was already present; this review did not rebuild it. Public-site access failed, so production parity and physical-device behavior are not claimed.

Evidence labels: **Observed** means seen in the local browser; **Source** means verified in implementation; **Needs reproduction** means an acceptance test is still required. Empty-homework and empty-queue examples were verified in source, rather than created as browser fixtures during this audit.

| ID | Priority | Finding and evidence | Required outcome |
|---|---|---|---|
| A01 | P0 | Mobile mascot geometry is broken. **Observed + Source:** at 390 px its computed box was approximately 275 px wide around a 24 px emoji. `site.css` animates `left`; the mobile addition also sets `right: 16px` without a fixed character width. Rotations use this stretched box's centre. | Fixed character bounds, independent movement/rotation layers, complete-cycle mobile verification. |
| A02 | P1 | “Следующая пара” is a heading, ordinary paragraphs, and an understated link. **Observed + Source:** `nextClass()` in `app/classic/student-tools.js:131`. On mobile the time interval breaks across lines and address text dominates. | A purpose-built card with large time, clear subject, status, room, and secondary detail. |
| A03 | P1 | Customization supports order only. **Observed + Source:** `homeConfig()` at line 187 saves `{ order }`; no visibility controls exist. Eight blocks are exposed initially. | Four default blocks, explicit visibility toggles, accessible reordering, persistent preferences. |
| A04 | P1 | Guest and unselected identity collapse into the same presentation. **Observed + Source:** `identityMarkup()` defaults to Guest, but `personalQueues()` treats an empty login as a request to display the selector again. A large identity panel sits above today's schedule. | Explicit unselected/student/guest states; first-run setup once; later editing in Settings. |
| A05 | P1 | Update information becomes a vertical stack of full timestamps and a separate text button. **Observed + Source:** `.student-freshness` wraps freely; each source includes a full localized date/time. | One compact status line with a square refresh action and an expandable source breakdown. |
| A06 | P1 | “Повторить обновление” reloads the whole document. **Source:** shared `[data-student-retry]` click handler calls `location.reload()`. | Refresh data in place with checking/success/partial-failure/offline states. |
| A07 | P1 | Empty blocks have only generic text. **Source:** homework, plan, queue, and deadline rendering; the desktop grid also stretches cards to their row height. | Designed empty states and content-led heights; no decorative inflation of empty panels. |
| A08 | P1 | Recent notes are delayed by sequential requests, exclude PDF, and have no real link destinations. **Observed + Source:** `fetchRecentNotes()` in `index.html:1839` fetches commit summaries, then details serially; filters `.md`; renders `<a data-note>` without `href`. | Cached, useful rows for supported formats; actual URLs; bounded loading and honest errors. |
| A09 | P1 | Recent-note semantics are imprecise. **Source:** commit changes represent additions or modifications, and a detail response can contain Markdown outside `Конспекты/`. | Define these as recently added/updated learning notes; filter to the notes root and current tree. |
| A10 | P2 | Card headings differ in size and treatment between original panels and added panels. Buttons also vary in padding, emphasis, and labels. **Observed + Source:** `panel()` lacks the original `.panel-head` structure; several independent button styles coexist. | One component contract and a small set of button variants. |
| A11 | P2 | Phone search is squeezed into a field showing only a short fragment of its placeholder. **Observed:** logo, search, version switch, and GitHub compete for header width. | A usable mobile search entry, with full-width search when opened. |
| A12 | P2 | Navigation terminology changes between desktop and phone: “Материалы”/“Файлы”, “Расписание”/“Пары”. **Observed.** | Consistent destinations and names across surfaces. |
| A13 | P2 | Settings prioritize extensive appearance cards; identity is much farther down and homepage visibility is absent. **Observed.** | Task-oriented settings groups with identity and home controls easy to find. |
| A14 | P2 | Small muted text, uppercase action links, and tightly tracked headings compete with readability. **Observed + Source.** A universal “thin font” defect was not established; actual font files and fallback weights still need measurement. | Readability standards verified across available fonts and palettes. |
| A15 | P2 | Time-sensitive home content is inconsistent in its update lifecycle. **Source:** next class refreshes every 30 seconds, while today's rows and hero date are rendered on navigation/loading. | Correct dates and statuses after midnight, foreground resume, and lesson boundaries. |

P0: functional defect. P1: core redesign acceptance. P2: included polish and consistency. Priority sets sequencing, not permission to omit requirements.

## 3. Design direction and shared rules

Use the modern version's clarity as a reference, especially `NextClassBlock` and `FirstRun`. Adapt the information hierarchy to the classical site rather than copying its React application or introducing a third visual style.

Preserve the group's personality through greetings, the mascot, and existing palette options. Keep everyday learning surfaces quiet: clear text, restrained borders, a single accent treatment, and predictable controls. The hero and next-class card may have the strongest emphasis. Every card should not compete for that emphasis.

Establish named tokens in the classical enhancement stylesheet:

| Element | Starting specification |
|---|---|
| Spacing | 4, 8, 12, 16, 24, 32 px; 16 px phone gutters |
| Body and input text | 16 px base, line height 1.5; regular/medium weight with actual Cyrillic support |
| Secondary metadata | 14 px minimum at default text scale; readable contrast |
| Card titles | 18–20 px, 600–700 weight; consistent margins |
| Prominent lesson time | Responsive 32–48 px, tabular numerals; no arbitrary shrinking |
| Buttons | 44 px minimum touch area; 16–20 px icons; consistent label baseline |
| Cards | One normal surface, border, padding scale, and radius token following existing radius preferences |
| States | Hover, focus, pressed/selected, disabled, busy, error; selection visible without relying on color alone |

Use primary, secondary, quiet, icon-only, and danger button variants. One primary action per local task. A simple button is acceptable when its purpose and interaction are clear; extra gradients, shadows, or icons are not substitutes for hierarchy.

Validate normal text contrast at least 4.5:1 and large text/non-text control boundaries at least 3:1 where applicable. Keep visible keyboard focus. Do not solve weak contrast only by making text bold. Check actual rendered font weights and fallbacks; do not use weights below 400 in the redesigned interface. Preserve existing font preferences and verify every offered family.

Editorial rule: new or rewritten interface copy must not use em dashes. Use labels, sentence breaks, colons, or separate fields. Time ranges may use an en dash. Do not mechanically rewrite group notes, mathematical notation, existing content titles, or code. Favor concrete messages over “Нет работ в этом списке”.

## 4. Homepage structure and customization

### 4.1 Defaults

Exactly these blocks are enabled for a fresh profile:

1. Next lesson: `student-next-panel`.
2. Today: `schedule-panel`.
3. Materials: `materials-panel`.
4. Recent notes: `notes-panel`.

“Мои очереди”, “Скоро сдавать”, “Домашнее задание”, and “Мой учебный план” are available but disabled by default. Hiding them changes only the homepage, never their underlying data or section access. Retain existing global indicators for active work where present; do not silently imply that hidden work is completed.

Keep the hero and a compact Customize entry outside the hideable block list. Merge redundant shortcuts into relevant card actions; the hero toolbar must not become another row of competing destinations.

On phone, use a single coherent reading order: hero, next lesson, today, materials, recent notes. User ordering overrides that order. On desktop, use a full-width next-class summary followed by a balanced two-column region for Today and Materials, then full-width recent notes. Demonstrate the result with both a full teaching day and an empty day. Adapt optional blocks without leaving fixed empty grid slots. Avoid CSS dense packing or visual reordering that breaks keyboard reading order.

### 4.2 Controls and persistence

Provide the same configuration UI from “Настроить главную” and Settings → Home. Every block has a labeled visibility toggle, concise description, and move controls with block-specific accessible names. Hidden blocks remain available in the configuration list. Dragging may be added, but is never the only way to reorder.

Support Save, Cancel, and “Вернуть стандартный набор”. Opening customization does not itself change saved preferences. Permit hiding all blocks; show a compact “Главная настроена без блоков” message with a Customize action. Do not lose access to Settings.

Use stable explicit IDs and a versioned registry, not IDs inferred from current classes or titles. Normalize duplicate/unknown IDs. Preserve saved order on migration. A legacy order-only record is not evidence of an explicit visibility preference: use the new four-block defaults and retain the relative saved order of those enabled blocks. Never delete plan tasks, marks, queues, or bookmarks when hiding a block. Newly introduced optional blocks stay off unless a later product decision explicitly changes the defaults.

## 5. One-time setup and identity

Create a single “Настройте сайт под себя” dialog before first normal use. It consolidates choices that are currently scattered through the homepage. Suggested sections:

1. “Кто вы?”: searchable student list and an equally visible “Я гость”. One identity at a time. Explain that this identifies queue positions locally; it is not authentication.
2. “Оформление”: System/Light/Dark, existing available palette choices, and motion preference. Keep font, corner-radius, reading, and offline details in Settings. Do not add modern-only style modes or expose locked rewards.
3. “Что показывать на главной”: multiple block toggles, with the four defaults preselected.

One “Готово” commits the choices. Identity must be selected explicitly; Guest is a valid complete answer. Optional settings retain their defaults. Preview appearance without committing partial data; cancellation of an edit restores saved settings. Avoid full-page reloads or repeated student selectors after completion.

The initial dialog follows the modern first-run precedent: it cannot be dismissed into an ambiguous identity state. Make the quick Guest path conspicuous, explain the disabled Done button, and keep the page behind it inert. Focus stays inside; the result remains usable with a phone keyboard and at large text sizes. A later Settings edit behaves as a normal dismissible dialog.

Store completion separately from the login value. Distinguish missing identity, a student login, and explicit Guest. Existing non-empty saved identities must be retained and must not face a mandatory new identity prompt. A persisted record with an explicitly stored empty login can migrate as Guest; absence of a record cannot. Existing visitors with a valid identity can discover the new controls through a quiet settings notice rather than another forced setup.

Completed setup remains completed across refresh, navigation, browser restart, and site updates. Only explicit personal-data reset or clearing browser storage permits the first-run prompt again. A setup schema version change alone must not nag existing users. If storage is unavailable, show a concise explanation and retain choices for the session so the user can continue. Do not claim successful persistence when writing fails.

Settings must include clear groups: “Профиль”, “Главная”, “Оформление и чтение”, and “Данные и офлайн”. Provide a single route to change identity and rerun quick setup. Queue views use the saved identity; they may offer a small link to profile settings, never another full selector. An explicitly enabled queue block for a Guest explains that identity is needed and links to Settings.

## 6. Next lesson and Today

Build a semantic lesson card with a clear scan order: status (“Следующая пара”/“Идёт сейчас”), prominent start time or remaining duration, subject, lesson type, room, then optional teacher/location details. Countdown is a chip or separate field. Use “Через 1 ч 6 мин”, not “До начала 66 мин”, once an hour is exceeded. Date and status distinguish tomorrow and later dates.

Room number must be easy to find. Show the full address as lower-priority information; prevent an orphaned end time by keeping the time interval together. Long subject names wrap naturally. Provide one primary action to open the relevant day and a secondary materials link if the subject is resolved. Any note shortcut must distinguish the current lesson's note from an older fallback; never claim an exact match without evidence.

Required states: loading, upcoming today, in progress, next day, no lessons in the searched period, cached/stale schedule, and unavailable schedule. A free day must not display a zero countdown or imply a fetch failure. Exclude breaks from “next lesson”. Do not replace a failed schedule with an invented empty one.

Today uses the same metadata hierarchy in a quieter list. Mark ongoing and completed lessons using words as well as color. Keep breaks secondary. Refresh the hero date, parity, Today state, and next-class card together at lesson boundaries, midnight, and foreground resume. Specify the campus schedule timezone explicitly and test a device outside Moscow.

## 7. Empty states and page density

Design emptiness as useful information at an appropriate size. Each enabled empty block has a small consistent icon/illustration, a clear title, one explanatory line, and at most one relevant action. Use a compact panel, not a large mascot illustration to fill a stretched row. On desktop, fix the layout as well as the empty content. No card gets a tall minimum height simply to match a populated neighbor.

| State | Example copy | Action |
|---|---|---|
| No current homework | “На сегодня всё готово” / “Актуальных домашних заданий нет.” | “Открыть задания” |
| Student has no queues | “Вы пока не в очередях” / “Здесь появятся ваши места после записи.” | “Открыть дедлайны” |
| No personal plan items | “План пока свободен” / “Добавьте личную задачу, когда понадобится.” | “Добавить задачу” |
| No classes today | “Сегодня без занятий” / A real next-teaching-day hint, if known | “Открыть расписание” |
| No recent notes | “Новых конспектов пока нет” / “Все доступные материалы остаются в библиотеке.” | “Все конспекты” |

These examples are proposed copy, not inferred user accomplishments. Do not say “всё выполнено” when no assignments were published, data has not loaded, or debts remain. Upcoming deadlines, debts, personal completion, and group archive stay distinct. Give the debt count appropriate visibility rather than congratulating someone above hidden overdue work.

Provide separate skeleton, empty, error, and stale-data presentations. A connection failure never becomes “no queues” or “nothing to do”. Do not put empty optional blocks back onto the homepage automatically.

## 8. Recent notes

Use structured list rows, not six loosely styled text links. Each row includes format icon/badge, readable title, subject, lecture/practice or folder label when known, and an honest added/updated date. Keep metadata subordinate but readable. Show up to six entries; the full notes action remains in the section header. On phone, use one column with generous row targets; on desktop, one or two readable columns rather than three cramped columns.

Every item is a real `<a href>` to the correct classical reader or file route, with keyboard access, open-in-new-tab behavior, and visible hover/focus. Support Markdown and PDF; deduplicate alternatives of the same lesson only when existing metadata provides a reliable relationship, and preserve a visible format choice. Do not derive equivalence from similar titles alone.

Replace the runtime commit-detail waterfall with a cached metadata path. Preferred implementation: produce an auxiliary recent-notes index during site assembly, using repository history when available, with optional bounded refresh and cached fallback. Do not change the shared `data/lectures.json` schema. Do not add a critical build-time dependency on GitHub availability or require a new token. Never use file modification times from a fresh checkout as note publication dates. If reliable dates are unavailable, label the fallback “Доступные конспекты” and omit invented chronology.

Filter to existing supported files under `Конспекты/`, exclude removed/hidden paths, and distinguish added from updated if the available metadata supports it. Show cached entries immediately when available, indicate staleness discreetly, and provide an error/retry state when neither network nor cache succeeds. Loading must not wait through ten serial detail requests.

## 9. Footer status and updates

At ordinary desktop widths, show compact source/date information with the refresh control in the same row. On phone, show a concise truthful summary such as “Данные: 14.11, 14:24” plus a details trigger and the refresh square. The expanded details contain every source's last-success time and cache/error status. Four full timestamps cannot remain readable on a 320 px line; do not solve that by shrinking type or forcing horizontal scrolling.

The square button uses a refresh icon, a clear accessible name “Проверить обновления”, and a minimum 44 × 44 px hit area; the visible icon is 18–20 px. Keep the control in the same row as the collapsed status at 320, 360, and 390 px. At enlarged text settings, allow the text to reflow while retaining all controls and avoiding clipping.

Refresh checks relevant data in place, preserves scroll/focus/input and selected identity, prevents duplicate concurrent checks, and reports completion through a polite live region. Show busy, unchanged/success, partial failure, and offline states. Always release busy state after failure. Keep the last successful time on failure; do not stamp “now” merely because the button was pressed. Use “Проверено” for fetch time and reserve “Обновлено” for an actual content-update time when known. The summary must not conceal a stale source or imply unused queue data is broken.

Separate data freshness from a new application-shell version and from downloading offline materials. A changed shell can offer a labeled reload action; an ordinary data check must not automatically reload the document. The original small provenance footer can remain secondary, without a large blank region before the status row. Respect bottom-navigation safe areas.

## 10. Hero and hedgehog

Replace the platform emoji with the hedgehog character used by the game: same silhouette, face, spines, palette, curl, and rolling pose. Reuse or derive the renderer from `drawHog` in the classical source / exported modern game module. Do not import the entire game runtime into the homepage, start gameplay, read/write game progress unnecessarily, or award rewards for decorative animation. Existing code-native art is the correct starting point.

Default motion: a gentle endless traverse over shallow hills, with a short roll on a downhill segment and an occasional playful tumble. Preserve the old mascot's continuous presence and changes of direction. Continuous full-speed spinning is not the default; it would make the hero harder to read. Hills sit in the lower reserved band, slightly darker than the hero's local background in both themes. Avoid converting them into another strong foreground illustration.

Use separate fixed-size wrappers for travel, vertical terrain position, facing, and character rotation. Do not animate competing `left`/`right` offsets on an auto-width box. The character contacts the terrain, lands cleanly, reverses without teleporting, and loops without a visible snap. Keep it entirely clear of greeting/date text, including during flips. A static fallback must work before optional animation code loads.

System reduced-motion and the site's own “Меньше анимаций” both produce a static mascot and terrain. Provide an accessible pause/resume control for the continuous decoration. Pause work offscreen or when the tab is hidden. Canvas, if used, is decorative/hidden from assistive technology, renders crisply at device pixel ratio, and releases its animation frame and observers on route exit. A working rolling effect must not create duplicate animation loops after repeated navigation.

Acceptance includes sampled character bounds over two full cycles at phone and desktop widths, portrait/landscape resize mid-cycle, both themes, and reduced motion. Emulation cannot substitute for a physical iOS Safari and Android Chrome check of the final animation.

## 11. Implementation boundaries and engineering work

Follow the current `AGENTS.md`. Implement additions in `app/classic/`, integrate through `app/src/lib/classicPatch.ts`, and extend `app/scripts/assemble-classic.ts` only where needed. Do not directly edit root `index.html`, `site.css`, `css/`, `js/`, group data, or generated `app/site` / `app/public/classic` files. Paths cited in the audit are evidence locations, not permission to change those originals.

Keep new home rendering, preference normalization, and decorative animation in focused modules rather than appending more unrelated behavior to `student-tools.js`. Give redesigned panels one shared markup contract. Connect update hooks explicitly. Existing MutationObserver decoration must remain idempotent: no duplicate panels, controls, IDs, dialogs, subscriptions, or timers after rerenders. Do not repeatedly replace the focused control when a status/countdown updates.

Preserve existing storage keys and formats where possible, including `m3102-student-v1` and `m3102-home-layout-v1`; extend with versioned, validated fields. Add any new personal setup key to `PERSONAL_KEYS` and its backup validation. A full progress backup must restore setup completion, identity, block visibility, and order; legacy backups remain valid. Appearance-only export must keep its documented narrower scope. Validate migration with missing, malformed, partial, and legacy records, and handle write failures visibly.

Keep classical and modern preferences separate except for existing explicitly supported synchronization. Do not broaden write access to the modern version's stores. Preserve shared data formats, completion semantics, offline caches, route URLs, site switching, and the two service-worker scopes.

Use existing bundled assets/icons and local font delivery. Add no runtime CDN dependency. Keep the modern initial JS/CSS budgets intact; classical enhancements must not import the modern React shell or the game engine. Record before/after classical transferred JS/CSS, request count, layout shift, and a representative mobile animation performance trace. Defer noncritical mascot work and cached metadata refresh so they do not block the next lesson. Required build-time patches must fail clearly if their expected upstream anchors disappear.

## 12. Delivery sequence and review artifacts

1. **Baseline and design:** capture reproducible before screenshots, animation samples, storage fixtures, and network behavior. Deliver one coherent desktop and phone design in both themes, plus the component/state sheet and setup flow. Include long titles, empty data, stale data, and active queues. Resolve visual decisions in the reviewable local preview.
2. **Foundations and preferences:** implement component tokens, the block registry, storage migration, visibility/order controls, settings groups, and one-time setup. Verify Guest/student/returning-user behavior before decorating the whole dashboard.
3. **Homepage content:** implement next-class/Today hierarchy, recent-note data and links, compact empty states, responsive layout, and update strip behavior.
4. **Mascot and polish:** deliver the game-consistent character and terrain animation, motion controls, header/search improvements, typography/copy cleanup, and cross-surface regression fixes.
5. **Verification and handoff:** deliver before/after screenshots, full state coverage, meaningful tests, performance comparison, and a short list of any remaining physical-device checks. Update `AGENTS.md` for final architecture and storage decisions.

Implement and verify the complete brief in a reviewable local branch. Do not commit, push, or deploy as part of this specification-only request. A future implementation follows the owner's then-current git authorization and repository rules.

## 13. Acceptance and validation

| Area | Required evidence |
|---|---|
| Fresh visitor | One setup dialog; explicit Student or Guest; four block defaults; optional choices saved together; no repeated prompt after reload or restart. |
| Returning visitor | Existing identity and relative order preserved; tasks/progress unchanged; no forced new identity choice; legacy and malformed records handled. |
| Settings | Identity, visibility, and order editable from a discoverable location; Save/Cancel/reset work; all blocks may be hidden without trapping the user. |
| Schedule | Upcoming/ongoing/tomorrow/free-day/error/stale fixtures; lesson boundaries, midnight, timezone, and foreground resume produce correct UI. |
| Empty blocks | No false success during loading/error or with overdue work; content-led height and relevant action; optional hidden blocks remain hidden. |
| Notes | MD/PDF, long Cyrillic title, deleted/renamed path, valid href, keyboard/new-tab behavior, cached results, API limit, and unavailable metadata. No serial commit waterfall. |
| Updates | Single collapsed status row plus square refresh at ordinary phone sizes; details expose source dates; no document reload or lost input; partial failure preserves last success. |
| Mascot | Fixed bounds, no text overlap, clean rolling/landing/looping, resize, both motion preferences, pause, tab visibility, repeated route visits, and physical-device checks. |
| Accessibility | Keyboard-only setup/configuration, labeled controls, dialog focus handling, visible focus, readable contrast, no color-only meaning, accessible error/status messages. |
| Responsive | 320, 360, 390, 430, 760, 920, 1100, and 1440 px; phone landscape; 100%, 125%, 140% site text settings and 200% browser zoom. No horizontal document overflow or bottom-nav obstruction. |
| Themes/fonts | Light, dark, and system theme transitions; all offered fonts; every existing palette for shared text/button contrast, including reward palettes through controlled test fixtures. |
| Persistence/offline | Full backup round trip and legacy restore; denied/full storage; cold load, cached offline load, reconnect; no changes to marks or game balances. |
| Integration | Home → schedule/materials/note → back, classical/modern switch, settings, homework, readers, both service-worker scopes, and shell update behavior remain functional. |

Add focused unit tests for preference normalization/migration and recent-note metadata rules. Extend assembled-site browser tests for actual first-run completion, visibility persistence, valid note navigation, non-reloading refresh, and stable mascot geometry. Test semantic outcomes rather than asserting arbitrary CSS class names. Existing order-only tests and no-popup assumptions must be intentionally updated for the new classical behavior, without changing modern behavior.

Before any authorized implementation commit, run from `app/`: `npm run format:check`, `npm test`, `npm run test:classic`, `npm run build`, `npm run size`, `npm run ics`, `npm run site`, and `npm run test:e2e`. Include the classical student/theme suites and meaningful new scenarios. Run Lighthouse against the assembled classical page as well as required existing checks. Inspect the final visuals manually in both themes and on phone. Record actual results; do not label pending device checks as passed.

The work is accepted when the redesigned flows, persisted behavior, visual states, and regressions above are demonstrated together. Passing a build alone does not constitute design acceptance.
