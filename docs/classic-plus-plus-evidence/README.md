# Classic++ implementation and verification

Local working implementation based on `353f30b82e274dfbac76368538153be938519e57` (14 November 2026). No commit, push or deployment. The two input briefs and previous evidence are retained. `build.json` identifies the exact assembled release and source hashes represented by the final checks; screenshots use controlled local data, not a claim about current live group data.

Classic++ replaces the classical interface's working styles. It is not a third website or another style setting. Original root HTML/CSS/JS, group data and modern runtime source are unchanged.

## Implemented system

- Local Golos Text Variable is the implicit default. Explicit Noto/Ubuntu/Arimo/URW choices remain intact. The fallback is adjusted using measured Arial/Golos metrics. Code and KaTeX retain their own families, including actual exported PDFs.
- A bounded system of semantic tokens, deliberate light/dark palette pairs, controls, shell and page recipes. Five authoring stylesheets are assembled into one `classic-plus.css`, without a runtime CSS import chain. Ordinary pages use opaque surfaces, restrained borders and readable metadata. Gameplay art and collectible game themes keep their own styling.
- Whole navigation labels, a quiet version switch, full-width phone search and a results panel anchored to the real search container. Settings have five categories, compact options with visible selection checks, labeled data actions and disclosed technical offline files.
- One transactional setup dialog: explicit Student/Guest, results only while searching, segmented theme selection, labeled palette swatches, four defaults, disclosed optional blocks and a separate reordering mode. Existing storage schemas, completion, backups and relative order remain compatible.
- A reconciled next-class summary, Moscow dates, contextual empty states, compact destination rows and current MD/PDF links. Same-ID updates change every displayed field; populated → empty → restored data works. Stable actions retain focus. The mascot has a separate control zone, a measured ground baseline and no per-frame label mutation that would wake the whole-page decorator.
- A new timetable: week cards in 3/2/1 columns, a seven-column month sheet at every width, a full selected-day agenda, keyboard date movement and year/month navigation. Six actual course names have stable distinct colors; ИСРПО and its expanded name map together. Color supplements complete names and lesson-type labels.
- PDF.js, Mermaid, jsPDF and html2canvas are the same existing dependencies, loaded on use. Loading failures can be retried, and the libraries remain available to full offline download. PDF export always uses a legible light code treatment, including when initiated from dark mode.

## Requirement ledger

“Completed” means implemented and demonstrated by the linked local evidence. It does not claim exhaustive testing of every possible document, device or browser.

| Requirement | Status | Evidence / limit |
|---|---|---|
| R01: coherent release upgrade | Completed locally | `upgrade.json`, real previous/current assembled shells on one origin, SW enabled; failed critical HTTP response, interrupted response, open tab, successful activation and offline reopen. Personal data retained. |
| Exact historical missing-export condition | Reproduced by controlled injection | Old `student-core.js` from df97ee0 is deliberately combined with the previous setup module, producing the observed `forget` error. This proves the mixed-graph failure mode; it does not establish its production frequency or reproduce every browser cache history naturally. |
| R01: recoverable boot failure | Completed | Browser regression aborts a critical module, checks the labeled recovery UI, retries and verifies personal data. No storage-clearing workaround. |
| R02: same-ID and empty recovery | Completed | Browser regression changes subject, start/end, room, kind, teacher/location and restores the same lesson after an empty result; focus retained on the unchanged day action. |
| R03: navigation words | Completed | 320/360/390/430 widths, enlarged text and actual browser zoom; whole 14px labels and full accessible destination names. |
| R04: hero and mascot zones | Completed in emulation | Two complete cycles at phone/landscape/desktop, text and pause-control bounds, reduced motion, repeated routes, DPR and trace. Physical motion checks remain open. |
| R05: setup/settings | Completed | Fresh Student/Guest, cancellation, persistence, hidden optional controls, category navigation, labeled backup/reset actions and visible import failures. |
| R06: acceptance breadth | Completed for stated matrix | Real Home, day/week/month, Materials, Homework, Settings and Reader; system theme, five fonts, width/text matrix, composited selected/error/cache/success/control/focus colors and actual zoom. Raw results in `verification.json` and `browser-zoom.json`. |
| R07: repeatable comparison | Completed | Three fresh-profile mobile Lighthouse runs of each release using the same server and local replay of existing CDN assets. See measurements below. |
| Home and setup recipe | Completed | `after-home-*`, `after-setup-*`, state sheet and functional tests. Four defaults and user order/visibility preserved. |
| Day/week/month recipe | Completed | `after-schedule-*`, `after-week-*`, `after-month-*`; calendar geometry/keyboard tests and actual palette checks on calendar text. |
| Materials/subjects/files/links | Completed | `after-materials-*`, `after-links-*`; file-tree/subject routing regressions. Existing content organization retained. |
| Homework/deadlines/queues | Completed | `after-homework-*`, `after-deadlines-*`, `state-queues-*`; personal completion and another student's queue resolution tested. |
| Markdown/PDF/audio | Completed with controlled documents | Wide reader, real KaTeX/code fonts, two actual PDF exports and rendered PNG inspection; PDF viewer and native audio UI. A silent WAV is used for the audio screenshot, not a recording or hardware audio test. |
| Search | Completed for UI and existing behavior | Responsive results and keyboard shortcuts retained; search/reader regression and intermediate-width results checked. |
| Settings/backup/offline | Completed | Category UI, full and appearance-only backups, denied storage, rollback, corrupt file errors, failed downloads/retry and offline games. Technical files are disclosed separately. |
| Students/bookmarks/memes/quizzes/diagrams | Completed shared contracts | Corresponding real-page screenshots and existing note/quiz/bookmark/meme regressions. Content-specific engines retained. |
| Game shell/collection | Completed surrounding shell | Screenshots and existing classical/modern game, save and reward regressions. Art, felt, tiles, ownership and signatures not rewritten. |
| Format alternatives | Conservative implementation | Independent MD/PDF files remain directly reachable. No unproven title-based merging or guessed chronology; no authoritative equivalence mapping is invented. |
| Complete browser/device cross-product | Partial by design | The explicit automated matrix is broad, not every font × palette × content × browser combination. Only Chromium is used here. |
| Physical iOS Safari / Android Chrome | Unverified: hardware unavailable | Touch keyboard, safe areas, motion smoothness, pinch/media behavior and real audio need final physical-device review. |
| Production deployment/live GitHub mutation | Unverified and not performed | Not authorized. No claim about deployed cache behavior or live issue creation. |

## Review images

Both viewport and full-page captures are supplied. Fixed bottom navigation is judged from viewport captures; its placement in a stitched full-page image is not treated as evidence of permanent obstruction.

| Surface | Light desktop | Dark desktop | Light phone | Dark phone |
|---|---|---|---|---|
| Home, before | [Image](before-home-1440-light.png) | [Image](before-home-1440-dark.png) | [Image](before-home-390-light.png) | [Image](before-home-390-dark.png) |
| Home, after | [Image](after-home-1440-light.png) | [Image](after-home-1440-dark.png) | [Image](after-home-390-light.png) | [Image](after-home-390-dark.png) |
| Week | [Image](after-week-1440-light.png) | [Image](after-week-1440-dark.png) | [Image](after-week-390-light.png) | [Image](after-week-390-dark.png) |
| Month | [Image](after-month-1440-light.png) | [Image](after-month-1440-dark.png) | [Image](after-month-390-light.png) | [Image](after-month-390-dark.png) |
| Settings | [Image](after-settings-1440-light.png) | [Image](after-settings-1440-dark.png) | [Image](after-settings-390-light.png) | [Image](after-settings-390-dark.png) |
| Setup | [Image](after-setup-1440-light.png) | [Image](after-setup-1440-dark.png) | [Image](after-setup-390-light.png) | [Image](after-setup-390-dark.png) |
| Components/states | [Image](components-1440-light.png) | [Image](components-1440-dark.png) | [Image](components-390-light.png) | [Image](components-390-dark.png) |

Additional paired captures cover Materials, homework, deadlines, readers, Other, students, bookmarks, links, memes, diagrams and the game hub. `state-{empty,error,loading,cached,queues,long}-{light,dark}.png` is the controlled state sheet, with separate `-viewport` images. The reader fixture contains Cyrillic, Latin, actual KaTeX, code and a table. `reader-export-{light,dark}.pdf` are actual site downloads; adjacent PNGs were rendered with Poppler and inspected. `after-pdf-*` and `after-audio-*` show the real interfaces with controlled media.

## Checks

Final results are in `checks.json`. Required formatting, unit tests, pure classical rules, type/build, size budgets, calendar, site assembly and the complete browser suite were run. The root original suite also passed. The modern initial budgets remain within 215 KB JS / 25 KB CSS gzip; the note page remains below 220 KB. Existing build warnings about large optional chunks and a non-module switch script remain warnings.

The contrast harness composites ancestor backgrounds. It measures primary/secondary/selected/danger text, links, metadata/cache/warning/success/error, form borders, focus and eight subject colors; calendar labels are additionally checked on the actual calendar in all 12 palettes. Reported minima and matrix counts are retained in the raw JSON, not inferred from a successful build.

## Performance

The previous implementation report recorded **0.48** classical Lighthouse performance. The independent review did not rerun that benchmark. The new comparison below is a different, explicitly controlled local measurement and must not be presented as a production rerun of the historical 0.48 result.

PERFORMANCE_TABLE_PENDING

Method: a fresh Chromium profile for every run, 390×844 mobile simulated throttling, returning Guest, cold HTTP cache, one localhost server, identical local replay of the existing version-pinned CDN files. A blank same-origin document seeds identity without warming the application. Remote group APIs and Google font services are blocked. SW installation is excluded from performance sampling; it is tested separately with real workers. Local HTTP transfer counts are uncompressed, not production gzip predictions. The complete raw audits and per-run ranges are supplied.

`mobile-animation-trace.json` is a five-second 390×844/DPR2 trace with 4× CPU throttling, not a physical phone measurement. The summary contains script/layout/paint durations. It also checks the practical improvement that the pause button no longer replaces its label every animation frame and triggers the page decorator repeatedly.

## Reproduction

From `app/`, run the required project checks, build/calendar/site and serve `site` on 127.0.0.1:4173. Do not rebuild the directory while browser checks are running.

```sh
npm run format:check
npm test
npm run test:classic
npm run build
npm run size
npm run ics
npm run site
PLAYWRIGHT_CHROMIUM=1 npm run test:e2e -- --workers=1
node scripts/prepare-classic-baseline.mjs
node scripts/test-classic-upgrade.mjs
node scripts/fetch-classic-vendors.mjs
node scripts/verify-classic-plus.mjs
node scripts/verify-classic-zoom.mjs
node scripts/capture-classic-plus.mjs after
node scripts/capture-classic-states.mjs
node scripts/verify-classic-media.mjs
node scripts/trace-classic-mascot.mjs
node scripts/measure-classic-plus.mjs
```

`prepare-classic-baseline.mjs` needs the existing local 353f30b commit and writes an isolated old assembly under `/tmp`, without modifying the worktree. `capture-classic-plus.mjs before` uses the retained baseline server on 4175. `CAPTURE_WIDTHS` and `CAPTURE_THEMES` allow short individual capture runs. The Lighthouse helper uses the locally cached @lhci/cli/Lighthouse package; install @lhci/cli@0.15.1 if absent. Existing vendor downloads are only test replay inputs and do not change the deployed dependency sources.

Architecture and storage decisions are documented in `AGENTS.md`. No physical-device or live-production checks are silently marked passed.
