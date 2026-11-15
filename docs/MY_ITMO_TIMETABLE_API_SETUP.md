# My ITMO timetable: verified setup and corrections

Reviewed **15 November 2026** against the live public portal, ITMO.ID discovery, read-only HTTP probes,
the repository's current implementation, and the client sources linked below.

This guide supersedes conflicting API, authentication, publishing, and file-editing instructions in
[MY_ITMO_TIMETABLE_API_SOW.md](MY_ITMO_TIMETABLE_API_SOW.md). The source implementation is described in sections 8–9.
The initial review did not install an integration. Activation requires the existing refresh-token environment secret
and a successful deployment; no GitHub App or personal GitHub token is required.
The no-App deployment path was revised and locally tested on **16 November 2026**.

## 1. What was actually verified

| Check | Result | Evidence / limit |
|---|---|---|
| ITMO.ID issuer | `https://id.itmo.ru/auth/realms/itmo` | Live discovery returned HTTP 200. |
| Authorization endpoint | `https://id.itmo.ru/auth/realms/itmo/protocol/openid-connect/auth` | Live discovery. |
| Token endpoint | `https://id.itmo.ru/auth/realms/itmo/protocol/openid-connect/token` | Live discovery. |
| Portal authentication | Client `student-personal-cabinet`, `response_type=code`, PKCE `S256`, scope `openid profile`, callback `/login/callback` | Current official frontend configuration, not an authenticated login performed by this review. |
| Personal timetable | `GET https://my.itmo.ru/api/schedule/schedule/personal?date_start=YYYY-MM-DD&date_end=YYYY-MM-DD` | Current official frontend calls this exact path with these dates. |
| Success envelope | `{ "code": 0, "message": ..., "data": [...] }` | Official frontend explicitly checks `code === 0` before using `data`. |
| No-token request | HTTP **403**, `{"code":90,"data":null,"message":"Не передан токен"}` | Live unauthenticated GET. Do not handle only HTTP 401. |
| Cross-origin preflight | HTTP **204**, allow-origin `*`, allow-methods `GET`, allow-headers `Authorization` | Live OPTIONS with origin `https://redstonelord.github.io`. The no-token GET also returned allow-origin `*`. Authenticated responses were not tested. |
| Lesson type used by portal | `work_type_id` and `work_type` | Current official timetable UI uses these fields; not the SOW's `type_name`. |
| Authenticated personal request | **Confirmed by the owner** after this review | The local check returned all seven dates, 2026-11-15 through 2026-11-21, and the subject/flow summary below. No credentials were shared. |
| Full payload, group coverage, current token expiry/rotation | **Not independently tested on your account** | A summary is not the complete response or proof that personal data covers every group member. |

Primary official sources: [ITMO.ID discovery](https://id.itmo.ru/auth/realms/itmo/.well-known/openid-configuration),
[portal](https://my.itmo.ru/), current public frontend
[configuration and API calls](https://my.itmo.ru/_nuxt/f8f1906.js),
[timetable UI](https://my.itmo.ru/_nuxt/f1085ef.js).
The hashed frontend URLs identify the inspected release and can disappear on a later deployment.

The discovery document lists realm-wide features. Its inclusion of `password`, `client_credentials`,
`offline_access`, or device authorization does **not** establish that the portal client or your account can use them.
An OAuth client ID is not an API key or a promise of API permission.

## 2. First setup: verify your own session locally

Start with a manual read. This works before implementing a worker or changing the website.

1. Open [My ITMO](https://my.itmo.ru/), sign in normally on the official ITMO.ID page, and open **Расписание**.
2. Open browser developer tools → **Network** → Fetch/XHR. Change the displayed week to trigger a request.
3. Find `schedule/personal`. Check its URL, `date_start`, `date_end`, response status, and JSON response.
   Successful data should have `code: 0` and a `data` array of days. Compare it with the visible timetable.
4. Under that request's **Request Headers**, locate **Authorization**. For a local test only, copy its value.
   It should be `Bearer <access token>`. This is more reliable than assuming a cookie name or storage format.
   Do not use the ID token, refresh token, or ITMO.ID SSO cookie as the API bearer token.
5. Run the following in your own terminal and paste the value at the hidden prompt. It accepts either the full
   header value or just the access token. It requests the next seven calendar days and prints only a summary.
   It does not write files or update the repository. Python 3.9+ with timezone data is required.

```bash
python3 - <<'PY'
from datetime import datetime, timedelta
from getpass import getpass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json

token = getpass('My ITMO access token (hidden): ').strip()
if token.lower().startswith('bearer '):
    token = token[7:].strip()
if not token or any(char.isspace() for char in token):
    raise SystemExit('Expected one access token, optionally prefixed with Bearer.')

start = datetime.now(ZoneInfo('Europe/Moscow')).date()
end = start + timedelta(days=6)
query = urlencode({'date_start': start.isoformat(), 'date_end': end.isoformat()})
request = Request(
    'https://my.itmo.ru/api/schedule/schedule/personal?' + query,
    headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Accept-Language': 'ru',
    },
)
try:
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)
except HTTPError as error:
    raise SystemExit(f'HTTP {error.code}; check the request in My ITMO Network tools.')
except (URLError, TimeoutError):
    raise SystemExit('Network request failed; no schedule changes were made.')
except (ValueError, UnicodeError):
    raise SystemExit('The response was not valid JSON; no schedule changes were made.')
finally:
    token = ''

if not isinstance(payload, dict) or payload.get('code') != 0:
    raise SystemExit('API did not report success; no schedule changes were made.')
days = payload.get('data')
if not isinstance(days, list) or not all(
    isinstance(day, dict) and isinstance(day.get('date'), str)
    and isinstance(day.get('lessons'), list)
    and all(isinstance(lesson, dict) for lesson in day['lessons'])
    for day in days
):
    raise SystemExit('Unexpected response shape; inspect locally before proceeding.')

expected = {(start + timedelta(days=i)).isoformat() for i in range(7)}
dates = [day['date'] for day in days]
if len(dates) != len(set(dates)) or set(dates) != expected:
    raise SystemExit('Incomplete or unexpected date coverage; do not infer cancellations.')

print(f'API success: {start} through {end}; {len(days)} days')
subjects = set()
for day in days:
    print(day['date'], len(day['lessons']), 'lessons')
    for lesson in day['lessons']:
        subjects.add((str(lesson.get('subject') or ''),
                      str(lesson.get('group') or ''),
                      str(lesson.get('work_type') or '')))
print('Subject | group/flow label | work type:')
for item in sorted(subjects):
    print(' | '.join(item))
PY
```

Keep tokens out of chat, screenshots, shell history, source files, `.env`, and logs. Avoid **Copy as cURL** or HAR
exports for sharing: they can contain credentials. Clear the clipboard after use. The Python process retains the
authorization header in memory until it exits; the code does not claim secure memory erasure.

If a token is rejected, refresh the portal and copy the **current request header** again. Read actual token response
`expires_in` / `refresh_expires_in` locally if needed; the SOW's 15–60 minutes and 30–90 days are not a contract.

Expected gate before implementation: valid JSON, complete dates, recognized subjects/types, and a manual comparison
against the official timetable. A successful HTTP request alone does not establish group-wide correctness.

## 3. Use the actual data model

The following is a **synthetic illustration**, not a response captured from your account:

```json
{
  "code": 0,
  "message": null,
  "data": [
    {
      "date": "2026-11-17",
      "lessons": [
        {
          "pair_id": 123,
          "subject_id": 456,
          "subject": "Дискретная математика",
          "time_start": "09:50",
          "time_end": "11:20",
          "work_type_id": 1,
          "work_type": "Лекции",
          "teacher_name": "Пример преподавателя",
          "room": "2304",
          "building": "Кронверкский пр., д.49, лит.А",
          "group": "М3102",
          "note": null
        }
      ]
    }
  ]
}
```

Client models additionally describe day metadata, flow IDs, delivery format and nullable fields. Use `work_type_id`
for lesson kind (observed: 1 lecture, 2 lab, 3 practice), and allow unknown values for review. Do not confuse `type`
with `type_name`, or `format` (delivery mode) with lesson kind. Use the supplied calendar date and campus wall time;
do not parse an `HH:mm` value as UTC.
[Go schedule model](https://github.com/kewldan/go-itmo/blob/55fe3eb322fe91827ed4e042dbdba401ea45a023/myitmo/schedule.go),
[Kotlin lesson model](https://github.com/alllexey-dev/my-itmo-api/blob/9cad9a0b0109b1844ab5f980e7ed7b06ac446ab1/kmp/src/commonMain/kotlin/dev/alllexey/itmoapi/myitmo/schedule/Lesson.kt).

No inspected model or official timetable UI establishes a `status: "cancelled"` / `"moved"` contract, previous-room
field, or machine-readable rescheduling link. The SOW invented those as if supplied by the API. A `note` may exist,
but free text is not a reliable cancellation enum. Preserve evidence and label computed changes as inferred.

## 4. Establish that the data belongs to the shared group

`personal` means the authenticated person's timetable. Removing English and sport does **not** prove that every
remaining class is shared by М3102, or that a missing class has been cancelled for everyone. ITMO explicitly permits
individual discipline/flow choices. [Official individual-track instructions](https://student.itmo.ru/ru/education/studying/learning_tracks).

Before producing shared data:

- Have the group maintainer confirm the shared subject/flow set; compare a full two-week cycle and known exceptions
  with other students or an authoritative group schedule.
- Review API `group` / `flow_id` values. Academic flow labels can differ from the nominal group number; do not filter
  only by literal `group === 'М3102'`, or silently normalize all Latin/Cyrillic characters without an agreed mapping.
- Maintain an explicit mapping from observed university subject IDs/names and approved flows to our six subject IDs.
  `resolveSubjectFolder()` can help with names but is not a university subject-ID resolver.
- Exclude English using reviewed IDs/names. For sport/room bookings, use reviewed metadata as well as exact names;
  observed `flow_type_id` values include 3 sport and 5 booking. Do not automatically drop every unknown flow type.
- Replace broad `/спорт/` and `/секция/` exclusions: substring matches can reject unrelated subjects. Unknown/null
  subject names or new IDs must block automatic day replacement until reviewed, rather than become cancellations.
- Keep personal meeting URLs, passwords, user identifiers, raw responses and tokens out of public timetable data.

A group endpoint candidate exists in mobile-client research, `https://api.schedule.itmo.su/api/v3/schedule/{group}`,
but its identifier format and behavior are unresolved there. It is **not** a verified drop-in replacement, and changing
the OAuth client to `is-app` is not a setup instruction.
[Research author's endpoint/status table](https://github.com/alllexey-dev/itmo-mcp/blob/1487ada518b434eb42fc06bf1ede835b5ea53d37/research/services/schedule.md).
Ask ITMO for the supported group-level feed/API and permission to publish its shared timetable if unattended group
sync is required. An available personal endpoint does not settle that question.

## 5. Authentication for an unattended service

The manual access token above is suitable for a short verification, not a cron credential.

For a maintained integration, request an ITMO.ID client for this project and **separately** confirm authorization
to read the timetable API. Agree exact callback URLs, PKCE S256, permitted scopes/audience, renewal policy, and the
scope of publishable group data. An ID token proving login is not authorization to read My ITMO's API.
The existing portal client ID does not let us register a callback on GitHub Pages or localhost ourselves.
See [the existing backend plan](BACKEND_PLAN.md#как-это-работает-у-myitmo) and
[Keycloak endpoint documentation](https://www.keycloak.org/securing-apps/oidc-layers).

For the approved project client, configure and verify these steps with ITMO:

1. Enable the authorization-code flow and require PKCE S256. Register the exact HTTPS callback your service owns;
   register a development callback separately if needed. Agree allowed browser origins if token exchange is to run
   in a browser. Decide whether the client is public or confidential; a confidential client's secret stays server-side.
2. Send the browser to the discovery `authorization_endpoint` with `client_id=<approved-client-id>`,
   `response_type=code`, the registered `redirect_uri`, approved `scope`, fresh unpredictable `state` and `nonce`,
   `code_challenge=BASE64URL(SHA256(code_verifier))`, and `code_challenge_method=S256`.
3. On the callback, validate state and any authorization error, then exchange the code at the discovery
   `token_endpoint` using form fields `grant_type=authorization_code`, `client_id`, the identical `redirect_uri`,
   `code`, and the original `code_verifier`. Apply the client authentication method agreed with ITMO if confidential.
   Validate returned identity tokens with a maintained OIDC library; decoding a JWT is not signature verification.
4. Make an actual timetable request with the resulting **access token**. Confirm API audience/permissions with ITMO
   if it is rejected: successful OIDC login alone does not satisfy this step. Verify renewal and persisted token
   replacement before scheduling a second run. Do not substitute the portal's client ID to bypass client registration.

For an owner-operated experiment using an existing My ITMO session, a refresh request has this shape:

```http
POST https://id.itmo.ru/auth/realms/itmo/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&client_id=student-personal-cabinet&refresh_token=<URL-ENCODED-REFRESH-TOKEN>
```

This uses a refresh token issued to **that client**, not the access token copied from Network. A different registered
client must use its own client ID and configured authentication. Do not guess a client secret.
The request is a protocol template; no credentialed refresh was performed during this audit.

Treat renewal as rotating: save every returned replacement refresh token durably and atomically before doing
timetable work. If persistence fails, stop; do not continue using a stale stored token. Serialize renewals and prevent
overlapping jobs. On an expired/revoked session (`invalid_grant`), keep the last good timetable and require a fresh
official login. Do not repeatedly retry invalid credentials. Do not copy a browser's actively used refresh token into
a second competing worker. [Client refresh implementation](https://github.com/kewldan/go-itmo/blob/55fe3eb322fe91827ed4e042dbdba401ea45a023/itmoid/token.go).

A repository secret is injected into a job; receiving a new token does not automatically update that secret. A cron
design therefore needs a protected durable token store plus a tested write-back path. For GitHub Actions, ordinary
`GITHUB_TOKEN` is not a general secret-management credential: do not assume `contents: write` can rotate repository
secrets. The implementation in section 8 instead uses encrypted Actions artifacts as its durable store;
it never attempts to update GitHub secrets automatically.
[GitHub repository-secret update API](https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret).

Do **not** collect ITMO passwords in the site, backend, or CI. The SOW's password-grant suggestion conflicts with this
repository's rules. Realm discovery listing that grant does not prove it is enabled for `student-personal-cabinet`.
Do not request `offline_access` or promise permanent sessions without confirmation from ITMO.

## 6. Integration and deployment order

Implement only after the manual and group-coverage checks succeed:

1. Build a read-only adapter with timeouts, HTTP + `code === 0` checks, schema validation, exact date coverage and
   explicit subject/type/flow mapping. Start with 7–14 days; the server's maximum range is unverified. Fetch without
   subject filters initially so a filter cannot silently hide expected classes.
2. Produce a **reviewable diff**, preserving the last good snapshot on every failure. Validate complete days even
   when `lessons: []`. An absent day is incomplete data; an empty personal day is not proof of a group cancellation.
3. Compare subject, kind, flow, teacher, date/time, room **and building**. Retain upstream IDs as evidence, but first
   test whether `pair_id` survives rescheduling. Do not match two labs by subject alone. Ambiguous matches become
   “needs review”; do not invent a move to another day from a missing-plus-added pair.
4. Preserve `data/schedule.json` version 1 and its 14-day cycle. Each `overrides[date] = { note, lessons }` replaces
   the **whole day**, so include all reviewed shared lessons, retain unrelated/manual overrides, and never write an
   empty replacement after an API/filter error. Changed lessons use existing `start`, `end`, `subject`, `room`,
   `teacher`, `location`, `kind` fields. Do not add SOW metadata to shared data without agreeing its format first.
5. Review changes manually before publishing initially. Automatic deletion/cancellation should remain disabled
   until the source is proven authoritative for the group and complete for the affected dates.
6. Keep existing data consumers consistent. `parseGroupSchedule()` currently translates changed rooms into
   cancellation + addition, drops unknown fields, and its `sameClass` comparison omits building. The model already
   has `cancelled`, `moved`, `replaced`, `additional` exceptions, but not the SOW's raw `change` metadata. Simply
   appending `previousRoom` will not provide a linked room-change warning.
7. Apply classic behavior through `app/src/lib/classicPatch.ts` and `app/classic/` sources. Do not directly edit root
   `js/schedule.js`, `js/schedule-ui.js`, `site.css`, or `index.html` as the SOW proposes; see `AGENTS.md`.
8. Arrange publication explicitly. A commit pushed with a workflow's `GITHUB_TOKEN` does **not** trigger the existing
   `on: push` deployment. Explicitly dispatch `deploy-pages.yml` using appropriate Actions permission after successful
   validation/commit, or make synchronization part of an agreed build pipeline. Run only trusted code with credentials.
   [GitHub workflow-trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
9. Build `.ics` from the **same accepted snapshot** as the site. Currently `app/scripts/build-ics.ts` reads the remote
   group `master`, not a changed local `data/schedule.json`; regenerating it before publishing local changes can still
   use old data. `npm run site -- --fresh` also fetches remote content. Align those inputs or publish and verify the
   remote snapshot before the deployment consumes it. Do not commit generated `dist/` as timetable source data.
10. Before enabling a scheduled workflow, test renewal + durable save + a second run, failed/incomplete fetches,
    null/unknown fields, ambiguous moves, manual override conflicts, stable calendar UIDs, both site editions and
    the deployment trigger. Use the full repository checks from `AGENTS.md` before committing implementation.

For twice daily checks at **06:00 and 18:00 Moscow time**, a UTC cron is `0 3,15 * * *`. Scheduled execution can be
delayed; it is not a real-time cancellation feed. Token renewal deadlines must also account for idle periods, not
only the timetable polling interval. A browser-only import can be evaluated with `credentials: 'omit'` and a bearer
header after authenticated CORS verification; `Access-Control-Allow-Origin: *` does not permit cookie-credentialed
cross-origin requests. CORS is not an access-control substitute for keeping an administrator's token private.
[Browser CORS credential rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#credentialed_requests_and_wildcards).

## 7. Remaining SOW corrections

- Its **“Implementation-Ready”** status was unjustified: authenticated payloads, group coverage and service access
  still require validation. Client unit-test fixtures establish client behavior, not a live server guarantee.
- **`type_name`, `status`, previous room and cancellation notes** in its example must not be presented as API facts.
- **Cancellation wording:** an inferred difference must not say “the instructor cancelled” without evidence.
- **Design tokens:** modern CSS uses `--color-danger-soft`, `--color-warning-soft`, `--color-border`, not the SOW's
  `*-subtle` / `--surface-border` names. Classic has its own semantic tokens.
- **Existing work:** the local `app/classic/home-dashboard.js` already has an uncommitted Санкт-Петербург label
  change. This review preserved it. Keep campus time calculation separate from the city label.
- **References:** `kewldan/go-itmo` and `alllexey-dev/my-itmo-api` were inspected at the revisions linked above;
  “production-tested” is not established by a README or endpoint count. The Kotlin multiplatform module now exists.
  The inspectable browser exporter is [S-txt/my.itmo-schedule-exporter](https://github.com/S-txt/my.itmo-schedule-exporter),
  rather than the SOW's `kotano/itmo-schedule-exporter`. Other listed projects were not used as verification evidence.

## 8. Selected setup: GitHub Actions, with private credentials

The owner selected GitHub Actions and confirmed the personal API check succeeds. The supplied flow labels include
shared lectures `1(M3101,M3102,M3103,M3104,M3105)`, practical/lab flows `1.2(M3102)`, and a discrete-mathematics
consultation `1.2.1(M3102)`. English `АЯ-C1/7` and sport `Плавание` are personal and must be excluded.
This is useful evidence for a reviewed flow mapping; it does not establish every subject ID or every subgroup.
Consultations are real entries and must not be silently converted into ordinary practices or discarded.

An access token alone cannot support indefinite scheduled requests. The selected design is:

```text
Private GitHub environment secret: ITMO_REFRESH_TOKEN
    → obtain fresh access token from ITMO.ID
    → encrypt the renewed session using a key derived from the original environment secret
    → upload an encrypted session checkpoint using GitHub Actions
    → fetch and validate personal timetable
    → filter reviewed shared subjects/flows
    → review/accept changes
    → publish only timetable data and rebuild the site/calendar
Next run restores the encrypted checkpoint instead of reusing the original refresh token.
```

### Find the refresh token without sharing it

1. Use a separate browser profile for the automation session if possible, sign into
   [my.itmo.ru](https://my.itmo.ru/) normally, and open the timetable.
2. Open developer tools → **Application** (Chrome/Edge) or **Storage** (Firefox).
3. Expand **Local Storage** → `https://my.itmo.ru`. Search for `_refresh_token`.
   The current portal's expected key is **`auth._refresh_token.itmoId`**. Do not choose the similarly named
   `_refresh_token_expiration` key or the `_token.itmoId` access-token key.
4. Copy the refresh-token **value** privately. It should be the token itself, without a `Bearer ` prefix,
   JSON string quotes, or cookie percent-encoding. Prefer the local-storage value to a URL-encoded cookie value.
5. If the key is absent, enable **Preserve log** in **Network**, then perform a fresh official sign-in.
   Find the `POST` to `id.itmo.ru/.../protocol/openid-connect/token`. In its **Response**, locate `refresh_token`.
   Confirm the request belongs to client `student-personal-cabinet`; do not copy `access_token` or `id_token`.
6. After handing that session to the worker, close its browser tabs so the browser does not compete with the worker
   for renewal. Do not log out of the handed-off session: logout can invalidate the refresh token. Continue daily use
   in your normal browser profile. This is a session handoff, not an independent permanent API credential.

The storage key and refresh mechanism were checked in the portal's public
[auth configuration](https://my.itmo.ru/_nuxt/f8f1906.js) and
[auth implementation](https://my.itmo.ru/_nuxt/22dcba8.js). These are inspected frontend details, not a stable API guarantee.
If your live portal differs, its current token response is authoritative. Do not paste credentials into this chat.

### Create the private token store

In [the group repository settings](https://github.com/RedstoneLord/itmo-m3102/settings):

1. Open **Environments** → **New environment**, name it **`itmo-timetable-sync`**.
2. Restrict deployment branches to `master`. Required reviewers, if enabled, would require approval for each run;
   choose that intentionally rather than assuming an approved environment runs unattended.
3. In that environment's **Environment secrets**, add **`ITMO_REFRESH_TOKEN`** with the raw refresh token as its value.
   No access-token secret is needed: the job obtains a short-lived access token at runtime.

Use an **environment secret**, not a repository variable or a `VITE_*` setting. Trusted code running in that
environment can access it. Never put raw tokens in source files, `.env`, the generated site, workflow YAML literals,
Actions caches, artifacts, or job outputs. The session artifact described below contains **ciphertext only**.
[GitHub environment-secret instructions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-environment).

### Save rotation without a GitHub App

Only **`ITMO_REFRESH_TOKEN`** is configured by the owner. `ITMO_SYNC_APP_CLIENT_ID`, `ITMO_SYNC_APP_PRIVATE_KEY`,
a personal GitHub token, and secret-administration permissions are **not needed**.

The initial refresh token remains unchanged in GitHub's environment settings. It serves as the bootstrap credential
and the secret input for deriving an encryption key. The worker uses HKDF-SHA256, scoped to this repository, and
AES-256-GCM with a fresh random 12-byte nonce for each checkpoint. The saved access and refresh tokens are encrypted
before touching disk; decryption occurs only in memory in the credentialed job. Treat the original secret as
confidential even after its ITMO token expires: it is still the key to saved checkpoints.
[Node cryptography documentation](https://nodejs.org/docs/latest-v22.x/api/crypto.html).

Each run:

1. Uses GitHub's automatically supplied **`GITHUB_TOKEN`**, with `actions: read`, to locate the latest matching
   encrypted session artifact from `master`. This token is generated by GitHub; the owner does not request or add it.
2. Downloads and decrypts that checkpoint, or uses the supplied refresh token when there is no checkpoint for that
   secret. Failure to list/download/decrypt an existing checkpoint stops before contacting ITMO.ID.
3. Renews the ITMO session once and masks all returned tokens. Writes only encrypted state to
   `runner.temp/itmo-private/session.json.enc`.
4. Uploads a uniquely named `itmo-session-v1-…` checkpoint with **7-day retention**, **before** fetching the timetable.
   A later fetch, schema, test, or deployment failure does not discard renewal. The next run restores the newest
   checkpoint even if its workflow ultimately failed. A rerun uses a new artifact name.
5. Fetches and validates the timetable, then passes **only the sanitized public timetable** to the site build.
   The private directory and encrypted session artifact are never included in the Pages site.

The official artifact actions support downloading from another run with a GitHub token and a run ID. Listing and
reading artifacts require Actions read permission, rather than secret-administration access.
[Download action configuration](https://github.com/actions/download-artifact/blob/v4/action.yml),
[GitHub artifact API](https://docs.github.com/en/rest/actions/artifacts),
[upload action and retention](https://github.com/actions/upload-artifact/blob/v4/action.yml).

The workflow retains `concurrency: pages` and `cancel-in-progress: false` to serialize refreshes. Do not run a second
worker or browser session using that same refresh token. Artifact persistence and the ITMO exchange cannot form one
atomic transaction: a lost response, runner interruption, or checkpoint-upload failure after rotation can still require
a fresh official login. Seven days is the checkpoint-retention window, **not** an ITMO session-lifetime guarantee.
If all checkpoints expire or are deleted, the original bootstrap token may already have been consumed; reseed it.

### Deploy to the shared website

The existing secret is sufficient, provided it is still valid. These are the remaining steps:

1. **Repository settings:** in [Environments → itmo-timetable-sync](https://github.com/RedstoneLord/itmo-m3102/settings/environments),
   confirm `ITMO_REFRESH_TOKEN` exists, `master` is allowed, and there is no required approval that would block every
   hourly run. If the secret was copied from a session still open in your browser, hand off a fresh separate session
   as described above before the first run.
2. In [Settings → Pages](https://github.com/RedstoneLord/itmo-m3102/settings/pages), choose **Source: GitHub Actions**.
   In **Settings → Actions → General**, allow the official actions used by the workflow and artifact retention of
   at least seven days. There is no need to grant broad repository write permission to the workflow token.
3. Publish the local implementation branch through **one pull request into `master`**, after the repository checks.
   A squash merge can keep this to one implementation commit. The merged workflow automatically starts the first
   deployment; an unmerged local branch cannot activate the shared website or the hourly schedule.
4. In [Actions → Deploy to GitHub Pages](https://github.com/RedstoneLord/itmo-m3102/actions/workflows/deploy-pages.yml),
   inspect that first run, or choose **Run workflow → master**. Confirm `timetable`, `build`, and `deploy` succeed.
   The timetable job should show a saved encrypted checkpoint and **49 complete days** in its public snapshot.
5. Check both the [classic site](https://redstonelord.github.io/itmo-m3102/) and
   [modern schedule](https://redstonelord.github.io/itmo-m3102/app/#/schedule): the source should say My ITMO with a
   recent timestamp, with the expected rooms, missing-lesson notices, and consultations. Check the published
   [calendar subscription](https://redstonelord.github.io/itmo-m3102/app/m3102.ics) too.
6. **Run the workflow a second time.** It must say **Encrypted session checkpoint located**, complete another
   renewal, and publish successfully with **no secret edits and no additional commits**. This is the live rotation
   acceptance check; local synthetic tests cannot replace it.
7. Leave the hourly trigger enabled. It runs at **minute 17 of every hour UTC** (also minute 17 in Moscow), with
   possible GitHub scheduling delays. Visitors receive public timetable data; they do not sign into ITMO.

[GitHub Pages custom-workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
Do not start a separate schedule workflow: the existing deployment workflow owns the refresh session and publishes
both editions and their calendar together.

GitHub schedules run from the **default branch**, so confirm it is `master`. In public repositories GitHub disables
scheduled workflows after **60 days without repository activity**; re-enable the workflow in Actions if this happens.
Hourly timetable updates themselves do not create commits.
[GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

### When you need to renew manually

If a run reports **ITMO session could not be renewed**, sign into My ITMO in a separate browser profile, obtain a
fresh **refresh token**, and replace **the same `ITMO_REFRESH_TOKEN` environment secret**. Close that handed-off
profile's tabs without logging out, then run **Deploy to GitHub Pages → master** again. No code edit or commit is needed.
Changing the secret automatically starts a new encrypted-checkpoint lineage and ignores checkpoints encrypted with
the old secret. Do not replace the bootstrap secret with a rotated token copied from an artifact.

Also reseed after a checkpoint-upload failure during rotation, or after losing every recent checkpoint. Do not delete
the newest `itmo-session-v1-…` artifact while relying on it for the next run. A damaged checkpoint is an error; the
worker never silently falls back to an older, potentially consumed refresh token.

On authentication, incomplete-data, or validation failure, publication stops and the last successful website remains.
Its displayed fetch timestamp lets visitors see when the data became old. Renewal frequency depends on ITMO's
session policy; hourly refresh does not bypass its maximum lifetime, and no permanent lifetime is promised.

## 9. Implemented hourly publication

- A private `timetable` job checks its one credential setting, locates/restores encrypted session state, renews it,
  and uploads the encrypted checkpoint before any timetable fetch. It fetches seven-day chunks covering 7 days back
  and 42 days from today. HTTP errors, incomplete coverage and unknown academic mappings stop publication.
- A second job receives only an allowlisted public JSON artifact. It builds/tests both editions and writes the same
  `timetable-live.json` to root `data/` and `app/data/` in the Pages artifact. Calendar export reads that exact snapshot
  and the assembled site's group data. No timetable JSON, refresh tokens or generated calendar are committed to git.
- The existing deployment workflow runs on code pushes, manual dispatch, and **minute 17 of each hour**. It does not
  need a commit to refresh the timetable. Publishing remains atomic: failed checks leave the preceding Pages release
  in place. The public snapshot is separate from immutable application assets, and `.ics` is content rather than a
  shell release, so data updates do not require reloading an old open tab's application code. Retryable public artifacts
  use replacement uploads; Pages artifacts are named per build attempt and passed to deployment through a job output,
  allowing a deployment-only retry to reuse the successful build. Encrypted checkpoints are never overwritten.
- Both editions poll their public snapshot every five minutes while visible and keep a validated local fallback.
  The modern Sync button also rechecks it. The displayed time is the upstream fetch timestamp, not when a cached
  response was read. Data older than three hours is labeled saved. Outside verified coverage the UI identifies the
  repeating cycle as a fallback; the connected calendar exports only covered dates.
- Dated pairs replace fixed repetitions inside coverage. Missing pairs remain visible and are excluded from “next
  class”; room changes show the old room, and time/teacher/type changes are marked. A different-day move is linked
  only when a unique upstream pair identity is observed in both snapshots. Missing extra pairs retain tombstones.
  Consultation, exam and credit are supported as distinct types. Personal English, sport, bookings, meeting URLs,
  passwords, notes and user identifiers never enter the public projection.
- Shared data format remains version 1. The root classic files are untouched; build-time patches and `app/classic/`
  provide the classic UI. Runtime metadata is not serialized into the group's editable `schedule.json`.

GitHub Actions scheduling can be delayed. The portal session can still be revoked or expire, requiring a new official
login and replacement of the refresh-token secret. No script can make an ordinary user session a permanent API key.

### Local verification, 15 November 2026

The owner requested that the implementation remain local. No commit, push, deployment, secret changes, or
authenticated renewal was performed. The synthetic snapshot used for verification was removed from preview outputs.

- 343 Vitest tests passed with four workers; 87 desktop/phone Playwright tests passed in a sequential run.
- The final four live-timetable browser checks passed again after the classic draft/export compatibility fix.
- 17 focused Node tests cover importing/filtering, complete dates, token checkpoint order, history/matching, and
  keeping runtime metadata out of classic drafts. The existing root schedule tests also passed.
- Formatting, strict types, build, site assembly, calendar generation and size checks passed: initial JS ~186 KB gzip,
  CSS ~20 KB, largest page ~217 KB (within the existing 215/25/220 KB budgets).
- An artifact integration check verified identical sanitized JSON in both editions and preview, matching calendar
  data/UIDs, and exclusion of dynamic data from the immutable shell manifest.
- Lighthouse's required checks passed: representative accessibility 100%, best practices 96%, CLS 0.059.
  Performance remains below the configured 0.5 warning target; it is not a publication-blocking assertion.
- Workflow checks caught and corrected an invalid job-level `runner` context. The original App-based approach
  described in that audit was superseded by the no-App revision below.

### No-App revision, 16 November 2026

The GitHub App dependency has been removed locally. Only the existing `ITMO_REFRESH_TOKEN` environment secret is
required; new session state is stored as authenticated ciphertext in a separate seven-day Actions artifact.
All **15 session/importer checks** passed, including a CLI-level renewal/failure/recovery simulation, two successive
rotations, a manually replaced secret, ciphertext tampering, repository/key isolation, pagination, failed-run
checkpoint recovery, and credential-free public output. The **343 application unit tests**, formatting check, and
workflow validation with actionlint also passed.
Deployment and two real authenticated runs remain to be performed on GitHub. No live token was requested or used here.

### Release preparation, 16 November 2026

The implementation was rebased onto the latest shared branch, preserving its new bookmark navigation. The combined
application passes **352 unit tests** and **87 browser scenarios**. Four browser scenarios passed after first-run
timeouts; a focused repeat passed all five matching desktop/phone checks with retries disabled. Existing SSH access and the connected GitHub account have been verified.
The shared site already uses the Actions deployment path. The changes are prepared as one implementation commit;
publication and authenticated rotation acceptance checks are still pending at this point. The credentialed worker
reports only numeric token lifetimes (when provided by ITMO) so the hourly cadence can be checked against the live
session policy without exposing token values.

### First protected run, 16 November 2026

[The first protected run](https://github.com/RedstoneLord/itmo-m3102/actions/runs/43769454238) successfully renewed
the real session and uploaded its encrypted checkpoint using only the configured refresh-token secret. ITMO returned
access-token lifetime **1,800 seconds** and refresh-token lifetime **2,592,000 seconds (30 days)**. These are observed
response durations, not a guarantee against earlier revocation or a future policy change.

Publication stopped on an unmapped academic entry in the longer date range; the old website remained intact.
The adapter accepts numeric-string sport/booking IDs and reports only plain course titles in explicitly confirmed
M3102 flows, plus numeric type IDs, for mapping errors. Do not replace the secret for a mapping failure: the encrypted
checkpoint has already preserved renewal. A mapping correction and a new run can reuse it.
