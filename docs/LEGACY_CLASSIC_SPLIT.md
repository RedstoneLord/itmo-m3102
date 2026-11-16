# Legacy and Classic

Legacy is the default appearance of the root website. Classic is the redesigned appearance, selected in settings.
Both use the same content, dated My ITMO timetable, local progress and offline worker. `/app/` remains the React website.

## Historical boundary

The starting point was checked on both sides of `a99153fa1961a22b799456f7730c07da9a285506`:

| Commit | What changed | Treatment |
|---|---|---|
| `855acc7` (before the suggested commit) | White light-theme surfaces, hero and contrast overrides in the assembled page | Classic retains these design overrides. Legacy keeps the original surfaces and the required light-theme logo inversion. |
| `a99153f` | Study tools, personal backups, cached data, offline support and supplementary CSS | Shared functional modules remain; supplementary hero styling is restricted to Classic. |
| `f46633e` | Readable mathematical labels | Shared, retained. |
| `353f30b` | Homepage replacement, reordered/hidden panels, required first setup | Homepage replacement is Classic only. Setup is optional and opened from settings. |
| `dc9595b` / `17146ec` / `b02cddc` / `05c3ba0` | Classic design system, typography, timetable and background styling | Classic retains its design. New timetable views remain functional in Legacy using its original colors. |
| `95decbd` | Drawn game mascot, audio controls, bookmarks, folder offline controls and other fixes | Only Classic replaces the emoji. Functional additions remain shared. |
| `7395242` through `74769d7` | Live timetable, session persistence, curated teachers/rooms and comparison fixes | Retained in both appearances. |

`index.html`, `site.css`, `css/` and `js/` have no differences between the current base and either `a99153f^` or
`855acc7^`. They remain the source for Legacy; no historical website or stale data snapshot is shipped alongside it.
The assembly patches add functional hooks without copying old timetable/authentication/offline code.

## Behavior

- No saved appearance choice means Legacy, including for an existing visitor with completed setup or a customized Classic homepage.
- Choosing Classic records only `{ version: 1, view: 'classic' }` in `m3102-classic-view-v1`; choosing Legacy records `legacy`.
- The head script reads this before paint. Design stylesheets are inactive for Legacy, including the earlier light-theme redesign.
- Legacy retains the original hero, animated running/jumping/flipping 🦔, six-panel homepage and original navigation labels.
- Classic retains its dashboard, block settings, mascot, semantic colors and settings categories.
- Profile and appearance settings never open automatically. A user may close them without identifying themselves as a student or guest.
- The version setting survives reloads and personal backup/restore. It never clears other settings or progress.
- All assets for both modes are part of the same verified offline release. Switching modes also works without a network connection.

## Validation

`app/e2e/classic-versions.spec.ts` renders the unmodified original page as a local reference and compares computed
backgrounds, gradients, colors, radii, shadows, fonts and animation definitions against Legacy at 390px and 1440px
in both light and dark themes. It also checks emoji motion, logo inversion, optional setup, persistence, live room/missing
lesson warnings and actual offline reload/switching. Screenshots are written to the test output for visual review.

The existing Classic theme, homepage, reading, timetable, personal-data and offline tests explicitly select Classic.
React first-visit tests check that the page opens directly and the optional setup remains available in settings.
