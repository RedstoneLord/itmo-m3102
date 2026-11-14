# Classic++: independent review and complete design direction

Reviewed 14 November 2026 against commit `353f30b`.

This document is the second design brief. It supplements the behavioral requirements in `CLASSIC_REDESIGN_SOW_2026-11-14.md` and explicitly expands the visual scope from the homepage to the classical site's everyday interface. Classic++ is a working name for the improved classical version, not a third site or another style switch.

## 1. Assessment

The previous iteration delivered substantial functional improvements: explicit Student/Guest setup, saved visibility and order, the four requested defaults, an in-place refresh action, actual MD/PDF links, build-time note history, local interface fonts, and a game-derived mascot. Preserve that work.

The visual result is only partly complete. The homepage is more orderly, but much of the rest still uses the earlier backgrounds, gradients, filters, and card patterns. The same site alternates between subdued outlined controls and vivid glowing selections. The hierarchy relies too heavily on putting borders around everything. The setup and settings flows function, but consume too much attention and scrolling. Typography has been normalized, rather than deliberately designed.

The next iteration must establish and apply one design system across the classical interface. Fixing a few more homepage margins will not fulfill this brief.

## 2. What this review actually checked

- Read the implementation, the original brief, `AGENTS.md`, and `docs/classic-redesign-evidence/README.md`.
- Inspected the agent's desktop/phone before/after screenshots and its setup, settings, and empty-state evidence.
- Independently opened the assembled site. On a fresh local origin, completed Guest setup and inspected the phone homepage, schedule, materials, homework, Other, and settings, including a light-theme change.
- Checked the saved screenshot evidence in both themes. Source and assembled `home-dashboard.js` / `home-dashboard.css` matched by SHA-256 during review.
- On the previously used local origin, observed a boot failure: `home-setup.js` requested `forget` from an incompatible `student-core.js`. Current source and current assembled core both export it. A clean origin loaded successfully. A mixed old/new shell is a strong explanation, but production impact and an exact repeatable upgrade sequence remain to be established.

The prior agent's test totals and Lighthouse scores are reported evidence, not independently rerun results. No physical mobile device or production deployment was tested here. This review changes documents only.

## 3. Completion ledger

| Previous requirement | Status after review | Follow-up |
|---|---|---|
| Four default home blocks; hide/show/order | Implemented | Keep storage behavior; redesign the controls. |
| Explicit Student/Guest and remembered setup | Implemented; UX partial | Preserve migration and transactional save; reduce the long form and nested scrolling. |
| Settings entry for identity and home | Implemented; design partial | Replace the long stack of appearance cards with a navigable settings structure. |
| Next-class hierarchy | Implemented; incomplete polish and update correctness | Improve proportions and state differentiation; fix same-ID edits and empty-to-populated recovery. |
| Designed empty states | Implemented; repetitive | Use contextual icons, useful hierarchy, and a less repetitive layout. |
| Recent-note waterfall removed; valid MD/PDF links | Implemented | Keep honest chronology; reduce metadata repetition and group verified format alternatives. |
| Inline refresh; preserved last success | Implemented | Keep behavior, unify feedback and source status presentation. |
| Game character and fixed mascot bounds | Implemented; final device acceptance open | Retain art/cleanup; fix composition and the pause-control collision area. |
| Coherent buttons, typography, spacing | Partial | One system must reach schedule, materials, homework, readers, settings, and secondary pages. |
| Consistent mobile navigation | Labels aligned, layout fails | Words visibly split into “Матери-алы” and “Расписа-ние”. No-overflow is not enough. |
| Broad accessibility and responsive acceptance | Partial evidence | The 192-case script checks document overflow and refresh-button geometry on the homepage; its contrast sampling checks four selectors. It does not establish quality across every page, state, control, or system theme. |
| Physical iOS/Android validation; browser zoom | Open/unverified | Device limits are correctly disclosed. Add documented 200% browser-zoom evidence; do not equate site text scaling with browser zoom. |

Do not classify unchanged author-provided note titles containing em dashes as a failure. The editorial restriction applies to authored interface copy, not to rewriting group learning content.

## 4. Defects and incomplete acceptance to address first

### R01. Existing-cache upgrade can stop the entire site

Priority P0, independently observed locally; exact production reproduction still required.

An already-used local origin stayed on the loading screen with the missing-export error described above. The clean local origin opened normally. Inspect `app/classic/sw.js`: shell assets share one cache name, navigation can receive new HTML while module requests use cached assets, and installation updates that same cache incrementally before `skipWaiting()` / `clients.claim()`.

Create a deterministic two-release test using the previous assembled shell and the current one on the same origin. Include interruption during installation, a failed critical module fetch, an open old tab, and offline reopening. Choose a consistent release strategy: versioned shell caches or versioned module URLs, atomic activation of the required shell, and retention of a last complete working version. Preserve personal/content data and modern `/app/` isolation. Never make clearing all browser storage the fix. A module-boot failure must offer a recoverable update/retry state, not an endless decorative loader.

### R02. The next-class card can retain obsolete fields

Priority P1, source-confirmed in `app/classic/home-dashboard.js:70`.

When lesson ID/date/subject mapping stays the same, the incremental update only changes `.lesson-status`, `.lesson-day`, and `.lesson-secondary`. A refreshed start time, end time, room, kind, or subject can remain visually stale. The no-lesson branch also leaves the previous `data-lesson` value; restoring the same lesson can take the partial-update path while the card still contains the empty state.

Update all changed semantic fields while retaining focused actions where possible. Reset or reconcile the identity of the rendered state. Test same-ID changes to every displayed field and a populated → empty → restored schedule sequence. Matching an ID must not be treated as proof that displayed data is unchanged.

### R03. Mobile navigation is readable only in fragments

Priority P1, observed live and present in the supplied screenshots.

`home-dashboard.css` repeatedly redefines `.bn-item` sizes; the final rules combine 14 px text with `overflow-wrap:anywhere` and hyphenation inside approximately 70 px cells at a 390 px viewport. Fix names and layout rather than reducing them to tiny type or clipping the evidence. See the definitive navigation design below.

### R04. The hero and its controls compete with actual content

Priority P1, observed in the homepage screenshots and live review.

The phone hero reserves a large lower strip, then adds a separate Customize row before the next lesson. The mascot crosses the pause control's region at the right edge: travel uses width minus 96 while the control occupies the same bottom strip. Its art remains readable, but the composition feels accidental. Desktop next-class content occupies only part of a very wide panel.

Use explicit text, terrain, and control zones. Reserve the pause control outside the character's travel bounds. Fold customization into a quiet hero/header action, shorten the empty terrain band, and balance the lesson card. Preserve motion behavior and user home ordering.

### R05. Setup, settings, and actions need genuine interaction design

Priority P1, observed plus source-confirmed in `home-setup.js` and the supplied settings screenshot.

The setup stacks an always-open student list, appearance selects, eight block rows, and sixteen move buttons. On phone, the list scrolls inside an already scrolling dialog. Settings repeat large cards for every theme, radius, and font. Backup actions become ambiguous icon-only controls on phone, while similarly minor controls elsewhere remain large outlined buttons.

Implement the compact flows in sections 8 and 9. Selection, navigation, and destructive actions need distinct visual roles; not every option should look like a normal bordered command button.

### R06. Visual and accessibility evidence is narrower than the claim

Priority P1, source-confirmed in `app/scripts/verify-classic-home.mjs:104` and `:141`.

Its size matrix checks document overflow and the refresh square, which permits broken word wrapping, hidden internal overflow, and weak hierarchy. Its palette checks sample next-class primary text, one panel link, note metadata, and the active desktop tab. System theme, schedule status colors, form errors, selected options, icon boundaries, and meaningful contrast on composited backgrounds need coverage.

Expand meaningful acceptance, including real system-theme switching with no explicit `data-theme`. The independent fresh-origin session used system theme; do not use only explicit-light/explicit-dark screenshot fixtures. Add viewport screenshots as well as full-page screenshots: a fixed bottom bar appearing midway through a stitched full-page image does not by itself prove it permanently obscures that content.

### R07. Performance remains open

Priority P2, based on the previous agent's disclosed evidence.

The recorded classical Lighthouse performance median is 0.48. The report acknowledges the existing inline game/runtime and external dependencies. Do not present this as an independent new benchmark or make cosmetic changes dependent on an unrelated total rewrite. Measure a repeatable baseline, preserve the improved CLS, and defer noncritical work through the permitted assembly layer where practical. Do not add a new initial font waterfall, UI library, or page-wide animation runtime.

## 5. Classic++ art direction

Direction: a calm, practical academic workspace with a distinctive hedgehog. The personality belongs in greetings, a restrained violet accent, subtle terrain, and precise typography. Everyday content should feel well edited and immediately usable.

Keep the existing logo, real group content, navigation destinations, palette rewards, and character art. Classic++ is the default evolution of classical styling. Do not reproduce the modern site's glass effects, build a second React shell, invent an additional product identity, or add marketing copy to a student tool.

Use a lightly tinted canvas, opaque content surfaces, and modest elevation only where it communicates a layer. Remove decorative diagonal streaks behind ordinary content. Remove glows, repeated text shadows, saturated gradient headings, and strong outlines on every ordinary control. A quiet 1 px boundary and clear spacing suffice for most surfaces. Reward palettes can retain their character in accents and selected details without recoloring entire working surfaces into glowing effects.

### 5.1 Proposed semantic color system

These are starting values to validate on the actual rendered interface, not a claim that every possible combination already passes contrast.

| Token role | Light | Dark |
|---|---|---|
| Canvas | `#F5F6F8` | `#12141A` |
| Content surface | `#FFFFFF` | `#1C2029` |
| Inset/quiet control | `#EDF0F4` | `#252B36` |
| Primary text | `#202530` | `#EDF0F6` |
| Secondary text | `#5D6676` | `#B0B9C9` |
| Decorative separator | `#DCE1E9` | `#343D4B` |
| Primary button fill | `#5746BD` | `#B7ABFA` |
| Primary button text | `#FFFFFF` | `#1A1630` |
| Link/focus accent | `#5141AD` | `#BEB3FF` |

Define separate tokens for interactive borders, focus, selected background, hover, danger, warning, success, and lesson types. Decorative separators do not need to be as strong as interactive boundaries. Selected states pair color with a check, active marker, or text. Never make a published subject or entire task row translucent to mean “past”.

Existing palettes must map to these semantic roles. Do not keep fixing contrast by progressively mixing every button with the same dark constant at the end of a stylesheet. Make palette-specific foreground/background pairings deliberate. Light and dark share geometry and hierarchy; dark is not a white stylesheet with inverted colors.

## 6. Typography and proportion

Adopt **Golos Text Variable** as the proposed new default for interface and ordinary learning prose. It provides Cyrillic and Latin subsets and a 400–900 weight axis, under OFL; see [Google Fonts metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/golostext/METADATA.pb) and the [font license](https://raw.githubusercontent.com/google/fonts/main/ofl/golostext/OFL.txt). This is a design choice, not an assertion that changing a font alone improves readability.

Bundle selected WOFF2 subsets and the license locally. Use `font-display:swap`, sensible fallback metrics, and no network font request in normal operation. Preserve explicitly selected existing fonts; a previously implicit default may move to Golos. Do not load all alternate fonts before they are selected. Keep the existing code font and KaTeX fonts; interface-font rules must not leak into mathematics or code. Verify exported PDFs as well as the screen.

| Role | Desktop | Phone | Weight / line height |
|---|---|---|---|
| Page heading | 32 px | 28 px | 650 / 1.2 |
| Hero greeting | 36–44 px | 28 px | 700 / 1.15 |
| Section heading | 20 px | 18 px | 650 / 1.35 |
| Prominent lesson time | 48 px | 40 px | 650 / 1.05; tabular numbers |
| Body | 16 px | 16 px | 400–450 / 1.55 |
| Action label | 15–16 px | 15–16 px | 550 / 1.3 |
| Secondary metadata | 14 px | 14 px | 450 / 1.45 |
| Bottom navigation label | 14 px | 14 px | 550 / 1.2; one line |

Use a small set of genuine variable-font weights. No thin UI text, all-bold paragraph blocks, uppercase decorative eyebrows on every page, artificial condensed tracking, or shrinking long titles until they fit one line. Long titles wrap by words. Metadata remains legible rather than fading into the background. One light separator can divide peer list rows; a line under every heading is optional, not a universal component requirement.

Preserve the owner's established wide-reader layout documented in `AGENTS.md`. Improve text rhythm, headings, tables, callouts, code, and content navigation without silently reverting its width preference. Mathematical expressions and code retain local horizontal overflow when necessary; the document itself must not scroll sideways.

## 7. Component system and layout

Create a small inspectable classical component gallery covering buttons, form controls, tabs, lists, cards, alerts, dialog, status, and empty/loading states in both themes. It can be a development fixture and must not appear as a student-facing section. Apply these contracts across the real pages, not only in the gallery.

### 7.1 Buttons and interactions

- Primary: solid semantic accent, 44 px minimum touch target, 10 px radius at the default corner setting, medium weight, no glow. One prominent action per task group.
- Secondary: quiet filled surface with a subtle interactive boundary. Do not give every secondary command a high-contrast rectangular outline.
- Quiet/text: for “Все конспекты”, “Подробнее”, and local navigation; a visible hover/focus treatment and sufficient touch target. They must not compete with the main action.
- Icon: 44 × 44 px hit area, 18–20 px consistent line icon, accessible name. Suitable for refresh, close, overflow, and clearly understood playback controls.
- Danger: semantic red label/state in a separated destructive area. A circular reset arrow alone is insufficient for a destructive reset or clearing downloaded files.
- Selected option: segmented selection, radio/list row, or chip with a check and `aria-selected`/radio semantics as appropriate. Choosing a student is single selection, not a collection of toggle commands.

Specify hover, focus-visible, pressed, selected, busy, disabled, and failure for each applicable control. Changing a border from 1 to 2 px must not change layout. Busy actions keep their width and label context; errors remain beside the action or field. Restrained 120–180 ms transitions are enough. Respect motion settings; continuous movement is reserved for the explicitly controlled mascot.

Use one icon family from existing assets. Do not mix emoji, text glyphs, and thin line icons for the same control class. Keep visible labels on meaningful settings/backup actions at phone widths; allow a purposeful two-row action layout rather than hiding the labels to satisfy an arbitrary single-row rule. The refresh strip remains an appropriate icon-only exception.

### 7.2 Forms, lists, and surfaces

- Inputs: 46–48 px preferred height, 16 px text, persistent label, 10 px radius, consistent inset and focus state. Error text explains the recovery. Placeholder is not a label.
- Checkboxes/radios: 20 px glyph with a 44 px interactive row; labels wrap naturally. Use actual controls and correct single/multiple selection semantics.
- Tabs/segmented controls: one consistent track and selection treatment; navigation tabs use links and state filters use buttons/radios. Do not render every filter as an independent action button.
- Lists: primary title, one concise metadata line when possible, optional trailing action. No card around every line inside another card. Whole-row click targets must not swallow nested actions.
- Surfaces: normally at most one visible frame around a task group. Use typography and spacing for subgroups instead of progressively nested rectangles.
- Radius: two semantic levels for controls and panels, scaled through the existing corner preference. No new independent corner-radius setting.
- Spacing: 4/8/12/16/24/32/48 px scale; 16 px phone gutters, 24 px normal panel padding on desktop, 16–20 px on phone. Wide content maximum approximately 1240–1280 px for dashboards, with explicit exceptions for the established reader and game layouts.

## 8. Homepage and setup composition

Keep exactly the current four default blocks. Do not reset existing visibility/order or expose optional blocks automatically during a visual upgrade.

Desktop: a compact greeting/date header with shallow terrain; Next Lesson and Today form the main working region, followed by Materials and Recent Notes. The next-class card must not be a narrow cluster floating at the left of a full-width empty rectangle. A deliberate asymmetric two-column grouping is appropriate, but preserve the chosen order and keyboard order when a visitor reorders blocks. Do not solve packing with CSS dense reordering.

Phone: compact hero, next lesson, Today, Materials, Recent Notes. The top of the next-class summary should be visible in the first ordinary 390 × 844 viewport for a typical two-line greeting. Use natural content height for unusually long greetings rather than hiding essential text. The terrain band should feel like a small shared baseline, not an empty secondary hero. The Customize action belongs in the header and remains accessible when all blocks are hidden. The pause control is quieter and outside the mascot's travel lane.

Next Lesson: status eyebrow, large time, short date/countdown chip, subject, prominent room, quiet type/teacher/location, clear next action. For multi-day gaps, use “Через 2 дня” or a date with time rather than “Через 61 ч 44 мин”. Make ongoing state visibly distinct without a pulsing whole card. Avoid repeating the start time in several equally prominent places.

Today: compact consistent time column, subject, room/type, a restrained ongoing marker, and subdued but still readable completed rows. Breaks get a quieter compact row and do not repeat “Перерыв” twice. On phone, the subject column should remain wide enough for ordinary course names.

Materials: on phone, use four compact horizontal destination rows with icon, name, one short description, and chevron. Do not use two narrow columns that wrap descriptions into many lines. On desktop, either a concise two-by-two set or the same rows can work. Avoid a framed tile grid inside another strongly framed panel.

Recent Notes: retain actual links and the new data path. Present a readable title, compact subject/folder line, and subdued date; remove repeated subject/lecture wording where the title already supplies it. Show MD/PDF alternatives in one row only when a reliable same-lesson relationship is established. A matching parent directory and exact shared basename is a candidate that must be checked against current content, not a blanket permission to merge similarly named documents. Keep independent documents distinct and every format directly reachable.

Empty states: choose an appropriate contextual icon and one useful action. Repeating the same document icon in next class, queues, homework, and errors makes them look like generic placeholders. Do not compensate for emptiness with large illustrations or taller cards. Keep failure, loading, empty, and cached states semantically distinct.

Setup: one dialog, one final commit. Use a compact searchable identity control with selected-person summary and an obvious Guest alternative; open the student result list when searching, not as a permanent scrollable form inside a scrolling form. Theme uses a segmented control; palette uses labeled swatches with a check. Show the four default block choices with optional blocks disclosed under “Добавить блоки”. Put reorder controls behind a separate “Изменить порядок” mode within the same dialog. All choices remain available before Done. Preserve cancellation, local preview, focus, storage-denial handling, and the explicit identity requirement.

## 9. Site-wide page recipes

| Surface | Classic++ treatment |
|---|---|
| Global header | Compact logo and content navigation, quiet version switch, search, and a predictable Settings/Other entry. Version switching should not be the brightest button on every learning page. On phone, logo/action row plus usable search; use a search dialog if that materially improves space, preserving existing keyboard shortcuts. |
| Bottom navigation | Five compact labels: “Главная”, “Учёба”, “Пары”, “Задания”, “Ещё”. Use the same top-level names on desktop; page titles may still be “Материалы”, “Расписание”, etc. Keep existing routes and full accessible destination names. No intra-word wrapping, hyphenation, or tiny fallback text. At enlarged text, retain accessible names and use a deliberately tested layout rather than clipping. |
| Materials and subjects | Short page introduction, one consistent Files/Links switch, semantic grouped rows/cards, subject/topic metadata, actual destinations for every navigable element. Reduce decorative introductory prose and duplicated toolbars. Keep existing repository organization. |
| Schedule: day/week/month | Unified view selector, month/week navigation and Today action. Time, subject, room and state follow the home lesson hierarchy. Choose one structural timeline rather than nested card/border/line/dot decoration. Preserve lesson-type meaning and keyboard/touch interactions. |
| Homework and deadlines | One “Задания” destination with clear Homework/Deadlines views, unified filters, legible due-date badges, checkbox aligned to task text, personal completion explicitly labeled, and queue positions easy to scan. Do not mix success, debt, and unavailable states. |
| Queues | Compact named rows with position, identity highlight, and a clear join action. Preserve the correct student resolution and GitHub workflow. Do not style every queue entry as a large button. |
| Markdown reader | Consistent document toolbar, readable headings and content navigation, refined tables/callouts, one inline code treatment, quiet bookmark/download actions, preserved wide layout and PDF export. Group-authored text stays unchanged. |
| PDF and audio | Same control sizes, icon vocabulary, focus and active states; clearly grouped navigation, scale/playback, and download. Preserve zoom, reading position, seek, fullscreen, and browser-native behavior where needed. Do not implement a new media engine. |
| Search | Same input geometry and result-row hierarchy; readable file kind and subject; clear empty/error states; keyboard selection; position panel relative to actual header/viewport, not a fixed guessed `top:130px`. |
| Settings | Desktop section navigation and focused content; phone a compact list of categories opening the chosen section. Categories: Profile, Home, Appearance, Reading & Accessibility, Data & Offline. Appearance options become compact fields/segments/swatches, not several screens of radio cards. Preserve every existing preference. |
| Backup and offline | Labeled download/restore actions and a short summary, with details disclosed. Present subjects and learning folders by human names. Technical `data/*.json` and shell details belong in an advanced section. Keep transfer sizes, actual progress, failures, and retry visible when relevant. Do not show the whole downloader automatically in Other. |
| Students, links, memes, bookmarks, quizzes, diagrams | Apply common header, controls, spacing, type, list, dialog, and feedback contracts. Keep existing content-specific interaction; no unrelated feature expansion. |
| Games and collection | Apply the coherent site shell and surrounding menu/dialog controls where safe. Preserve game art, felt/tiles, rewards, signatures, save formats, and deliberately distinct collectible themes. Do not repaint gameplay as ordinary dashboard cards or turn the design pass into a game rewrite. |

## 10. Engineering and delivery contract

Follow `AGENTS.md`: implement through `app/classic/`, assembly patches, and supporting scripts. Original root site files, shared content formats, and generated output are not editable source for this task. Preserve the modern application and the existing two-version switch. Do not remove unrelated work or the existing evidence directory.

Refactor the enhancement styles into an explicit, bounded structure: tokens, shared components, shell, and page recipes. Consolidate the current repeated `.btn2`, `.home-hero`, and `.bn-item` overrides instead of adding another contradictory section to the end of the stylesheet. Resolve the cascade against the original styles deliberately; do not assume putting low-priority legacy rules into a new layer automatically overrides unlayered CSS. Scope product-wide rules to the classical site and exclude deliberate game interiors. Add no runtime CSS framework.

Preserve preference schemas and all user choices. If migration is necessary, test it; a new visual release is not a reason to clear marks, reset home blocks, show mandatory setup again, or overwrite explicitly selected fonts. Preserve backup compatibility, local patches, pending edits, caches, and service-worker isolation.

Produce a design-system sheet and actual page previews early, then continue implementation without waiting for an unsolicited approval step. Make the key visual direction concrete across at least Home, Schedule, Materials, Reader, Homework/Queues, Settings, and Setup before polishing edge cases. Maintain a coverage ledger for all page recipes. Do not stop at a gallery with unchanged real pages.

Deliver before/after screenshots at viewport size and full-page where useful; all core states in both themes; a succinct requirement ledger; the new/updated tests; measured performance and request deltas; and clearly separated unverified device checks. Record the exact commit/build represented by the evidence. Update architecture guidance when final structure changes.

Before any separately authorized implementation commit, run the repository's required formatting, unit, classical, build, size, calendar, site, and browser checks. Include existing modern regressions. Use the assembled site and service workers for the old-release-to-new-release test; blocking service workers in every new home test cannot verify an upgrade.

## 11. Acceptance gates

1. R01 and R02 have deterministic regression tests and resolved outcomes. Interrupted shell upgrades preserve a coherent working version without deleting personal data.
2. Every page recipe has a reviewed live implementation; the final report distinguishes completed, partial, blocked, and device-unverified items.
3. At 320/360/390/430 px, ordinary navigation words remain whole, actions remain labeled where meaning depends on text, and actual viewport screenshots show usable composition. Verify 760/920/1100/1440 px and landscape as well.
4. Verify 100/125/140% site text settings and 200% browser zoom as different conditions. Check visible content/focus, internal scrolling, sticky layers, and controls, not only root overflow.
5. Fresh setup, returning Student, returning Guest, saved custom home, all-hidden home, denied storage, backup restore, offline use, and same-ID schedule changes retain correct behavior.
6. System/Light/Dark and all existing palettes retain readable foreground/background pairs for actual buttons, selected states, links, badges, forms/errors, calendar markers, and hover/focus. Use composited backgrounds in measurements. Text is at least 4.5:1 where required; applicable large text/non-text controls at least 3:1.
7. Long Russian course names, short and long greetings, mixed Latin/Cyrillic, actual math/code, populated and empty panels, and MD/PDF alternatives look intentional. No automatic word-breaking is used as a layout repair for ordinary UI labels.
8. Primary, secondary, quiet, icon, danger, selected, busy, and error states are recognizable and consistent across the entire ordinary interface.
9. Mascot avoids text and control zones, remains grounded through rolling, pauses correctly, and releases work after navigation. Physical iOS/Android checks remain explicitly pending if hardware is unavailable.
10. Preserve the improved layout stability and existing modern size budgets. Report repeatable performance measurements; improve the 0.48 recorded classical baseline where practical and set further targets from measured bottlenecks, not an invented guaranteed score.

No commit, push, or deployment is authorized by this review/prompt-writing request. A future agent should implement in a reviewable working state and wait for explicit publication instructions only after completing the requested local work.
