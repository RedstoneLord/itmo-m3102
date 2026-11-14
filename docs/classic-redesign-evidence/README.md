# Classical homepage redesign: verification record

Review branch: `codex/classic-dashboard-redesign`. Implementation and verification artifacts are prepared for repository review. No deployment. The original root website and shared content formats are unchanged. The supplied statement of work is preserved.

## Delivered behavior

- One explicit Student/Guest setup, appearance preview with Save/Cancel, and the same block controls from Home and Settings. The four specified defaults are enabled. Returning identities and legacy relative order migrate without a new compulsory choice. Hiding every block is allowed.
- Full progress backups include setup completion, identity, visibility and order. Invalid new records are rejected; legacy backups remain valid. Denied storage leaves a visible warning and document-session choices, without claiming persistent success.
- A semantic next-lesson card, Moscow-based dates and statuses, compact empty/error/loading/cache states, structured MD/PDF links, and a compact refresh strip. Checking data retains input, identity and focus; failed checks retain the last successful timestamps.
- A build-time recent-note index uses local git history instead of serial GitHub commit requests. No history means an undated available-notes list. Existing supported paths are validated against the tree.
- The mascot uses the game's drawing geometry, a static fallback and fixed movement layers. Pause, system/site reduced motion, visibility suspension and route cleanup are implemented. No decorative code reads or writes game progress.
- Shared typography, button states and spacing, local interface fonts, full-width phone search and matching navigation labels. Existing modern stores and asset budgets are preserved.

## Review images

| Surface | Light | Dark |
|---|---|---|
| Original desktop | [Before](before-1440-light.png) | [Before](before-1440-dark.png) |
| Redesigned desktop | [After](after-1440-light.png) | [After](after-1440-dark.png) |
| Original phone | [Before](before-390-light.png) | [Before](before-390-dark.png) |
| Redesigned phone | [After](after-390-light.png) | [After](after-390-dark.png) |
| First setup | [Setup](setup-light.png) | [Setup](setup-dark.png) |
| Settings | [Settings](settings-light.png) | [Settings](settings-dark.png) |
| Empty optional blocks and existing debts | [Empty](state-empty-light.png) | [Empty](state-empty-dark.png) |
| Unavailable schedule and note metadata | [Error](state-error-light.png) | [Error](state-error-dark.png) |
| Loading | [Loading](state-loading-light.png) | [Loading](state-loading-dark.png) |
| Active personal queue | [Queue](state-queues-light.png) | [Queue](state-queues-dark.png) |
| Failed refresh with cached schedule/notes | [Cached](state-cached-light.png) | [Cached](state-cached-dark.png) |

The screenshot state sheet uses assembled local data. Its controlled fixtures replace unavailable remote services and create empty/error/loading/queue states; it does not claim these are the group's current live values. Greetings are intentionally random. Full-page phone screenshots include the fixed navigation at its actual viewport position.

## Reproduction and automated evidence

From `app/`, assemble with `npm run site` after building, then serve `site` at `127.0.0.1:4173`. Run `node scripts/verify-classic-home.mjs` for the visual state sheet, theme/font/size matrix, contrast measurements and mobile trace. Run `PLAYWRIGHT_CHROMIUM=1 npm run test:e2e -- --workers=1` when Edge is unavailable. Do not rebuild `app/site` while its browser checks are running.

- Unit suite: 78 files, 337 tests passed.
- Original root suite: 18 test files passed.
- Pure classical rules: 13 tests passed, including backup migration and restoration.
- Formatting, build, size budgets, calendar and complete site assembly passed. The modern initial JS remains within its 215 KB gzip budget; CSS remains within 25 KB, and the note page within 220 KB.
- Complete assembled-site browser suite: **74 passed**. A focused classical rerun passed all 39 cases after the blocked CacheStorage guard; the final suite also adds immediate cached notes while the fresh tree request is held. A section-error retry now rerenders that section without reloading the document. The existing modern AI-link test now waits for copying feedback to finish before reopening its menu, avoiding a timer race without changing application behavior.
- Lighthouse: hard assertions passed (three final classical runs, three modern runs). Classical medians: performance **0.48**, accessibility **1.00**, best practices **1.00**, CLS **0.0025**. Modern medians: **0.50**, **1.00**, **0.96**, CLS **0.0569**. Classical performance is below the project's 0.50 warning threshold in the final three runs; this is a warning, not a hard assertion failure. The existing large inline runtime and external upstream dependencies remain. See [classical report](lighthouse-classic.html), [modern report](lighthouse-modern.html) and [run summary](lighthouse-summary.json).
- Visual matrix: **192** width/theme/font/text-size combinations passed; **24** theme/palette pairs passed text checks with a minimum measured ratio of **5.48:1**.

Browser scenarios cover explicit setup and focus containment, student search, preview cancellation, returning identities, all-hidden/default reset, storage denial, real note routes, deletion filtering, non-reloading refresh with preserved input/focus/date, Moscow time on an American device, midnight and class boundaries, both reduced-motion controls, repeated routes and two full mascot cycles at phone, landscape and desktop widths. An additional final check validates a 256 px canvas for a 64 px mascot at device pixel ratio 4; the [rolling pose](mascot-roll-light.png) is retained. Existing suites cover readers, homework, queues, full backups, games, real offline caches, theme changes, switching versions and modern-site regressions.

## Performance evidence

[Baseline resource measurements](baseline.json), [final measurements](after.json), [responsive/contrast/CPU checks](verification.json), and the [5-second mobile animation trace](mobile-animation-trace.json) are retained. Transfer sizes come from browser resource timing on the uncompressed local Vite preview, not production gzip predictions. Baseline and final visits were separate sessions; external requests in the final visual run are controlled. These are local observations, not a network-speed benchmark.

| Local browser measurements | Before | After |
|---|---:|---:|
| External JS transfer | 273414 B | 291584 B |
| CSS transfer | 69937 B | 75449 B |
| Resource requests | 92 | 96 |
| Desktop CLS | 0.58 | 0.0038 |
| Phone CLS | 0.156 | 0.0117 |

The original game is already inlined in the HTML. [HTML payload measurements](html-payload.json) separately record 225,050 baseline versus 222,109 final inline script bytes, and 282,627 versus 279,595 HTML body bytes (uncompressed). The baseline HTML is reconstructed from the unchanged original and the initial assembly patch, rather than inferred from checkout times.

These resource counts include the existing large classical module graph. Extra setup/rendering modules and local font delivery add four requests; recent notes no longer make commit-detail requests. The mobile trace records 0.153 seconds of script work and 0.083 seconds of layout during five seconds of animation on this machine.

Initial baseline observations: desktop CLS about 0.58, phone CLS about 0.156; the phone mascot's sampled stretched bounds were 226–255 px wide. The redesigned drawing wrapper is 64 px. Reserving initial search/icon geometry and loading-only card space removed the observed layout jumps without imposing tall minimum heights on empty cards.

## Limits

No physical iOS Safari or Android Chrome device was available. Their final animation, keyboard and safe-area behavior remain device checks; emulation is not reported as a substitute. The trace is from desktop Chromium emulating a phone, without hardware CPU throttling. No live GitHub mutation or published deployment was performed. Under a total browser storage ban, choices survive in the current document but cannot survive a full document reload. Existing CDN libraries and casino display-font delivery remain upstream behavior; interface fonts introduced here are local.
