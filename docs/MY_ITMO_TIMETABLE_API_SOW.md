# Statement of Work: My ITMO Timetable API Integration, Individual Elective Filtering, and Dynamic Schedule Warnings

**Document ID:** `SOW-2026-11-15-ITMO-TIMETABLE-API`\
**Target Audience:** Implementing Software Engineer / AI Agent & Theodor (`RedstoneLord`)\
**Project:** `itmo-m3102` (M3102 ITMO Group Dashboard & Academic Portal)\
**Status:** Draft proposal — API/setup assumptions require the corrections below\
**Author:** Antigravity Pairing Agent\
**Date:** 15 November 2026\

> **Reviewed on 15 November 2026:** This proposal is not an executable API contract.
> Read [the verified setup guide and correction register](MY_ITMO_TIMETABLE_API_SETUP.md) before implementation;
> it supersedes conflicting instructions below. In particular, the sample cancellation/status fields are unverified,
> a personal timetable is not proof of the whole group's timetable, password collection is outside project rules,
> and scheduled synchronization needs durable refresh-token rotation and an explicit deployment trigger.

**Implementation update (15 November 2026):** The owner's hourly/no-commit requirement selects a dated live overlay
published through Pages artifacts. The local implementation is described in setup-guide section 9. Manual refresh
uses GitHub Actions `workflow_dispatch`; site refresh buttons read the published snapshot. The original proposal's
university-token input and per-update Git commits are superseded. The 16 November revision needs only the
`ITMO_REFRESH_TOKEN` environment secret and saves rotation in encrypted Actions artifacts; no GitHub App is required.
Activation uses the deployment workflow; its Actions history is the source of truth for the live release status.

---

## 1. Executive Summary & Objective

### 1.1 Current State & The Problem
The timetable for group **М3102** currently relies on a static JSON file ([`data/schedule.json`](file:///home/theodor/Документы/itmo-m3102/data/schedule.json)). This file encodes a 14-day repeating cycle (even/odd study weeks) and a manual `overrides` dictionary.

In university practice, lessons are frequently:
1. **Cancelled** by instructors due to conferences, illnesses, or syllabus adjustments.
2. **Moved to different classrooms** (e.g. relocating from Kronverksky auditorium 2304 to 1330 or 2138).
3. **Rescheduled** to different time slots or dates.
4. **Assigned substitute lecturers**.

Because `data/schedule.json` is updated manually, students regularly encounter outdated room numbers or arrive for classes that have been cancelled.

### 1.2 Objective & Scope
Integrate ITMO University's digital portal API (**My ITMO**, `my.itmo.ru`) into the project lifecycle. The solution must:
1. Connect to the My ITMO API using student authorization credentials and retrieve the up-to-date timetable.
2. **Filter out individual electives**: Automatically strip all **English / Foreign Language** and **Physical Education / Sport** lessons, because students choose individual sections, while keeping the shared academic curriculum for group М3102.
3. **Run a diffing and change-detection engine**: Compare the official live timetable against the baseline 14-day repeating cycle to identify cancellations, classroom reallocations, and rescheduled slots.
4. **Produce updated timetable data**: Update `data/schedule.json` (specifically generating structured `overrides`) and/or provide live overlay updates.
5. **Render prominent visual warnings**:
   - **Main page** ([`NextClassBlock`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/NextClassBlock.tsx) and [`TodaySchedule`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/TodaySchedule.tsx)): hero alerts, warning badges, strikethrough styling on cancelled classes, clear classroom redirection.
   - **Lesson detail popovers / modals** ([`ClassDetailsPopover`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/ClassDetailsPopover.tsx)): high-visibility alert boxes displaying previous vs. new classrooms, cancellation notices, and notes.
   - **Schedule page** ([`SchedulePage`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/SchedulePage.tsx)): day banners, status badges, and modified-day pills.
6. Support both project editions: the modern React/Vite SPA ([`app/`](file:///home/theodor/Документы/itmo-m3102/app)) and the vanilla static site ([`index.html`](file:///home/theodor/Документы/itmo-m3102/index.html), [`js/schedule-ui.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule-ui.js)).
7. **Campus Location & Timezone Label Correction**: Ensure the main page header displays `"Санкт-Петербург"` rather than `"Москва"`. The original string `" · Москва"` in [`app/classic/home-dashboard.js`](file:///home/theodor/Документы/itmo-m3102/app/classic/home-dashboard.js#L44) was intended to denote the MSK timezone (UTC+3), but caused confusion because ITMO University is located in Saint Petersburg.

---

## 2. Reverse-Engineered My ITMO API Specification

### 2.1 Overview & Architecture
ITMO University runs its primary student/staff digital ecosystem on **`my.itmo.ru`**. The frontend communicates with a private microservice REST API gateway.

Authentication is managed via ITMO's Single Sign-On (**ITMO ID**) hosted at `id.itmo.ru` on **Keycloak** (OpenID Connect / OAuth 2.0).

```mermaid
flowchart LR
    A[Student Browser / DevTools] -->|auth._token.itmoId| B(Bearer JWT)
    C[Keycloak id.itmo.ru] -->|OAuth PKCE / Password| B
    B --> D[GET my.itmo.ru/api/schedule/schedule/personal]
    D --> E[Raw JSON Timetable]
    E --> F[Filter: Drop English & Sport]
    F --> G[Diff Engine vs Base Cycle]
    G --> H[data/schedule.json Overrides]
    H --> I[App & Classic UI Warnings]
    H --> J[dist/m3102.ics Subscription]
```

### 2.2 Primary Endpoint: Personal Timetable
* **Endpoint URL:** `https://my.itmo.ru/api/schedule/schedule/personal`
* **HTTP Method:** `GET`
* **Protocol:** HTTPS / TLS 1.3
* **CORS:** Restricted to `my.itmo.ru` origins on client browsers (requires proxy, CLI script, or CI runner).

#### Query Parameters
| Parameter | Type | Required | Description | Example |
|---|---|---|---|---|
| `date_start` | `string` (ISO `YYYY-MM-DD`) | Yes | Start date for timetable query window | `2026-09-01` |
| `date_end` | `string` (ISO `YYYY-MM-DD`) | Yes | End date for timetable query window | `2027-01-31` |

#### Request Headers
| Header | Value | Description |
|---|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` | ITMO ID access token (or raw cookie value) |
| `Accept` | `application/json, text/plain, */*` | Standard API content negotiation |
| `User-Agent` | `Mozilla/5.0 ... Chrome/...` | Standard user-agent header |

#### cURL Invocation Example
```bash
curl "https://my.itmo.ru/api/schedule/schedule/personal?date_start=2026-11-01&date_end=2026-11-30" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Accept: application/json"
```

### 2.3 Authentication & Token Acquisition Mechanisms

#### Method A: Browser Console Session Extraction (Zero Backend / Practical)
When a student is logged into [my.itmo.ru](https://my.itmo.ru), the session token is stored in the browser cookie `auth._token.itmoId`.

Extraction snippet (run in Developer Tools Console `F12` on `my.itmo.ru`):
```javascript
decodeURI(document.cookie.split('auth._token.itmoId=')[1].split(';')[0])
```
*Token Characteristics:*
- Format: Standard RS256 JWT containing student ISU ID, role (`student`), and scopes.
- Expiration: Access token is valid for 15–60 minutes.
- Refresh cookie: `auth._refresh_token.itmoId` (valid for up to 30–90 days).

#### Method B: Keycloak Direct Token Grant (Automated CI / Backend)
Endpoint: `https://id.itmo.ru/auth/realms/itmo/protocol/openid-connect/token`
- Content-Type: `application/x-www-form-urlencoded`
- Payload:
  ```http
  client_id=student-personal-cabinet
  &grant_type=refresh_token
  &refresh_token=<REFRESH_TOKEN>
  ```
  *(Or `grant_type=password&username=<ISU_OR_EMAIL>&password=<PASSWORD>` in secure server/CI runner).*
- Response:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "expires_in": 300,
    "refresh_expires_in": 2592000,
    "refresh_token": "eyJhbGciOi...",
    "token_type": "Bearer"
  }
  ```

### 2.4 Payload Response Schema
The API returns a JSON object wrapping a daily list:

```json
{
  "data": [
    {
      "date": "2026-11-17",
      "lessons": [
        {
          "subject": "Дискретная математика",
          "type_name": "Практика",
          "time_start": "13:30",
          "time_end": "15:00",
          "room": "1330",
          "building": "Кронверкский пр., д.49, лит.А",
          "teacher_name": "Кулешова Екатерина Дмитриевна",
          "format": "Очно",
          "status": "moved",
          "note": "Перенос из ауд. 2240"
        },
        {
          "subject": "Линейная алгебра",
          "type_name": "Лекция",
          "time_start": "09:50",
          "time_end": "11:20",
          "room": "2337",
          "building": "Кронверкский пр., д.49, лит.А",
          "teacher_name": "Ржонсницкая Юлия Борисовна",
          "format": "Очно",
          "status": "cancelled",
          "note": "Пара отменена"
        },
        {
          "subject": "Иностранный язык",
          "type_name": "Практика",
          "time_start": "15:30",
          "time_end": "17:00",
          "room": "1205",
          "building": "ул. Ломоносова, д.9",
          "teacher_name": "Smith J.",
          "format": "Очно"
        },
        {
          "subject": "Элективные дисциплины по физической культуре и спорту",
          "type_name": "Практика",
          "time_start": "17:10",
          "time_end": "18:40",
          "room": "Спорткомплекс",
          "building": "Вяземский пер., д.5-7",
          "teacher_name": "Инструктор А.В.",
          "format": "Очно"
        }
      ]
    }
  ]
}
```

### 2.5 Ecosystem & Reference Repositories
- **`kewldan/go-itmo`**: Production-tested Go client for ITMO.ID and `my.itmo.ru` (~450 endpoints, including `client.Schedule.Personal`).
- **`alllexey-dev/my-itmo-api`**: Kotlin Multiplatform / Java client with OIDC token refresh and schedule models.
- **`Ivan-Sysoev/itmo-auth`**: Python authentication helper for `id.itmo.ru` token refresh.
- **`kotano/itmo-schedule-exporter`**: JavaScript schedule parser for iCalendar generation.
- **`anton-ozerov/itmo-to-google-cal`**: Schedule sync script connecting to My ITMO.

---

## 3. Data Transformation & Filtering Specification

### 3.1 Rationale for Elective Exclusion
At ITMO University, two core disciplines in 1st year are organized on an individual, non-group track:
1. **Foreign Language (English)**: Students are assessed by proficiency levels (A1 through C1) and assigned to independent cross-group streams.
2. **Physical Education & Sport**: Students enroll individually in sport sections (swimming, basketball, gym, athletics, chess) at varying locations and schedules.

Including them in group М3102's shared schedule would pollute the common calendar with one student's individual electives.

### 3.2 Filtering Rules & Regular Expressions
Before any comparison or schedule generation occurs, incoming lesson entries must pass the following exclusion filters:

```typescript
export const EXCLUDED_SUBJECT_PATTERNS: RegExp[] = [
  // English / Foreign language
  /иностранный\s+язык/i,
  /английский\s+язык/i,
  /english/i,
  /foreign\s+language/i,

  // Physical education / Sports
  /физическая\s+культура/i,
  /элективные\s+дисциплины\s+по\s+физической\s+культуре/i,
  /элективный\s+спорт/i,
  /спорт/i,
  /секция/i,
  /физкультура/i,
];

export function isIndividualElective(subjectName: string): boolean {
  const normalized = subjectName.trim().toLowerCase();
  return EXCLUDED_SUBJECT_PATTERNS.some((pattern) => pattern.test(normalized));
}
```

### 3.3 Target Curriculum Alignment for M3102
Lessons retained after filtering must map to known М3102 subjects via [`resolveSubjectFolder()`](file:///home/theodor/Документы/itmo-m3102/app/src/data/m3102.ts#L33):
- **`dm`**: Дискретная математика
- **`linal`**: Линейная алгебра
- **`matan`**: Математический анализ
- **`aisd`**: Алгоритмы и структуры данных
- **`isrpo`**: Инструментальные средства разработки ПО
- **`op`**: Основы программирования

---

## 4. Diffing Engine & Change Detection

### 4.1 Comparison Model
The system compares the filtered live API lessons for date $D$ against the baseline repeating cycle defined in [`data/schedule.json`](file:///home/theodor/Документы/itmo-m3102/data/schedule.json):
1. Compute the parity for date $D$ using [`weekParity(D, schedule)`](file:///home/theodor/Документы/itmo-m3102/js/schedule.js#L19).
2. Retrieve the baseline lessons: $B = \text{cycle}[\text{cycleDayIndex}(D, \text{schedule})]$.
3. Retrieve filtered API lessons for date $D$: $A = \text{filter}(\text{API}(D))$.

### 4.2 Change Classification Rules

```mermaid
flowchart TD
    Start[For each Lesson in Base Cycle] --> CheckAPI{Present in API on Date D?}
    CheckAPI -- No or status=cancelled --> FlagCancelled[Mark CANCELLED]
    CheckAPI -- Yes --> CompareRoom{Same Classroom & Building?}
    CompareRoom -- No --> FlagRoomMoved[Mark MOVED_ROOM: oldRoom -> newRoom]
    CompareRoom -- Yes --> CompareTime{Same Start & End Time?}
    CompareTime -- No --> FlagTimeMoved[Mark MOVED_TIME: oldTime -> newTime]
    CompareTime -- Yes --> Normal[Unchanged Regular Lesson]

    APIExtra[For each API Lesson not in Base Cycle] --> FlagAdditional[Mark ADDITIONAL / SUBSTITUTE]
```

#### 1. Cancelled Lesson (`cancelled`)
- **Trigger:** A lesson exists in the baseline cycle $B$, but is either explicitly flagged as `status: "cancelled"` in the API, or is missing entirely from the API's active lesson list for that date.
- **Data Action:** In `overrides[D]`, omit this lesson (or add cancellation flag). In React model, emit `ScheduleException` of kind `'cancelled'`.

#### 2. Classroom Relocation (`moved_room`)
- **Trigger:** Subject and time slot match between baseline $B$ and API $A$, but `A.room !== B.room` or `A.building !== B.building`.
- **Data Action:** Store the updated room in `overrides[D]` with metadata:
  ```json
  {
    "id": "cycle-03-1",
    "start": "13:30",
    "end": "15:00",
    "subject": "Дискретная математика",
    "room": "1330",
    "previousRoom": "2240",
    "teacher": "Кулешова Екатерина Дмитриевна",
    "kind": "practice",
    "change": "room_moved"
  }
  ```

#### 3. Time Reschedule / Moved Day (`moved_time`)
- **Trigger:** Lesson subject appears at a different time slot or date.
- **Data Action:** In `overrides[D]`, adjust `start` and `end`, and record `originalStart` / `originalDate`.

#### 4. Additional Lesson / Substitution (`additional` / `replaced`)
- **Trigger:** An entry exists in API $A$ that has no corresponding lesson in baseline $B$.
- **Data Action:** Added as an additional lesson in `overrides[D]`.

---

## 5. Integration Architectures: Trade-Offs & Recommended Strategy

We evaluate three technical integration paths:

| Criterion | Architecture 1: GitHub Actions Scheduled Sync | Architecture 2: Admin In-Browser Sync | Architecture 3: Edge Worker / Backend Proxy |
|---|---|---|---|
| **Mechanism** | Cron job runs in CI, fetches API, commits updated `schedule.json` | Headman opens schedule editor, inputs token, reviews diff, clicks "Save to GitHub" | Cloudflare Worker / Go service proxies `my.itmo.ru` and returns live JSON |
| **Hosting Cost** | $0 (GitHub Actions free tier) | $0 (Pure client-side) | $0–$5/mo (Cloudflare free / VPS) |
| **Static Site Parity** | 100% compatible with GitHub Pages | 100% compatible with GitHub Pages | Requires external endpoint URL |
| **Offline Support** | Works offline via Service Worker & cache | Works offline via Service Worker & cache | Fails when offline without complex caching |
| **Calendar Sync** | [`scripts/build-ics.ts`](file:///home/theodor/Документы/itmo-m3102/app/scripts/build-ics.ts) rebuilds automatically | Requires rebuild push | Dynamic iCal generation |
| **Security** | Secrets stored in GitHub Actions Secrets | Token lives only in headman's browser tab | Token/Credentials on server |
| **Update Frequency** | Hourly / Daily scheduled sync | On-demand when editor clicks sync | Real-time on client request |

### Recommended Hybrid Strategy
1. **Primary Production Pipeline (Architecture 1 - Scheduled CI Automation):**
   - Implement a standalone Node.js script: [`app/scripts/sync-itmo-timetable.ts`](file:///home/theodor/Документы/itmo-m3102/app/scripts/sync-itmo-timetable.ts).
   - Configure a GitHub Action: [`.github/workflows/sync-timetable.yml`](file:///home/theodor/Документы/itmo-m3102/.github/workflows/sync-timetable.yml) triggered on cron (e.g. daily at 06:00 and 18:00 Moscow time, and manual `workflow_dispatch`).
   - The script pulls the timetable, applies elective filtering, performs diffing, writes `data/schedule.json`, regenerates `dist/m3102.ics`, and creates a commit if changes are detected.
2. **Secondary Interactive Admin Tool (Architecture 2 - Editor GUI):**
   - Add a *"Синхронизировать с My ITMO"* action button in the schedule editor toolbar ([`ScheduleToolbar.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/ScheduleToolbar.tsx) and [`js/schedule-editor.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule-editor.js)).
   - Allows headman/admin to paste a fresh token from My ITMO, review a visual diff preview modal, and commit immediately without waiting for the next cron cycle.

---

## 6. UI / UX Design & Visual Warning Specifications

### 6.1 Design Tokens & Palette Standards
The project uses strict CSS custom properties. All warning and error elements must adhere to these tokens:
- **Danger (Cancellations):**
  - Text/Icon: `var(--color-danger)` (`#ef4444` / light-mode equivalent)
  - Subtle Surface: `var(--color-danger-subtle)` (`rgba(239, 68, 68, 0.12)`)
  - Border: `color-mix(in srgb, var(--color-danger) 30%, var(--surface-border))`
- **Warning (Room Moves / Reschedules):**
  - Text/Icon: `var(--color-warning)` (`#f59e0b`)
  - Subtle Surface: `var(--color-warning-subtle)` (`rgba(245, 158, 11, 0.12)`)
  - Border: `color-mix(in srgb, var(--color-warning) 30%, var(--surface-border))`

### 6.2 Visual Warning Placements

#### Surface 1: Main Page Hero Block (`NextClassBlock` & Classic `.student-next`)
The hero block is the primary visual anchor for students opening the site.

```
+---------------------------------------------------------------------------------+
|  ● ИДЁТ СЕЙЧАС                          [ Внимание: пара в другой аудитории ]   |
|                                                                                 |
|  09:50      Дискретная математика                                               |
|             Практика · Ауд. 1330 (вместо 2304) · Кулешова Е. Д.                 |
|                                                                                 |
|  [!] Внимание: занятие перенесено в аудиторию 1330. Обычная аудитория: 2304.    |
|  -----------------------------------------------------------------------------  |
|  [Конспект]   [Материалы]                                                       |
+---------------------------------------------------------------------------------+
```

```
+---------------------------------------------------------------------------------+
|  ✕ ПАРА ОТМЕНЕНА                                              [ Занятия нет ]   |
|                                                                                 |
|  ~11:30~    ~Линейная алгебра~                                                  |
|             Лекция · ауд. 2337 · Ржонсницкая Ю. Б.                              |
|                                                                                 |
|  [✕] Преподаватель отменил(а) пару. Следующее занятие: ДМ в 13:30 (ауд. 1330)   |
|  -----------------------------------------------------------------------------  |
|  [Следующая пара: Дискретная математика в 13:30]                                |
+---------------------------------------------------------------------------------+
```

**Implementation Requirements for [`NextClassBlock.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/NextClassBlock.tsx):**
1. Check if `upcoming` has `occurrence.status === 'cancelled'` or room modification (`occurrence.details.room !== baseLesson.room`).
2. If **Cancelled**:
   - Render an alert banner above the main information with danger tone.
   - Apply strikethrough styling (`text-decoration: line-through; opacity: 0.7`) to the cancelled subject name and start time.
   - Display a secondary banner informing the student of the next actually active class.
3. If **Room Changed**:
   - Render warning badge: `<Badge tone="warning">Аудитория перенесена</Badge>`.
   - In details line: render `<span className={styles.movedRoom}>ауд. 1330 <del className={styles.prevRoom}>2304</del></span>`.
   - Render alert banner: `Внимание: занятие перенесено в аудиторию 1330. По обычному расписанию: 2304`.

#### Surface 2: Today's Schedule List (`TodaySchedule` / `DayOccurrenceRow`)
In [`DayOccurrenceRow.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/DayOccurrenceRow.tsx):
- **Cancelled Row:**
  - Row container receives class `styles.cancelledRow` (opacity `0.55`, subtle greyed background).
  - Subject title rendered with strikethrough: `<span className={styles.cancelledTitle}>{subjectName}</span>`.
  - Trailing badge: `<Badge tone="danger">Отменено</Badge>`.
  - Secondary note: `Занятие отменено преподавателем`.
- **Moved Room Row:**
  - Trailing badge: `<Badge tone="warning">Ауд. 1330</Badge>`.
  - Room text highlighted with amber indicator dot and previous room note: `ауд. 1330 (было 2240)`.

#### Surface 3: Schedule Page (`SchedulePage` & `DayView`)
In [`SchedulePage.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/SchedulePage.tsx) and [`js/schedule-ui.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule-ui.js):
- **Day Notice Banner:**
  When viewing a day that has cancellations or room relocations, render an informational banner above the timeline:
  ```html
  <div class="sched-changes-banner">
    <span class="icon">⚠</span>
    <span>В расписании на этот день есть изменения (1 отмена, 1 перенос аудитории)</span>
  </div>
  ```
- **Week Pill Indicator:**
  Days containing overrides already support `.week-edited`. Ensure the dot displays distinct colors:
  - Red dot if day contains a cancellation.
  - Amber dot if day contains a room change.

#### Surface 4: Lesson Details Popover (`ClassDetailsPopover`)
In [`ClassDetailsPopover.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/ClassDetailsPopover.tsx):
Insert a prominent status block at the very top of the popover card:
- **Case 1: Room Relocation:**
  ```tsx
  <div className={styles.alertMoved}>
    <AlertTriangle size={16} className={styles.alertIcon} />
    <div>
      <strong>Аудитория изменена!</strong>
      <p>Занятие пройдёт в ауд. <strong>1330</strong> (по обычному расписанию — 2304).</p>
    </div>
  </div>
  ```
- **Case 2: Cancelled Lesson:**
  ```tsx
  <div className={styles.alertCancelled}>
    <XCircle size={16} className={styles.alertIcon} />
    <div>
      <strong>Занятие отменено</strong>
      <p>По данным My ITMO пара {occurrence.date} не проводится.</p>
    </div>
  </div>
  ```
- **Visual Diff Section:**
  Include a structured metadata block comparing:
  - **Обычно:** ауд. 2304, Кронверкский пр., д.49
  - **Сейчас (My ITMO):** ауд. 1330, Кронверкский пр., д.49

### 6.3 Campus City & Timezone Header Label Correction
In the classical dashboard header controller ([`app/classic/home-dashboard.js`](file:///home/theodor/Документы/itmo-m3102/app/classic/home-dashboard.js#L44)), the week parity status line was previously rendered as:
```javascript
parity.textContent = `${isVacation(now, schedule) ? 'Каникулы' : weekParity(now, schedule) === 'even' ? 'Чётная неделя' : 'Нечётная неделя'} · Москва`;
```
The suffix `" · Москва"` was originally intended to denote the MSK reference timezone (UTC+3), but caused confusion because ITMO University is situated in Saint Petersburg (Kronverksky Pr., Lomonosova St., etc.).
- **Required Change:** Replace `" · Москва"` with `" · Санкт-Петербург"`:
```javascript
parity.textContent = `${isVacation(now, schedule) ? 'Каникулы' : weekParity(now, schedule) === 'even' ? 'Чётная неделя' : 'Нечётная неделя'} · Санкт-Петербург`;
```

---

## 7. Technical Touchpoint Inventory

The table below lists every file to be created or modified by the implementing agent:

| File Path | Role | Nature of Change |
|---|---|---|
| [`app/classic/home-dashboard.js`](file:///home/theodor/Документы/itmo-m3102/app/classic/home-dashboard.js) | Classic Dashboard Controller | **Modify**: Update city/timezone header string from `" · Москва"` to `" · Санкт-Петербург"`. |
| [`app/scripts/sync-itmo-timetable.ts`](file:///home/theodor/Документы/itmo-m3102/app/scripts/sync-itmo-timetable.ts) | Core Synchronization Script | **New File**: Implements API fetching, English/Sport filtering, diff engine against `cycle`, writes updated `data/schedule.json`. |
| [`.github/workflows/sync-timetable.yml`](file:///home/theodor/Документы/itmo-m3102/.github/workflows/sync-timetable.yml) | Scheduled Automation | **New File**: GitHub Actions workflow running on cron (`0 3,15 * * *`) and `workflow_dispatch`. |
| [`data/schedule.json`](file:///home/theodor/Документы/itmo-m3102/data/schedule.json) | Data Store | **Data Target**: Schema updated with generated `overrides` containing `previousRoom` and `change` attributes. |
| [`app/src/services/groupSchedule.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/services/groupSchedule.ts) | Model Parser | **Modify**: Parse `previousRoom`, `change`, and `note` fields from overrides into `ScheduleException` and `ClassDetails`. |
| [`app/src/features/schedule/labels.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/labels.ts) | Badges & Labels | **Modify**: Add `roomMoved` badge (`tone: 'warning'`, label: `'Ауд. изменена'`). |
| [`app/src/features/schedule/DayOccurrenceRow.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/DayOccurrenceRow.tsx) | Schedule Day Row | **Modify**: Render strikethrough for cancellations, highlight changed classrooms. |
| [`app/src/features/schedule/ClassDetailsPopover.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/ClassDetailsPopover.tsx) | Lesson Details Modal | **Modify**: Add prominent warning callout box at top for room moves and cancellations. |
| [`app/src/features/today/NextClassBlock.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/NextClassBlock.tsx) | Homepage Hero Card | **Modify**: Add warning banners, strikethrough for cancelled next class, room shift warning. |
| [`app/src/features/today/classStatus.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/classStatus.ts) | Hero Status Resolver | **Modify**: Provide cancellation context so hero block can inform students of cancelled pair rather than silently skipping. |
| [`js/schedule.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule.js) | Classic Model | **Modify**: Enhance `normalizeLesson` to preserve `previousRoom` and `change`. |
| [`js/schedule-ui.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule-ui.js) | Classic UI | **Modify**: Display cancellation banner and room move badge in classic lesson cards. |
| [`site.css`](file:///home/theodor/Документы/itmo-m3102/site.css) | Classic Styles | **Modify**: Add styles for `.sched-entry.cancelled`, `.sched-room-moved`, and `.sched-alert-pill`. |

---

## 8. Implementation Roadmap for the Next Agent

The implementing agent should execute the integration in the following 5 phases:

### Phase 1: Standalone Sync Script & API Client
1. Create [`app/scripts/sync-itmo-timetable.ts`](file:///home/theodor/Документы/itmo-m3102/app/scripts/sync-itmo-timetable.ts).
2. Implement `fetchMyItmoSchedule(token, startDate, endDate)`.
3. Implement `filterElectives(rawLessons)` to remove English and Sport.
4. Implement `diffAgainstBaseCycle(filteredLessons, baseCycle)` to generate `overrides`.
5. Test locally using a mock JSON or test token.

### Phase 2: Schema & Service Extensions
1. Update [`app/src/services/groupSchedule.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/services/groupSchedule.ts) and types in [`app/src/types/models.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/types/models.ts) to support `previousRoom` and change flags.
2. Update unit tests in [`app/src/services/groupSchedule.test.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/services/groupSchedule.test.ts).

### Phase 3: React App Warning Components
1. Update [`labels.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/labels.ts) with new badges.
2. Update [`ClassDetailsPopover.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/ClassDetailsPopover.tsx) with the prominent warning alert banner.
3. Update [`NextClassBlock.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/NextClassBlock.tsx) and [`classStatus.ts`](file:///home/theodor/Документы/itmo-m3102/app/src/features/today/classStatus.ts) with cancellation callouts and room-changed badges.
4. Update [`DayOccurrenceRow.tsx`](file:///home/theodor/Документы/itmo-m3102/app/src/features/schedule/DayOccurrenceRow.tsx).

### Phase 4: Classic Site Warning UI
1. Update [`js/schedule.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule.js) and [`js/schedule-ui.js`](file:///home/theodor/Документы/itmo-m3102/js/schedule-ui.js).
2. Add warning badges and strike-through styles to [`site.css`](file:///home/theodor/Документы/itmo-m3102/site.css).
3. Verify classic test suite: `npm test` in root.

### Phase 5: CI/CD & Verification
1. Add `.github/workflows/sync-timetable.yml`.
2. Add `npm run sync:schedule` script in [`app/package.json`](file:///home/theodor/Документы/itmo-m3102/app/package.json).
3. Run Playwright E2E tests: `npm run test:e2e`.
4. Verify calendar output: `npm run ics`.

---

## 9. Verification & Acceptance Criteria

1. **Elective Isolation:** No English or Sport lessons appear in the generated `schedule.json` or group timetable under any circumstances.
2. **Cancellation Integrity:** When an active lesson is cancelled in My ITMO, it renders with strikethrough styling and a `[Отменено]` danger badge on both the main page and lesson popover.
3. **Room Move Integrity:** When an auditorium changes, the badge `[Ауд. XXXX]` appears, accompanied by a note indicating the previous classroom (`вместо YYYY`).
4. **Offline Compatibility:** If My ITMO is unreachable or network drops, cached/stored `data/schedule.json` loads seamlessly without errors or blank screens.
5. **Campus City Label:** The main page header renders `" · Санкт-Петербург"` instead of `" · Москва"`.
6. **No Regressions:** All existing tests in `app/` (`npm test`, `npm run build`) and root (`node --test tests/schedule.mjs`) pass with 0 failures.
