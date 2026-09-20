# Setjeka ERP — Technical Documentation

This document explains **what has been built, and why**, plus every third-party
service this app talks to. It complements `MEMORY.md` (which is a running
decisions log) with a point-in-time technical reference. Update the relevant
section whenever a feature described here changes.

---

## 1. Architecture

```
setjeka-erp/
  frontend/            Next.js 16 (App Router), Tailwind CSS v4
  backend/             NestJS + Prisma 7 + PostgreSQL
  converter-service/   Standalone Python/FastAPI microservice (BIM/CAD/PDF takeoff)
```

Three independent processes in dev: frontend (`:3000`), backend (`:4000`),
converter-service (`:8100`). The frontend only ever talks to the NestJS
backend; the backend is the only caller of the converter service (not built
yet — see §4).

---

## 2. Backend (NestJS)

### 2.1 Authentication

**What:** JWT access tokens (15 min) + refresh tokens, issued at
`POST /api/auth/login`. No `@nestjs/passport` — auth is a hand-written
`JwtAccessGuard` (`CanActivate`) that reads the `Authorization: Bearer` header
and verifies it with `@nestjs/jwt`.

**Why not Passport:** `@nestjs/passport`'s dynamic module wiring (`AuthGuard()`
mixin → `AuthModuleOptions` provider) hit a DI resolution error in this
Nest 12 + ESM setup — the guard couldn't resolve its dependency when used
outside the module that registered `PassportModule`. Rather than fight the
DI graph, the guard was rewritten as a plain class with two constructor
dependencies (`JwtService`, `ConfigService`), both made global via
`JwtModule.register({ global: true })` and `ConfigModule.forRoot({ isGlobal: true })`.
Fewer moving parts, identical behavior, no framework-internal DI edge case.

**Remember me:** `POST /auth/login` accepts an optional `rememberMe: boolean`.
- `true` → refresh token TTL = `JWT_REFRESH_TTL_REMEMBER` (14 days, env-configurable), frontend stores tokens in `localStorage`.
- `false`/omitted → refresh token TTL = `JWT_REFRESH_TTL` (1 day), frontend stores tokens in `sessionStorage` (cleared when the tab closes).

Both are enforced server-side (the JWT itself expires), not just client-side —
the frontend's storage choice is a UX/persistence layer on top of a TTL the
server already controls.

**Forgot / reset password:** fully built except the email itself.
- `POST /auth/forgot-password` — looks up the user; if found, generates a
  random 32-byte token, stores its **SHA-256 hash** (not the raw token) plus
  a 1-hour expiry on the `User` row, and logs the reset link via Nest's
  `Logger` (`AuthService`). Always returns the same generic
  `{"message": "If that email exists, a reset link has been sent."}`
  regardless of whether the email matched, to prevent account enumeration.
- `POST /auth/reset-password` — hashes the submitted token, looks up a user
  whose stored hash matches AND whose expiry hasn't passed, updates the
  password, and clears the token fields (single-use).
- **Why log instead of email:** no email provider is wired up yet (Resend is
  the planned choice). Logging the link is a deliberate, temporary stand-in
  that keeps the rest of the flow (token generation, expiry, single-use,
  UI) fully real and testable today; only the delivery mechanism is a stub.

### 2.2 Projects module — Project Management foundations

This module is being built directly against Setjeka's own **Feature and
Functional Requirements Register** (115 requirements, confirmed across 3
client meetings) — specifically the "PRJ / Project Management" rows (R13–R19),
since project management is core to what Setjeka does. What's built so far
covers the foundation rows: R13 (project creation, enriched), R14 (team
directory), R15 (project hierarchy), R17 (milestone/stage tracking).

**`Project` model fields:**

| Field | What | Requirement |
|---|---|---|
| `name`, `status` | Existing | — |
| `stage` | Setjeka's own 7-stage delivery standard — see below | R17 |
| `projectType` | `NEW_BUILD` / `REFURBISHMENT` / `REDEVELOPMENT` / `RENEWAL` / `ADDITION` | R13, Meeting 3 §6 |
| `contractForm` | `FIDIC` / `JBCC` / `GCC` / `NEC` / `OTHER` — drives role titles (FIDIC calls the PM a "Project Engineer") | R13, Meeting 002 §2.6 |
| `client`, `developer`, `location`, `value`, `startDate`, `endDate` | Free-text/numeric project record fields | R13 |
| `latitude`, `longitude` | Unchanged from before — dashboard map/weather | — |
| `projectCode` | Unique, auto-generated `PRJ-<year>-NNNN` (per-year sequence) unless overridden; previewed via `GET /api/projects/next-code`, which does **not** reserve the sequence number | R13 |
| `description` | Free-text project summary, shown on the Overview card and the detail page | R13 |
| `currency` | `USD` / `ZAR`, default `ZAR` | Ported trim from OpenConstructionERP |
| `classificationStandard` | `ASAQS` / `NRM`, default `ASAQS` | Ported trim from OpenConstructionERP |
| `contingencyPct` | Percentage, default `25` — the create form shows a live-computed contingency amount (`value * pct/100`) in the project's currency | Ported trim from OpenConstructionERP |

**Why the stage model was corrected:** the header's stage badge (built in a
previous session) used generic external PROCSA-2015 numbering (Stage 1
Inception … Stage 6 Close Out) — an assumption, not something checked
against what Setjeka actually agreed. Reviewing the requirements register
(R17) and the 3rd meeting's transcript surfaced the real, verbatim standard:
**Initiation → Inception → Concept → Design → Documentation & Procurement →
Construction → Closeout** (7 stages, 0-indexed). The Prisma enum was renamed
from `ProcsaStage` to `ProjectStage` and every label corrected to match. New
projects default to `INITIATION` (Stage 0).

**Project hierarchy (`ProjectNode`, R15):** `project → phase → building →
floor → zone → work package`, modelled as a flexible self-referencing tree
(`parentId`) rather than fixed levels — a project with no "buildings" isn't
forced through empty levels. `activity` (the level below work package) is
deliberately excluded: it belongs to the Schedule module, not built here yet.
`GET/POST /api/projects/:id/nodes`, `PATCH/DELETE /api/projects/:id/nodes/:nodeId`.

**Team directory (`ProjectMember`, R14):** each row is either a linked
platform `User` (Setjeka staff) or a lightweight external contact (name,
company, email, phone) — there's no vendor/consultant master-data module yet
(that's requirement PROC/R38, a separate future module), so external parties
are captured inline rather than blocked on that. A member always has a role
drawn from the same list as the requirements register's User Roles sheet
(Development Manager, Project Manager, Planner/Scheduler, Quantity Surveyor,
Procurement Manager, Architect/Engineer, Site Manager, QA/QC Manager, HSE
Manager, Contractor, Client, Other). `GET/POST /api/projects/:id/members`,
`PATCH/DELETE /api/projects/:id/members/:memberId`. **Not yet built:** a
picker for assigning existing Setjeka staff — there's no "list all users"
endpoint yet, so today every member is added as an external contact even
when they're actually internal.

**Project detail page (`/projects/[id]`):** new — the app's first per-project
workspace page. Shows/edits the full project record, the structure tree, and
the team directory. Visiting it also sets that project as the header's
"current project" (§3.1's switcher/stage badge), so there's no duplicate
stage-editing UI between the page and the header.

**Why coordinates:** added specifically to drive two dashboard widgets (site
map, site weather — see §3.2) with real data instead of fabricated numbers.
Optional, since not every project has a known site yet.

**Projects Overview (`/projects`) and create form (`/projects/new`):** the
sidebar's "Projects" entry is now a collapsible group containing a single
"Overview" item — a responsive card grid, one card per project, matching
OpenConstructionERP's card layout (non-interactive Leaflet/OSM map thumbnail
with a location-pin overlay bar when coordinates exist, colored initial
avatar, name, 2-line-clamped description, currency/stage tag chips, a
"Total value" stat block, relative-updated footer) but scoped to fields that
actually exist here. **Deliberately not ported to the card:** MasterFormat
classification tag, BOQ count, PDF-export badge, "On map" toggle — those
modules (classification taxonomy, BOQ, document export, map-visibility
preference) don't exist in this repo. The create form is a single trimmed
form (`Basics` / `Classification & currency` / `Location` / `Budget`
sections), not OpenConstructionERP's full multi-step wizard with
role-of-development presets and module-applicability scoring — it ports
only the fields that survived that repo's own earlier trimming pass:
currency, classification standard, auto-generated project code (editable),
and contingency % with a live preview. The `/projects/[id]` detail page's
view and edit modes were extended to cover every field the create form
collects (description, currency, classification standard, contingency %),
so the create → view → edit round-trip has no gaps.

**Client/owner dropdown tied to Opportunities** is still not ported —
deferred until the Opportunities module exists here (see `MEMORY.md`).

**What the requirements register says is still ahead for Project Management**
(not built yet, listed here so scope isn't lost): R16 task management, R18
the project "control tower" dashboard (progress/schedule/cost/documents/
risk/quality/procurement/approvals in one view), R19 issue register. Plus
the cross-cutting decisions from the meetings that will shape those: RFIs
route through Setjeka in both directions (never contractor↔client directly);
"messaging" means leave-a-note-and-assign-as-action, never chat; risk
register's primary users are PM/Client/QS; client-portal approvals are
restricted solely to the client as a hard rule (Setjeka can never approve on
the client's behalf).

### 2.3 Contractors module — Organisation/Party registration

Setjeka is purely a project manager — it never performs delivery work
itself, so every project's team is inherently made up of external
contractors, consultants, suppliers and other organisations. This module
covers the requirements register's **PROC / Procurement & Vendors →
"Vendor/Contractors Master"** row plus a much larger client-supplied spec
("Contractor/Consultant/Supplier/Vendor Registration module") that was
deliberately scoped down: a codebase audit found this app has no RBAC
enforcement, no file/document storage, no notification system, and no
generic audit log, so the parts of that spec which assumed that
infrastructure exists were not built (see the deferred table below) — only
the reusable-organisation architecture the spec itself frames as most
important (§29 of that spec: never hardcode one role/type per organisation)
was.

**`Contractor` model** (the organisation/party record): `name` (unique),
`tradingName`, `registrationNumber`, `taxVatNumber`, `country`,
`stateProvince`, `city`, `yearEstablished`, `website`, `classifications`
(enum array — Contractor/Consultant/Supplier/Subcontractor/ServiceProvider/
Manufacturer/SpecialistContractor/Other; an organisation can be several at
once), `disciplines` (free text list — not a fixed enum, since the source
spec itself says these catalogs should be configurable and the client
hasn't confirmed one; same reasoning as the PROCSA-stage correction in
§2.2), `tradeType`/`contactName`/`email`/`phone`/`address`/`notes`,
`registrationStatus` (Draft/Submitted/UnderReview/MoreInfoRequired/
Approved/Rejected/Suspended/Archived) and `prequalificationStatus`
(NotAssessed/Submitted/UnderReview/Prequalified/
ConditionallyPrequalified/Rejected/Suspended) — **two independent fields**,
since an org can be a fully approved vendor while still unassessed for
prequalification on a given scope. Global list, not scoped per project
owner — Setjeka's own shared directory.

**Related models**, each with its own nested CRUD sub-routes:

| Model | Purpose | Routes |
|---|---|---|
| `OrganisationContact` | Multiple named contacts per org, with `isPrimary`/`canReceiveRfqs`/`canReceiveCorrespondence`/`canReceivePaymentNotifications` flags | `/api/contractors/:id/contacts` |
| `ComplianceRecord` | Covers both compliance documents (insurance, licences, HSE certs) and professional registrations — same shape, one model. `verificationStatus` (Pending/Submitted/Verified/Rejected) is stored; a `computedStatus` (Valid/ExpiringSoon [30-day window]/Expired/PendingVerification) is **derived at read time from `expiryDate`**, never stored. Supports a real file attachment (see below) | `/api/contractors/:id/compliance`, `/api/contractors/:id/compliance/:recordId/document` |
| `OrganisationProjectAppointment` | The architecture fix the spec calls out explicitly: role, contract value/dates/scope live on a per-project appointment, **never on the organisation itself** — so the same contractor can be Main Contractor on one project and Subcontractor on another | `/api/contractors/:id/appointments` |
| `OrganisationStatusHistory` | Audit trail scoped to just this entity's status changes (not an app-wide log, which doesn't exist) | Written automatically by `PATCH /api/contractors/:id/status` |

**Duplicate detection:** `GET /api/contractors/check-duplicate?name=&registrationNumber=&taxVatNumber=`
returns any matches (case-insensitive name, exact reg/tax numbers); the
frontend shows a warning but never blocks creation, per spec.

**A real bug found during this build:** creating a contractor whose `name`
collided with an existing one threw an unhandled `500` (nothing caught
Prisma's `P2002` unique-constraint error) instead of a friendly message.
Fixed by mapping `P2002` to a `409 ConflictException` in both `create` and
`update`. This mattered specifically because duplicate detection is a
*warning*, not a block — a user proceeding past the warning was always a
real path to this collision, not just a test artifact.

**`/contractors` page:** list with search, a registration-status filter,
and classification toggle-chips, under the "Procurement" sidebar group.
**`/contractors/new`:** a single focused create step (not a multi-step
wizard) that posts immediately (status defaults to Draft) and redirects to
the detail page — mirrors `projects/new` → `projects/[id]` exactly.
**`/contractors/[id]`:** the app's first tabbed workspace page
(`components/ui/Tabs.tsx` — plain buttons, no dependency added), with
Overview (edit basics/classification/disciplines, the two status fields
plus a "Change status" action and its history), Contacts, Compliance (with
a "Required: X · Uploaded: Y · Verified: Z" counter computed against a
small static per-classification required-document list, plus per-record
upload/replace/remove/view), Project Associations, and Financial tabs.

**Document upload (added after user request, superseding the original
"link-only placeholder" plan):** `POST /api/contractors/:id/compliance/:recordId/document`
(multer `diskStorage`, field name `file`) stores to `UPLOAD_DIR`
(`backend/uploads/vendor-documents/` by default, gitignored) under a
generated UUID filename — the original filename, mime type and size are
kept on the record (`attachmentFilename`/`attachmentMimeType`/
`attachmentSize`); a 20MB limit and an extension allowlist (pdf, jpg/jpeg/
png, doc/docx, xls/xlsx) are enforced server-side via multer's `limits` and
a custom `fileFilter`. `GET .../document` streams the file back
(`Content-Disposition: inline`) behind the same `JwtAccessGuard` as
everything else — not a public static path, so the frontend can't use a
plain `<a href>` and instead fetches the bytes as a blob
(`apiFetchBlobUrl` in `lib/api-client.ts`) and opens an object URL.
`DELETE .../document` detaches just the file, keeping the record. A
`sharePointUrl` column exists on the model but is **not populated by
anything yet** — SharePoint sync needs an Azure AD app registration
(tenant/client id+secret, target site+drive) the user hasn't supplied.

**Financial tab (added after user request, reversing the original
deferral):** bank name/account name/account number, preferred payment
method, payment terms, credit terms, and withholding-tax info live directly
on `Contractor` (a single profile per organisation, not a list) and are
editable via the normal `PATCH /api/contractors/:id`. The tab renders a
visible on-page warning that this app still has no RBAC, so — like every
other page — it's reachable by any signed-in user; the user chose to accept
that known gap rather than defer the feature further. The same tab also
lists **`PaymentRecord`s** ("Payments made") — amount, currency, date,
an optional link to a specific `OrganisationProjectAppointment`,
reference, method — via `/api/contractors/:id/payments`. Totals are
grouped and displayed **per currency**, never summed together.

**Ratings tab** (`/api/contractors/:id/ratings`, model
`OrganisationRating`): a star rating (1-5, `components/ui/StarRating.tsx`)
plus a comment, tied to a **specific `OrganisationProjectAppointment`**
(rating is about performance on one completed engagement, not the
organisation in the abstract) and a `raterType` of `INTERNAL` or `CLIENT`.
Shows a running average at the top (overall, and split by rater type).
**"Client" ratings are recorded by Setjeka staff on the client's behalf**
— there is no client-facing portal (no client user accounts/auth exist in
this app), so a true self-service client submission isn't built; the UI
says this explicitly rather than implying it. Deliberately not built: an
unauthenticated public rating endpoint, which would need real portal
infrastructure (client identity, rate limiting, engagement verification)
to be safe against spam/abuse.

**Deliberately still not built, and why:**

| Deferred | Why |
|---|---|
| SharePoint sync for compliance documents | Needs Azure AD app credentials the user hasn't provided yet — local disk storage covers the need in the meantime |
| RBAC permission catalog | No RBAC enforcement exists anywhere in the app to hook a permission check into — flagged as a known gap on the Financial tab rather than faked |
| Notifications | No notification system exists |
| Client-facing portal for self-service client ratings | Needs its own auth surface (client accounts, login) that doesn't exist yet — client ratings are recorded by staff on the client's behalf in the meantime |
| Project Experience, Equipment records | No consuming workflow yet (Tender/Prequalification, Resource Planning aren't built) |
| Deep Contractor/Consultant/Supplier-specific sub-profiles (grade/capacity, staff counts, MOQ/lead time) | V1 ships the shared core architecture; type-specific fields are a natural follow-up once something consumes them |

**Team panel integration (`ProjectMembersPanel`):** the "add team member"
form leads with a contractor picker (now showing classification alongside
name) sourced from `GET /api/contractors` instead of a bare "Company" text
field. Picking a contractor sets `ProjectMember.contractorId`; the existing
`externalName` field is reused to mean "the specific contact person at that
contractor for this project" (optional). A "— One-off contact —" option
keeps the fully manual entry path for externals not worth adding to the
master list.

**New shared UI primitives added for this module:** `components/ui/Tabs.tsx`
(segmented control), `components/ui/ToggleChips.tsx` (multi-select chips —
used for classification selection and filtering), `components/ui/TagInput.tsx`
(free-text multi-value input with datalist suggestions — used for
disciplines).

---

### 2.4 Schedule module — Gantt/Calendar/Card/Grid programme management

Covers the requirements register's SCH / Planning & Scheduling section,
confirmed in full for the first release by Meeting 002 decision 2.1
(critical path, schedule variance, resource planning) alongside decision
2.3's MS Project import requirement ("the platform must ... calculate the
critical path itself ... full MS Project capability, not a summary view").
Decision 2.2 explicitly **removed** 4D/BIM-linked schedule simulation from
scope even though the register still lists it — the meeting decision
overrides the stale register row, the same lesson as the PROCSA
stage-naming correction in §2.2 above.

**`ScheduleActivity` model:** a self-referencing tree (`parentId`, same
pattern as `ProjectNode.parentId`) for the WBS outline, plus optional links
to `ProjectNode` (which phase/building/floor/zone) and `Contractor`/
`ProjectMember` (who's executing it) — confirmed against a real client
progress report (`Project Solar_Progress Report 03 August 2026.pptx`)
which shows activities grouped by floor with parallel per-contractor
forecast/actual date columns. `activityType` is `TASK` or `MILESTONE`
(a milestone is a zero-duration activity, matching MS Project/Smartsheet
convention — not a separate model). `earlyStart`/`earlyFinish`/`lateStart`/
`lateFinish`/`totalFloatDays`/`isCriticalPath` are computed by the CPM
engine and **cached** on the row, recalculated and rewritten on every
activity/dependency write via `ScheduleService.recalculate()` — not derived
live on every read, since a project can have hundreds of activities.
`ScheduleDependency` (FS/SS/FF/SF + `lagDays`, unique on
predecessor+successor) and `ScheduleBaseline`/`ScheduleBaselineSnapshot`
(a copy-on-save row per activity at the moment a baseline is taken, so
later edits never disturb the comparison) round out the model.

**CPM engine (`schedule-cpm.util.ts`), two design decisions worth
recording:**

- **Working-day (Mon-Fri) calendar only.** No holiday/non-working-day
  exception data exists anywhere in this app yet, so a fixed 5-day week is
  the CPM default for V1 — deliberately simple rather than fabricating a
  holiday calendar the client never supplied.
- **Inclusive duration convention** (matches MS Project/construction
  norms): a duration-5 task starting Monday finishes that same Friday, not
  the following Monday. This required two distinct helper functions —
  `addWorkingDays` (a pure offset, used for dependency lag) and
  `endDateFromStart`/`startDateFromEnd` (an inclusive duration span) — and,
  critically, an **implicit +1 working day gap on Finish-to-Start
  dependencies specifically**: under the inclusive convention the
  predecessor's finish day is still occupied by it, so its successor can't
  start until the next working day even at zero explicit lag. Getting this
  wrong the first time produced an off-by-one (a 5-day task starting Monday
  landing on the *following* Monday instead of that Friday) caught by
  hand-tracing a worked example before shipping. Hand-verified end to end
  via curl against a small FS/SS chain with known-by-hand dates, float and
  critical-path flags — every value matched exactly, including the
  edge case of two *independent* activities (no dependency between them)
  where the shorter one still shows positive float against the longer one's
  finish date, since with no explicit dependency edge each activity's late
  finish defaults to the overall project end.
- Cycle detection is a separate, cheap `assertAcyclic()` (Kahn's algorithm,
  cycle-check only) split out from the full date-math `computeSchedule()`,
  used both by `createDependency` (validated before persisting) and by the
  MS Project importer (validated against the **entire** candidate
  dependency set before any bulk insert — a partial-insert-then-crash on a
  cyclic source file was a real bug caught before shipping; a cyclic import
  now skips all of that file's dependencies and reports the count honestly
  rather than partially applying them).

**MS Project XML import** (`msproject-xml.util.ts` +
`schedule-import.service.ts`): parses the documented MS Project "Project
XML" interchange format (stable since Project 2003, `File > Save As >
XML`) — **not** the binary `.mpp` format (proprietary, no public spec) and
**not** Primavera P6's `.xer`, since which format the client's files
actually use was an open, unconfirmed question as of Meeting 002 action
6.5 ("Confirm whether MS Project files originate from MS Project or
Primavera P6"). Reads only core scheduling fields (dates, duration,
`OutlineLevel` hierarchy, `PredecessorLink` dependencies, milestone flag,
percent complete) — resource/assignment/cost fields in the file are
ignored, matching decision 2.4's boundary that Setjeka is not a system of
record for cost. The platform always recalculates critical path itself
after import rather than trusting anything the file claims, per decision
2.3. **A real bug found and fixed during this build:** MS Project XML
timestamps carry no timezone offset (e.g. `2026-02-02T08:00:00`), so a
plain `new Date(...)` parses them as the *server's* local time — on a
server in a different timezone than whoever produced the file, that could
silently shift the parsed value into the adjacent UTC day and corrupt the
working-day calendar. Fixed by taking only the date portion and anchoring
it at UTC midnight, the same convention every other date in this app
already uses.

**Frontend (`/projects/[id]/schedule`, `components/schedule/`):** one
shared `useScheduleData` hook feeds all four views (Grid, Gantt, Calendar,
Card) from the same flat activity+dependency payload — no server-side
view-specific endpoint — and one shared `ActivityDetailPanel` slide-over
handles every create/edit/delete plus predecessor management, so editing
stays consistent no matter which view it's opened from. Grid is the
default/primary editable table (WBS-indented, reusing `ProjectNodeTree`'s
buildTree-by-`parentId` technique); Gantt is a from-scratch SVG/CSS bar
chart (no charting library) with elbow-routed dependency arrows and
critical-path bars in red; Calendar is a plain month grid; Card is a
Kanban board grouped by status. A `Schedule` nav entry under the Projects
sidebar group, and a direct button on `/projects/[id]`, both resolve to
`/projects/<currentProjectId>/schedule` via `useCurrentProject()`.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| 4D/BIM-linked schedule simulation | Explicitly removed from scope, Meeting 002 decision 2.2 |
| Primavera P6 (`.xer`) import | Open, unconfirmed client question (action 6.5) — building for an unconfirmed format would be guessing |
| Cost/budget fields on activities | Decision 2.4: QS retains its own cost systems, platform is not the system of record for cost |
| A dedicated Equipment resource pool | No consuming workflow beyond this module yet; V1 covers people (`ProjectMember`) and companies (`Contractor`), matching what the real progress-report example shows being tracked |
| Drag-to-resize/reschedule directly on Gantt bars | V1 Gantt is read + click-to-open-editor, all edits go through the one shared `ActivityDetailPanel` |
| Baseline vs. current variance overlay/display | Save/list/delete baseline is built and backend-verified (snapshots every activity's current dates); the Gantt ghost-bar comparison and a variance report view are not built yet |
| Client-portal / external visibility, RBAC-gated schedule sharing | No client portal or RBAC exists anywhere in this app (same gap as Financial/Ratings) — the data model is built so a portal can be added later without a schema change |
| Holiday/non-working-day calendars beyond a Mon-Fri week | No calendar-exception data exists yet |

---

### 2.5 Project collaboration — Tasks, Issues, Comments, Notifications, Control Tower Dashboard

Closes the requirements register's PRJ / Project Management gaps: R16 (task
management), R18 (project control tower) and R19 (issue register) — R13-R15
(project creation, team directory, hierarchy) were already covered by
`Project`/`ProjectMember`/`ProjectNode`. Grounded in PROCSA via the existing
`ProjectMemberRole` enum (no new role modelling needed) and in a pattern
found in the original OpenConstructionERP codebase this app replaces: a
polymorphic `Comment` keyed by `entityType`/`entityId`, used there across
Tasks/RFIs/Documents/Punch-items so any record can carry a discussion
thread. Adopted here as the connective tissue for cross-team collaboration
— replacing side-channel email/WhatsApp with in-context discussion — and
paired with a notification pipeline that finally gives the `Bell` icon in
`Header.tsx` (a dead placeholder all session) real behaviour.

**Models:** `ProjectTask` (title, description, priority — reuses
`SchedulePriority`, status, dueDate, `assignedToId` → `ProjectMember`,
optional `scheduleActivityId`/`projectNodeId` for context, `checklist` as
plain JSON rather than a child table). `ProjectIssue` (same shape, plus
`impact` as free text — no fixed taxonomy was specified anywhere in the
register, so none was invented — and `resolutionNotes`). `Comment` (flat,
no threading in V1; `entityType` ∈ `TASK`/`ISSUE`/`SCHEDULE_ACTIVITY` +
`entityId` with no FK, since one column can't reference three different
tables — validated in the service layer instead, one branch per
`entityType`, the same trade-off `ScheduleActivity.projectNodeId` already
accepts). `Notification` (`type` ∈ `TASK_ASSIGNED`/`ISSUE_ASSIGNED`/
`MENTIONED`/`DUE_SOON`).

**Notifications are created synchronously**, not via a queue — no
scheduler or job runner exists anywhere in this app. Assignment
notifications fire from `ProjectTasksService`/`ProjectIssuesService` on
create/reassign; `@mentions` are a plain substring match of `@Full Name`
against the project's `ProjectMember`s (joined to `User`) when a comment
is posted — simpler and more predictable than a name-fragment regex.
`DUE_SOON` is the one exception: computed **opportunistically** when
`GET /notifications` is called (cross-checking the user's assigned tasks/
issues due within 2 days), not by a background job, since none exists —
an honest approximation rather than a fabricated scheduler.

**Verified end-to-end via curl**, since `ProjectMember.userId` (linking a
member to a real platform login) has no picker in the UI yet — see
`MEMORY.md` — but the backend already accepts it: created a second real
`User` row directly, linked it as a `ProjectMember`, assigned a task and
an issue to that member, and posted a comment mentioning them, confirming
all three notification types land correctly (`TASK_ASSIGNED`,
`ISSUE_ASSIGNED`, `MENTIONED`), then verified `GET /projects/:id/dashboard`
against the same hand-built project matches its known task/issue/
comment counts exactly.

**Project Control Tower Dashboard (R18):** `/projects/[id]` is now a
tabbed workspace (`components/ui/Tabs.tsx`, the same pattern proven on
`/contractors/[id]`) — Overview (the existing editable-details card plus
`ProjectOverviewDashboard`, a single `GET /projects/:id/dashboard`
aggregate: schedule progress + critical-path count from the existing
cached CPM fields, task/issue counts by status, a compliance snapshot
across the project's contractors reusing `computeComplianceStatus`
un-duplicated, ratings average, 5 most recent comments), Tasks, Issues,
Team (unchanged `ProjectMembersPanel`), Structure (unchanged
`ProjectNodeTree`). Schedule stays its own full page, linked from
Overview rather than duplicated.

`CommentThread` (`components/project/CommentThread.tsx`) is one component
reused verbatim in three places: `ProjectTasksPanel`, `ProjectIssuesPanel`,
and retrofitted into the Schedule module's `ActivityDetailPanel` — this is
what actually delivers "syncs and collaborates seamlessly with other
modules" for Schedule specifically, by giving activities the same
discussion surface as everything else.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| RFI, Submittals, Risk Register, Document Control, Client Portal | Each is its own module in the requirements register (RFI/SUB/RISK/DOC/CLI codes), not part of PRJ — genuinely valuable (a dedicated research pass into OpenConstructionERP found each of these fairly mature there) but a separate undertaking |
| Comment threading / replies | A flat comment list covers the collaboration ask; threading is a natural, separable follow-up |
| Real email/SMS/push notifications | No provider is configured anywhere in this app — in-app only |
| RBAC-gated visibility on tasks/issues/comments | No RBAC exists anywhere in this app — standing gap, same as every other module |
| Real-time (websocket) updates | No realtime infra exists; the notification bell polls every 60s instead |
| A fixed "impact" taxonomy on Issues | Register doesn't specify one; free text avoids inventing an unconfirmed classification |

---

### 2.6 Document Control — repository, revisions, review, transmittals

Closes the requirements register's DOC section (9 rows: Repository,
Register, Revision, Transmittals, Workflow, Collaboration/markup,
Comparison, Search, Audit). Picked as the next per-project submodule
after a user-requested review of what else the register/PROCSA/
OpenConstructionERP imply belongs under "Projects" — chosen first because
it's the module RFI, Submittals and QHSE defects will all eventually
reference a drawing or document through. No meeting decision narrows this
one's scope (unlike Schedule's 4D removal or Commercial Management's
cost-system-of-record boundary), so V1 follows the register closely,
trimmed only where this app's already-documented infrastructure gaps
apply.

**Models:** `DocumentFolder` (self-referencing tree, identical shape to
`ProjectNode`) → `ProjectDocument` (name, `documentType`/`discipline` as
free text — same reasoning as `Contractor.disciplines` — optional links to
a `ProjectNode`/`ScheduleActivity` for context) → `DocumentRevision`
(immutable; a new upload always adds a row, never overwrites or deletes a
prior one; **"current" is never stored** — it's computed at read time as
the most-recently-uploaded revision, the same convention Schedule's
SUMMARY-row logic already uses, so it can't drift from what's actually on
disk). `DocumentAccessLog` (view/download audit, scoped to just this
entity — the same trade-off `OrganisationStatusHistory` already makes,
not an app-wide log, which doesn't exist). `Transmittal` +
`TransmittalRecipient` + `TransmittalItem` (a simple issue-and-list
record, not a tracked receipt/acknowledgement workflow — the register
asks for "issue, receive and track," and a status field covers that).

**Review workflow reuses the existing polymorphic `Comment`** model
(built for Tasks/Issues/Schedule) rather than a separate reviewer-comment
field — `CommentEntityType` gained a fourth value, `DOCUMENT_REVISION`.
This is the same "connective tissue" pattern extended once more: a
reviewer's Approve/Reject/Request-revision decision is a status field on
the revision, but their *reasoning* is a normal comment, discoverable the
same way as everywhere else in the app.

**File storage reuses `compliance-records/upload.util.ts`'s exact
pattern** (multer `diskStorage` + `fileFilter` + `generateStoredName`) in
a new `project-documents/upload.util.ts`, its own `DOCUMENT_UPLOAD_DIR`
directory, with the allowed-extension list extended to include
`.dwg`/`.dxf` (drawings) alongside the existing office-document set —
neither is previewable in-browser (no CAD rendering library here), so
they fall back to `DocumentPreviewModal`'s existing "Download to view"
path, same as Word/Excel already do for Compliance documents. The
existing `POST .../document` → `GET .../document` (stream) →
`DELETE .../document` shape from Compliance carries over almost exactly,
with one addition: every `GET .../revisions/:id/file` call writes a
`DocumentAccessLog` row (`VIEWED` for an inline request, `DOWNLOADED`
when `?download=1` is passed).

**Comparison is side-by-side, not overlay**: `RevisionCompareModal.tsx`
opens two small preview panes (reusing the same image/PDF/fallback logic
`DocumentPreviewModal` already has, just duplicated per-pane rather than
literally rendering two full-screen `DocumentPreviewModal`s, which would
visually collide) plus each revision's metadata. True pixel/vector
overlay diffing needs a rendering + diffing library this app doesn't
have — side-by-side is the honest V1.

**Frontend:** `DocumentsPanel.tsx` (list + type filter chips + a
client-side CSV export — the register's other "export" asks have all
been handled the same way), `DocumentDetailPanel.tsx` (metadata edit,
revision history with per-revision view/download/review actions, upload
new revision, embedded `CommentThread`), `TransmittalsPanel.tsx`. Both
live under a new **Documents** tab in `/projects/[id]`'s workspace
(`Overview/Tasks/Issues/Documents/Team/Structure`).

**Verified end-to-end via curl**: created a document with an initial
revision, uploaded a second revision and confirmed the first's
`storedFilename` was untouched while `revisions[0]` (current) correctly
became the second; approved the current revision and posted a comment
against `entityType: 'DOCUMENT_REVISION'`; viewed then downloaded the
revision and confirmed exactly one `VIEWED` and one `DOWNLOADED`
`DocumentAccessLog` row landed; created and issued a transmittal
referencing the approved revision. All test data (including the two
uploaded files on disk, which a cascading project delete does **not**
clean up — a pre-existing limitation shared with Compliance documents)
was removed manually afterward.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| Freehand markup/redlining (canvas drawing over a drawing/PDF) | A full annotation engine is its own multi-day feature; discussion happens via the existing Comment thread on a revision instead |
| True visual diff/overlay comparison | Needs a PDF/image rendering + diffing library this app doesn't have; side-by-side metadata + preview covers the ask honestly |
| Cross-entity global search expansion (documents/RFIs/submittals/tasks in one search box) | The existing `SearchPalette` is project-name-scoped only (a pre-existing limit) — a Documents-tab-local filter is built instead |
| Folder/document RBAC permissions | No RBAC exists anywhere in this app — standing gap; every document is visible to any authenticated user like everything else |
| SharePoint/external storage | Local disk only, consistent with Compliance document storage — still blocked on Azure AD credentials the user hasn't provided |
| Transmittal receipt/acknowledgement tracking | Register asks for "issue, receive and track"; V1 tracks issue + a status field, not a full read-receipt workflow |
| Automatic on-disk file cleanup when a document/project is deleted | Database rows cascade correctly; the underlying files on disk don't — same pre-existing gap as Compliance document attachments |

---

### 2.7 Risk Register

Closes the requirements register's RISK section (3 rows: register,
escalation, dashboard) — the third per-project submodule from the
user-directed review, picked because it's structurally almost identical
to `ProjectIssue`: an owner, a free-text category, a status lifecycle,
reusing the `Comment`/`Notification` pipelines already built rather than
inventing anything new.

**`ProjectRisk`**: `probability`/`impact` (1-5 each, the standard 5×5
matrix convention). **Score is never stored** — computed at read time as
`probability × impact`, the same convention as Schedule's SUMMARY rows
and Document Control's "current revision," so it can't drift if either
input is edited later. `category` is free text (same reasoning as
`ProjectDocument.documentType`/`discipline`).

**Escalation** uses a fixed, documented severity threshold
(`HIGH_SEVERITY_THRESHOLD = 15` of a possible 25, in
`project-risks.service.ts`) rather than the register's "configurable"
ask — no configuration surface exists anywhere in this app for any
business rule yet, so a constant is the honest V1. A risk crossing that
threshold on create/update fires a real `RISK_ESCALATED` notification to
its owner (same synchronous call as `TASK_ASSIGNED`/`ISSUE_ASSIGNED`).
"Overdue" (past `reviewDate`, not `CLOSED`) is computed **opportunistically**
in `NotificationsService.findAllForUser` — a third synthetic-entry query
alongside the existing due-task/due-issue ones, not a new mechanism.
`CommentEntityType` gained a fifth value, `RISK`.

**A real bug found and fixed while building this** (and immediately
checked against — and found in — the two modules it was copied from):
`ProjectTask`/`ProjectIssue`/`ProjectRisk`'s create/update handlers were
passing a raw date string (e.g. `"2026-09-17"`) straight through to
Prisma for a `DateTime` field instead of `new Date(...)`-parsing it
first. Prisma 7 rejects this with a `PrismaClientValidationError` (a
500), rather than silently coercing it. This had shipped unnoticed in
`ProjectTask.dueDate` and `ProjectIssue.dueDate` since the Project
Collaboration build, because no verification pass in that module
actually exercised a due date — the failure only surfaced once Risk
Register's own `reviewDate` field hit the identical code shape. Fixed in
all three services.

**Dashboard**: `ProjectDashboardService`'s aggregate gains a `risks`
field (counts by status, `highSeverityCount`) computed in JS from the
fetched rows rather than a `groupBy` — Prisma's `groupBy` can't express
"count where probability×impact ≥ threshold" without raw SQL, and this
app's scale doesn't need it. Surfaced as a sixth "High risks" stat card
on `ProjectOverviewDashboard`.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| Portfolio-wide risk dashboard (cross-project) | The register's own wording reaches beyond a single project; out of scope for "the project module," same reasoning as every other cross-project ask deferred this session |
| User-configurable escalation thresholds | No configuration surface exists anywhere in this app for any business rule yet — a fixed, documented constant is the honest V1 |
| A fixed risk category taxonomy | Register doesn't specify one; free text avoids inventing an unconfirmed classification |
| Risk heat-map / matrix visualization | Not asked for by the register's acceptance criteria (filtering + drill-down); a straightforward filterable list with a score badge covers the ask |

---

### 2.8 RFI + Submittals

Closes the requirements register's RFI (2 rows) and SUB (3 rows) sections
— the fourth and last per-project submodule from the user-directed
review. Grouped and built together because the register itself files
both under one category, **Technical Administration**, and structurally
they're a matched pair: document-review workflows routed between
contractor/consultant/client, both reusing patterns already built this
session (`DocumentRevisionStatus`'s review shape, `OrganisationStatusHistory`'s
per-entity audit log, the `Comment`/`Notification` pipelines).

**`Rfi`**: raised/assigned/**ball-in-court** (`ProjectMember`,
nullable), priority, status (`OPEN`/`ANSWERED`/`CLOSED`), due date, four
impact fields (`costImpactPotential`/`costImpactConfirmed`/
`scheduleImpactPotentialDays`/`scheduleImpactConfirmedDays` — plain
numbers, no currency handling, consistent with Meeting 002 decision 2.4's
"monitoring only, not the system of record for cost" boundary), and an
optional link to an existing `ProjectDocument` for "supporting documents"
rather than a second upload path. **`ballInCourtId` is not a register
ask** — it's a small, cheap addition (whose turn it is to act) found
genuinely useful in OpenConstructionERP's own RFI model during the
earlier research pass, brought in per the user's standing invitation to
surface what that research found worth reusing. It defaults to the
assignee on create, flips to the raiser on `PATCH .../respond`, and
follows a reassignment — each transition fires a real `RFI_BALL_IN_COURT`
notification.

**`Submittal`**: `status` is the one place in this whole session where a
category-like field is a **closed enum, not free text** — the register
explicitly names all six states (`SUBMITTED`/`UNDER_REVIEW`/`APPROVED`/
`APPROVED_WITH_COMMENTS`/`REVISE_AND_RESUBMIT`/`REJECTED`), unlike
`documentType`/`category` elsewhere where only example values were given.
**`SubmittalStatusHistory`** mirrors `OrganisationStatusHistory` exactly
(entity-scoped audit trail, written in the same `$transaction` alongside
the status update, the same pattern `ContractorsService.updateStatus`
already uses) — the register's Submittal row is the only one this session
that explicitly demands "status history is retained," so it's the only
one of Tasks/Issues/Risks/RFIs/Submittals that has one. Every status
change also fires `SUBMITTAL_STATUS_CHANGED` to the submitter.

**Overdue RFIs/Submittals** join the existing opportunistic
synthetic-notification check in `NotificationsService.findAllForUser` as
a fourth and fifth source — notified to whoever currently holds the ball
(RFI) or is the reviewer (Submittal), not a fixed assignee, since that's
whose turn it actually is.

**Dashboard**: two more stat cards ("Open RFIs," "Pending submittals");
the stat-card grid changed from a single 6-column row to a `2/3/4`
responsive layout (8 cards, two rows at desktop width) rather than
stretching wider.

One combined **RFIs & Submittals** tab in `/projects/[id]`, stacking
`RfisPanel` + `SubmittalsPanel` — the same layout precedent as the
Documents tab (`DocumentsPanel` + `TransmittalsPanel`), rather than two
more top-level tabs for what the register itself files under one
category.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| Direct file upload on RFIs/Submittals | "Supporting documents" links an existing `ProjectDocument` instead of a second upload/storage path — avoids duplicating Document Control |
| RFI/Submittal PDF export or formatted print view | Not asked for by either register row's acceptance criteria |
| Configurable/multi-step review workflows | The register asks for routing "through" parties and a status field, not a workflow engine; `reviewerId` + status covers the ask without inventing approval-chain infrastructure this app has nowhere else |
| RBAC-gated visibility (e.g. only the assigned party can respond) | No RBAC exists anywhere in this app — standing gap, same as every other module |
| Status history for RFIs | Only the register's Submittal row explicitly demands it — RFIs get the same honest scope as Tasks/Issues/Risks |

This closes the four-module sequence the user asked for after reviewing
what else belonged under "Projects" (Document Control → Risk Register →
RFI + Submittals). RFI/SUB/RISK/DOC are no longer open items in
`MEMORY.md`'s pending-work list — only the Client Portal (CLI) remains
as a deferred, cross-cutting item blocked on a real second auth surface.

---

### 2.9 Administration — users, RBAC, audit trail

Closes the standing gap flagged after every module above: until now,
`ProjectsService.findOneForOwner(id, ownerId)` gated every project-nested
service on "does `ownerId` equal `project.ownerId`" — no broader
visibility model, no user-management API (`UsersModule` had no
controller), and `User.role` was set at login but never enforced. Built
from the requirements register's PLT (Platform Administration) section,
OpenConstructionERP's `PortalAccessRule`/`Team`+`TeamMembership` research,
and three scoping answers the user gave explicitly: **internal staff see
every project, externals need a grant**; **real password accounts, with
invite links shared manually** (no email provider is connected); and —
the one place this session the user chose the larger, non-default
option — **the full role × project × module × record × action
permission matrix now**, not a coarser first version.

**Visibility**: `User` gains `accountType` (`INTERNAL`/`EXTERNAL`,
default `INTERNAL`) and `status` (`ACTIVE`/`SUSPENDED`/`DEACTIVATED`).
`ProjectsService.findOneForOwner`/`findAllForOwner` — the single
chokepoint every other service already calls — now means: `ADMIN` or
`accountType: INTERNAL` sees everything; everyone else needs a
`ProjectMember` row linked to their account. This was a one-file change;
every dependent service got correct new behavior for free. (The method
keeps its original name — renaming it would mean touching all ~20
call sites for a cosmetic gain.)

**User management**: a real `UsersController` (list/invite/update/
suspend/resend-invite) reuses `AuthService`'s existing password-reset
token machinery for invites — `generateResetLink(user)`, extracted from
`requestPasswordReset`, now backs both the "forgot password" flow and a
brand-new account's first set-password link. Invited accounts get an
unusable random password hash (never a guessable blank), and the
generated link is returned directly in the API response for the admin to
copy — consistent with "no email integration, share manually."
Extending "Add project member" (`ProjectMembersService.create`) with an
`inviteAsUser` flag creates or reuses that `User` inline, so granting an
external contact real login access happens from the same form that
already adds them as a contact.

**Permission engine**: `RolePermission` (the default matrix — one row
per `ProjectMemberRole` × `PermissionModule` × `PermissionAction`, seeded
with sensible defaults in `prisma/seed.ts`, admin-editable afterwards)
plus `MemberPermissionOverride` (a per-project-member, optionally
per-record, optionally time-boxed exception — the "record" and
external-sharing case the register's own wording asks for).
`PermissionsService.can()` is the engine: `ADMIN` bypasses; a caller with
no `ProjectMember` row on the project defaults to allow if internal
(preserves every existing internal workflow) or deny if external; a
record-specific override wins over a module-wide override, which wins
over the `RolePermission` default. `PermissionsGuard` +
`@RequirePermission(module, action)` enforce this on every route of
every project-nested controller (Schedule, Tasks, Issues, Risks,
Documents, Transmittals, RFIs, Submittals, Comments, Members, Nodes,
Dashboard) — GET → `VIEW`, POST → `CREATE`, PATCH/PUT → `EDIT`, DELETE →
`DELETE`, and the handful of approval-shaped routes (`rfis/:id/respond`,
`submittals/:id/status`, a document revision review) → `APPROVE`. The
shared Contractors/vendor directory (`contractors` and its five
sub-resources) isn't project-scoped, so it stays gated by a simpler
`InternalOnlyGuard` instead of the module/action matrix.

**Audit trail**: a generic `AuditLogEntry` model, written by
`AuditLogInterceptor` — registered once, globally, as a no-op on any
route without `@RequirePermission` metadata — whenever a mutating
(`POST`/`PATCH`/`DELETE`) permission-checked route succeeds. This is the
first true app-wide audit log in this codebase; the existing
entity-scoped ones (`OrganisationStatusHistory`, `SubmittalStatusHistory`,
`DocumentAccessLog`) are untouched and still serve their own narrower
purpose.

**Frontend**: a new admin-only `Administration` nav group (hidden unless
`role === 'ADMIN'`) with Users/Permissions/Audit Log tabs; the
permissions tab is a role × action grid scoped to one module at a time
via a dropdown (66 cells across all 11 modules at once was unusable in
one table). A "Share externally" action on a document grants one project
member view access to just that document, with an optional expiry — the
one concrete record-level override UI built now; the schema supports the
same pattern for any module, added later if a real need shows up for it.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| Multi-organization/portfolio management | Single-tenant reality today — no client ask for managing other companies' portfolios |
| Configurable workflow/approval-routing engine | The register's "workflow builder" row is a BPM-scale undertaking on its own, separate from permission enforcement |
| Real transactional email delivery | Per the user's own choice — links are generated and shared manually; a provider (Resend) is a clean follow-up once one is connected |
| Passwordless/magic-link auth | User chose real password accounts instead |
| Field-level permission masking | Register asks for record-level, not field-level |
| Record-level override UI for every module (tasks, risks, RFIs, …) | The engine/schema supports any module + record; Documents is the one built now — the clearest external-sharing case |
| Session/device management, 2FA | Not asked for; the existing JWT access/refresh model is untouched otherwise |

This closes the "no RBAC exists anywhere in this app" gap referenced by
every module built earlier this session, and is the real second auth
surface the Client Portal (CLI) item in `MEMORY.md` was blocked on —
external accounts with scoped, permissioned access now exist, though a
dedicated client-facing portal UI (vs. the same app shell) remains a
separate, still-deferred piece of work.

---

### 2.10 Stage-gate approval — project stage transitions

Walking through how a PM runs PROCSA Stage 1 (Inception) on the platform
surfaced a real gap: `Project.stage` was set at creation and then never
editable anywhere in the UI, and the one API route that could change it
(`PATCH /projects/:id`) accepted it as a bare field with zero gating — no
request, no sign-off, no record of who approved moving from one stage to
the next. This closes that gap with **one fixed workflow** (sequential
stage sign-off), not the register's configurable "workflow builder" —
that remains correctly out of scope; see §2.9's deferred table. It also
plugs directly into the Administration module's permission engine: who
can request a stage move and who can approve one is a normal role
permission, configurable from Administration → Permissions rather than
hardcoded.

**`StageTransition`**: a request to move a project from its current
stage to the *next* stage in the fixed sequence (Initiation→Inception→
Concept→Design→Documentation & Procurement→Construction→Closeout) — no
skipping stages, no going backward in this V1. Records `fromStage`/
`toStage`, `status` (`PENDING`/`APPROVED`/`REJECTED`), who requested it
and why, who decided it and why, and when — the same shape as the
existing `SubmittalStatusHistory`/`OrganisationStatusHistory` pattern,
applied to a request/decision instead of a plain log. Only one pending
transition per project at a time.

A new `PermissionModule` value, `STAGE_GATE`, governs `CREATE` (request)
and `APPROVE` (decide) the same way every other module already works —
seeded so internal delivery roles get both, `CLIENT` gets `APPROVE` only
(client sign-off), `CONTRACTOR`/`OTHER` get neither. **Closing the
existing hole**: `stage` was removed from `UpdateProjectDto` entirely —
once a project exists, its stage can only change through an approved
`StageTransition`, never a bare `PATCH` (verified: a `stage` field in a
`PATCH /projects/:id` body is now silently stripped by the global
`ValidationPipe`'s whitelist, not merely rejected).

On request, `StageTransitionsService.notifyApprovers` fans out a
`STAGE_TRANSITION_REQUESTED` notification to every `ProjectMember` whose
role currently passes `PermissionsService.can(..., 'STAGE_GATE',
'APPROVE')` — reusing the permission engine itself rather than a
separate "who approves" configuration, so it automatically follows
whatever the Administration matrix (or a per-member override) says. On
decision, the requester gets `STAGE_TRANSITION_DECIDED` either way.
Approval updates `Project.stage` atomically with the `StageTransition`
row in one `$transaction`, mirroring `SubmittalsService.changeStatus`'s
existing pattern exactly.

**Frontend**: a **Stage gate** card on the project's Overview tab —
current stage, a pending request with Approve/Reject if one exists, a
"Request advancement to `<next stage>`" action otherwise, and a
collapsible history list. No client-side permission-hiding, consistent
with every other panel in this app — a denial surfaces as the usual
error banner.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| Configurable approval routing by record type/discipline/value | Still the full "workflow builder" the register describes — correctly out of scope; this is one fixed workflow, not a designer for arbitrary ones |
| Skipping stages / moving backward | Not how a stage-gate review works in practice; easy to add to the same model later if a real correction need comes up |
| Multi-approver / quorum sign-off | Not asked for; single-decision approve/reject matches every other workflow-decision point already built (RFI respond, Submittal status) |
| A dedicated cross-project approvals inbox | The per-project Stage gate card plus the existing Notification bell covers it |

Verified end-to-end via curl (a CONTRACTOR is denied both requesting and
deciding; a PM requests Inception→Concept; a second concurrent request
is rejected; skipping a stage is rejected; the CLIENT — and only the
CLIENT — gets notified and can approve; `Project.stage` updates and the
requester is notified; the closed `PATCH` hole confirmed) and Playwright
(the PM requests an advancement, the client sees and approves it in a
separate session, the header's "Stage N · Label" and the Stage gate card
both update live — zero console errors either side).

---

### 2.11 Procurement — RFQ, Quotes, Evaluation, POs, Vendor Performance, Deliveries, Vendor Portal

Finishes the requirements register's PROC / Procurement & Vendors
section (`Setjeka Feature and Functional Requirements Register.xlsx`,
rows 38–45, read directly from the source file). Only **Vendor
onboarding** was built before this (§2.3's Contractors module); this
closes the remaining six submodules the register lists under one
category, all of which plug directly into infrastructure this session
already shipped: the Administration module's RBAC engine (a new
`PROCUREMENT` `PermissionModule`), the `Contractor` directory (RFQs
invite from it), `ProjectDocument` (BOQ/quote attachments link to it,
not a second upload path), and external `CONTRACTOR`-role accounts
(Administration's invite flow already gives vendors real, scoped
logins).

**RFQ**: `Rfq` (auto-numbered `RFQ-2026-0001`, scope description,
optional `ProjectDocument` link, due date, status
`DRAFT`/`ISSUED`/`CLOSED`/`AWARDED`/`CANCELLED`) + `RfqInvitation`
(which `Contractor`s were invited). Issuing is the `APPROVE` action on
`PROCUREMENT`.

**Quotes**: `Quote` nested under an RFQ (price, currency, lead time,
warranty/commercial terms, technical proposal, optional attachment). An
external `CONTRACTOR`-role caller submitting a quote has `contractorId`
forced to their own membership's `contractorId` server-side — verified
directly: a vendor's attempt to submit "as" another invited vendor's
`contractorId` was silently overridden back to their own. An internal
user must supply it explicitly (recording a paper/email quote on a
vendor's behalf). `create()` also rejects a quote from a contractor that
was never actually invited.

**Evaluation**: no separate model — `Quote.evaluationScores` is `Json`
(`[{criterion, weight, score}]`, the same convention
`ProjectTask.checklist` already uses), with the weighted total computed
at read time in `quotes.service.ts`, never stored — verified by hand
(0.4×8 + 0.3×9 + 0.3×6 = 7.7, matched exactly). The "side-by-side"
comparison is just the RFQ's quote list, already naturally comparable.

**Purchase Orders**: `PurchaseOrder` (auto-numbered `PO-2026-0001`,
optional links to the awarded `Quote` and/or an existing
`OrganisationProjectAppointment`, `costCode` as free text — this app
monitors cost, it isn't a budget system of record, per Meeting 002
decision 2.4 — status `DRAFT`/`APPROVED`/`ISSUED`/`CANCELLED`) +
`PurchaseOrderStatusHistory`, mirroring `SubmittalStatusHistory` exactly
(same `$transaction` shape as `SubmittalsService.changeStatus`).
Approving/issuing is the `APPROVE` action.

**Deliveries**: `Delivery` tied to a `PurchaseOrder` (quantity
ordered/delivered, expected/delivered dates, status
`PENDING`/`PARTIAL`/`DELIVERED`/`DELAYED`/`REJECTED` — "exceptions are
visible" is the `DELAYED`/`REJECTED` states, accepted-by
`ProjectMember`).

**Vendor Performance**: `VendorScorecard`, contractor-family like the
existing `OrganisationRating` (`contractors/:contractorId/scorecards`,
gated by `InternalOnlyGuard` like `ratings`/`payment-records` —
verified: an external vendor's own `GET` on this route is a 403). Five
1–5 dimension scores (cost/quality/delivery/safety/documentation); the
overall score is an unweighted average computed at read time — the
register says "configurable" but specifies no weighting UI, so true
per-dimension weighting is deferred (see table).

**Vendor Portal**: not a second UI. `RfqsService`/`QuotesService`/
`PurchaseOrdersService`/`DeliveriesService`'s `findAll` each resolve the
caller's own `contractorId` (via their `ProjectMember` row) when they're
an external `CONTRACTOR`-role account, and filter to it — internal
users are unaffected. Verified directly: two vendors invited to the same
RFQ each see only their own quote via `GET`, never the other's, and a
vendor with no purchase order on a project sees an empty list while the
PO's actual owner sees theirs. This is the same scoping decision already
made for the deferred Client Portal item — the RBAC-scoped existing
views satisfy "vendor sees only authorized records" without a
differently-skinned page.

**Frontend**: a new **Procurement** tab on the project workspace
stacking `RfqsPanel` (list/create/invite/issue, with a quote detail
slide-over showing quotes side by side and inline evaluation inputs) and
`PurchaseOrdersPanel` (list/create/status/history, with a nested
Deliveries section per PO) — the same stacked-panel precedent as the
Documents tab. `VendorScorecardPanel` sits inside the existing
Contractor workspace's Ratings tab. Two more Overview dashboard stat
cards (open RFQs, pending POs). A "RFQs & POs" shortcut was added to the
sidebar's existing Procurement group, alongside Contractors.

**Deliberately not built, and why:**

| Deferred | Why |
|---|---|
| Configurable per-dimension scorecard weighting | Register says "configurable" but names no weighting UI; an unweighted average is honest V1 |
| A visually distinct "Vendor Portal" page/skin | Same reasoning as the deferred Client Portal UI — the RBAC-scoped existing views already satisfy the acceptance criterion |
| RFQ→Quote deadline enforcement/auto-close | Not asked for; `dueDate` is informational like every other due date in this app |
| Automatic PO generation from an accepted quote | The register says "create... POs from awarded quotations" — read as linking, not auto-generating; a PM still creates the PO explicitly |
| Multi-currency conversion/rollup reporting | Out of scope everywhere else cost appears in this app (Meeting 002 decision 2.4) |
| Delivery photo/proof-of-delivery attachments | Not asked for; `notes` covers it for now |

Verified end-to-end via curl (full lifecycle: RFQ created → both vendors
invited → issued → each vendor submits a quote and sees only their own →
both evaluated with the weighted total matching by hand → PO created
from the winning quote → walked `DRAFT`→`APPROVED`→`ISSUED` with two
history rows → a delivery logged and walked `PENDING`→`PARTIAL`→
`DELIVERED` → a vendor scorecard recorded with the average matching by
hand → the `InternalOnlyGuard` and vendor-scoping denials all confirmed)
and Playwright (the full Procurement tab — RFQ create, detail slide-over
with invite picker and issue action — rendered and interactive with zero
console errors). This closes out the PROC module referenced as "still
fully ahead" in `MEMORY.md`'s Open/pending work section.

---

## 3. Frontend (Next.js)

### 3.1 App shell

| Piece | What | Why this shape |
|---|---|---|
| **Logo** | Setjeka wordmark (`/setjeka/logo.png`, inverted white), top of the sidebar only | Matches OpenConstructionERP's placement exactly — the header never carries a logo there either |
| **Sidebar nav** | "Overview" is a collapsible group containing "My Day" and "Dashboard"; "Projects" is a separate top-level link. Collapse state persists to `localStorage`, auto-expands when a child route is active | Mirrors the donor app's `grp_overview` nav-group pattern (a parent group with children), requested explicitly instead of three flat links |
| **Header** | Left: mobile hamburger (below `lg`) + project switcher + stage badge (below `md` hides, see next rows) + breadcrumb chevron + page title/icon (both `lg`+ only). Center: functional project search (`⌘K`, icon-only below `sm`). Right: notifications bell (placeholder), help icon (placeholder), theme toggle, user avatar menu (sign out) — the placeholder icons hide below `sm` to keep the mobile header from overflowing | Same left→center→right zoning as the donor app's header, scoped down to only the pieces that have something behind them right now |
| **Project switcher ("select project pane")** | A pill button (dashed border + "Select a project" when nothing's chosen; solid green once one is) that opens a dropdown: a filter input plus every project, click to select. Selecting sets it as the header's "current project" — persisted to `localStorage` (`setjeka_current_project`), survives reload/navigation | Visiting a project's detail page (`/projects/[id]`, §2.2) also sets it as current, so the switcher and the page stay in sync automatically |
| **Stage badge** | Shows once a project is selected: "Stage N — {label}", click opens a dropdown of Setjeka's 7 delivery stages (Initiation → Closeout, §2.2). Picking one updates optimistically, PATCHes `/api/projects/:id`, and rolls back on failure. Hidden below `md` (no room) | Originally built against generic external PROCSA-2015 labels — corrected to Setjeka's own verbatim stage standard once the requirements register was checked (§2.2 explains the correction) |
| **Functional search** | Click the center search box (or press `⌘K`/`Ctrl K` anywhere) to open a command-palette-style overlay: type to filter projects by name, click a result (or the switcher does the same job) to set it as the current project. Closes on Escape or backdrop click | The donor app's search was a full command palette across many entity types; scoped down here to the one thing that exists to search — projects — same interaction pattern (⌘K, overlay, live filter) so it's a straightforward extension point later |
| **Sidebar responsiveness** | Below the `lg` breakpoint, the sidebar is an off-canvas drawer (slides in from the left, dark backdrop, closes on backdrop click or navigation) triggered by the header's hamburger; at `lg`+ it's always visible in normal flow | Caught during dashboard QA: the sidebar had no mobile handling at all and ate ~60% of a 390px-wide screen. Fixed with a `translate-x` + `lg:translate-x-0` pattern so the same markup serves both layouts with no JS media-query logic |
| **Dark/light toggle** | Cycles light → dark → system on click, persisted to `localStorage` (`setjeka_theme`), applied via a `.dark` class on `<html>`. An inline `<script>` (via `next/script`, `beforeInteractive`) sets the class before first paint to avoid a flash of the wrong theme | Same 3-state cycle and persistence key pattern as the donor app's `useThemeStore`, reimplemented as a small React context since this is a fresh app with no Zustand dependency yet |
| **Sidebar color** | Always brand green (`#0E3D2C`), in both light and dark mode | Matches the donor app's sidebar, which never follows the light/dark toggle |
| **AI chat widget** | Floating circular button, bottom-right, opens a slide-in panel (message list + input). The button itself carries the Setjeka icon-mark (`/setjeka/icon-mark.png`, inverted white) rather than a generic chat icon | Same placement/look as the donor app's `FloatingChatButton`/`FloatingChatPanel`. **Not wired to an LLM** — sending a message shows a fixed placeholder reply. This was an explicit scoping decision: building a real AI backend needs a provider decision (OpenAI/Anthropic/etc.) and API key, which hasn't been made yet |
| **Main content bottom clearance** | `<main>` uses `pb-24`/`sm:pb-28` (asymmetric — more than the top padding) instead of a symmetrical `py-*` | Found during Projects-Overview mobile QA: the fixed AI chat button permanently covered the last card's content at full scroll-to-bottom rest, since no page reserved clearance for it. Fixed once at the shared layout level rather than per-page, since every scrollable page shares the same `<main>` |
| **Custom `Select` component** (`components/ui/Select.tsx`) | Every dropdown in the app (New/Edit Project selects, hierarchy type picker, Team role/contractor pickers, weather site picker) uses this instead of a native `<select>` | The open-dropdown highlight color on a native `<select>` is OS-rendered on Chrome/Windows — CSS `accent-color` does not reliably override it (verified: still blue after setting it globally). A fully custom button+listbox makes the highlight (and everything else about the dropdown's look) actually within the app's control, styled in brand emerald |
| **Collapsible sidebar** (`lg`+ only) | A `PanelLeftClose`/`PanelLeftOpen` toggle pinned to the bottom of the sidebar shrinks it to a `68px` icon-only rail (`lg:w-[68px]`); state persists to `localStorage` (`setjeka_sidebar_collapsed`). Mobile's existing off-canvas drawer is untouched — collapse only applies at `lg`+. Clicking a nav group's icon while collapsed re-expands the sidebar rather than attempting a flyout | Requested directly; the icon-rail pattern was chosen over a flyout/tooltip-menu approach for simplicity, matching this app's general preference for plain markup over new interaction patterns |
| **App shell height (`(app)/layout.tsx` root wrapper)** | `h-dvh` instead of `flex-1` | **Real pre-existing bug found while testing the collapse toggle**: `<main>` has always had `overflow-y-auto`, but nothing in its ancestor chain was actually height-bound to the viewport (`body` used `min-h-full`, a floor not a ceiling) — so on any sufficiently tall page the *whole document* scrolled as one unit instead of just `<main>`, meaning the sidebar/header scrolled out of view too. This had been true since the sidebar was first built; it just never surfaced because QA screenshots were taken at scroll-top or as full-page composites. It surfaced now because the new collapse button sits at the very bottom of the sidebar and Playwright's click auto-scrolled the unbounded page to reach it. `h-dvh` is viewport-relative (not a percentage of an ancestor), so it fixes this without touching `body`/`html`/`RootLayout` and without risk to `/login` or any other route group. Verified: scrolling `<main>` by 600px now leaves `<aside>`'s bounding box at exactly `{x:0, y:0}` matching the viewport height |

### 3.2 Dashboard — every widget currently on the page

First pass deliberately omitted widgets for modules that don't exist yet
(BIM coverage, RFIs, financial summary, etc.). On review, the call was made
to bring back full structural parity with the donor dashboard — every
section it has, this one has too — but **never with a fabricated number**.
Where there's no real data source yet, the widget says so plainly ("Coming
soon" / "Not tracked yet") instead of showing a fake stat.

**Real, live widgets** (backed by actual data):

| Widget | What it shows | Data source |
|---|---|---|
| **Greeting header** | "Good morning/afternoon/evening, {first name}" in green serif (Merriweather), + a "New Project" button | `useAuth()` user + `Date` |
| **Getting started checklist** | 4 steps: 2 real and checkable ("Create your first project", "Add site coordinates"), 2 marked "Soon" (AI assistant, invite team). Auto-hides once all 4 are done | Derived from `GET /projects` (project count, coordinate presence) |
| **KPI ribbon** | 5 stat tiles: Total projects (excludes archived), Planning, Active, On hold, Completed | Real counts from `GET /projects`, computed client-side. Shows a pulse skeleton while loading rather than flashing `0` |
| **Portfolio overview** | Active projects (real) + Total budget / With budget set (both "Not tracked yet" — no budget field exists) | `GET /projects` |
| **Today** | Open tasks / Open RFIs / Safety incidents — all "Not tracked yet", no such modules exist | — |
| **Project sites map** | Leaflet map (OpenStreetMap tiles), one marker per project with `latitude`/`longitude` set | `GET /projects`, filtered to sited projects — see §5.1 for a tile-usage caveat |
| **Site weather** | Current temperature, condition, wind speed. A dropdown picks which sited project when there's more than one | Open-Meteo, called directly from the browser — see §5.2 |
| **Sites** | Compact list of every sited project's name + coordinates | `GET /projects` |
| **Activity** | Real event feed: "`{project}` was created/updated", relative timestamps, newest first | Derived from each project's `createdAt`/`updatedAt` |
| **Projects by status** | Hand-rolled horizontal bar chart, one bar per status present, with count + percentage | `GET /projects`, grouped client-side — the donor app's own philosophy of skipping vanity metrics applies here too: this shows a real, answerable breakdown rather than a chart for its own sake |
| **Recent projects list** | Up to 5 most recently created projects, avatar-letter tile + name + date | `GET /projects` |

**"Coming soon" widgets** (structural placeholders, explicitly labelled, no fake data): Finance summary, Estimate resources, BIM coverage, Operations snapshot, Latest site photos, Upcoming milestones, RFI turnaround, Submittals pending, Inspections quality, Punch list quality, Cases. Each names the module it depends on so it's obvious what unblocks it.

---

## 4. Converter microservice (`converter-service/`)

### 4.1 What this is

A standalone Python/FastAPI service, **extracted from OpenConstructionERP**,
that turns BIM/CAD files and 2D PDF plans into structured quantities. It has
no database, no auth beyond a single shared-secret header
(`X-Internal-Token`), and no dependency on anything else in this repo — it's
designed to be called by the NestJS backend over HTTP (that call site is
**not built yet** — see §4.4).

### 4.2 Why extraction instead of a straight port

OpenConstructionERP's BIM/takeoff code totals roughly 46,000 lines across 4
modules (`bim_hub`, `takeoff`, `dwg_takeoff`, `boq/cad_import.py`), and most
of that is deeply wired into that app's own database, RBAC, and BOQ models —
dragging it wholesale into this stack would have imported that coupling too.

Investigation found the actual **algorithmic core** — the part that reads a
file and produces quantities, with no database or auth involved at all — is
a much smaller, cleanly separated slice:

| Source file (OpenConstructionERP) | Lines | Coupling found |
|---|---|---|
| `boq/cad_import.py` | 2,392 | none |
| `boq/dxf_native.py` | 271 | none |
| `dwg_takeoff/dxf_processor.py` | 548 | none |
| `dwg_takeoff/intl.py` | 582 | none |
| `dwg_takeoff/extents.py` | 174 | none |
| `takeoff/pdf_extract_worker.py` | 422 | none |
| `takeoff/scale_detect.py` | 386 | none |
| `takeoff/recognize.py` | 484 | none |
| `takeoff/raster_recognize.py` | 387 | none |
| `takeoff/plan_read.py` (scale-math functions only) | 628 | none |

**~6,270 lines total**, verified via `grep` to contain zero imports of
`app.database`, `app.dependencies`, `app.config`, or any RBAC/DB helper —
confirmed file by file before copying, not assumed. Everything else in those
four modules (routers, services, repositories, SQLAlchemy models — the
other ~40,000 lines) is UI/persistence/multi-tenant plumbing this new app
doesn't need and wasn't copied.

One small exception: `dxf_processor.py` called a single function,
`infer_units_from_extents`, out of a much larger, DDC-XML-specific file
(`ddc_dwg_parser.py`, 47 KB) that was *not* otherwise needed. That one
~40-line function was copied into `extents.py` (its natural home) instead of
dragging in the whole file it used to live in.

### 4.3 What it does, endpoint by endpoint

- **`GET /health`** — liveness check, no auth.
- **`GET /converters`** — per-format (`rvt`/`ifc`/`dwg`/`dgn`) status: is the
  DDC converter binary installed, does it pass a smoke test, what version.
- **`POST /convert/bim`** — upload a `.rvt`/`.ifc`/`.dwg`/`.dgn`/`.rfa`/`.dxf`
  file. `.dxf` is read natively (pure Python, via `ezdxf` — no external
  binary needed); the other formats are converted via the matching
  DataDrivenConstruction (DDC) exporter binary, then the resulting Excel is
  parsed and grouped by category/type into quantities (count, volume m³,
  area m², length m).
- **`POST /convert/bim/group`** — re-group a previously-returned element list
  by different columns, without re-uploading (the service is stateless, so
  the caller re-sends the `elements` array from the first call).
- **`POST /convert/pdf`** — upload a PDF plan page. Reads the page's vector
  drawing layer (via PyMuPDF) and runs deterministic area/length/count
  detectors; if the page has no vector layer (a scanned/raster plan), it
  rasterizes the page and runs an OpenCV-based room/wall detector instead.
  Also runs text-based scale-note detection ("SCALE 1:100") across the PDF
  as an informational hint. `scale_pixels_per_unit` is optional — omit it to
  get geometry-only candidates (`value: null`) for a human to confirm.
- **`POST /convert/pdf/calibrate`** — given two reference points and a known
  real-world length (e.g., "this line is 4.10 m"), returns the derived
  `scale_pixels_per_unit` to feed back into `/convert/pdf`. This mirrors the
  donor app's calibration-dialog step exactly — the source code documents a
  hard rule that a detected quantity is *never* auto-confirmed, only
  proposed for a human to accept, and this endpoint preserves that.

### 4.4 Verified, not guessed

Every endpoint was tested against real files before being called done:

- `.dxf` — a real fixture (`frontend/e2e/fixtures/test.dxf` from
  OpenConstructionERP) converted correctly (5 elements, walls + circle,
  correct lengths).
- `.ifc` — a real 2.4 MB fixture
  (`frontend/e2e/fixtures/dashboards/sample-project.ifc`) converted via the
  **actual DDC `IfcExporter` binary** already installed on this machine: 297
  elements across 21 IFC categories (walls, slabs, windows, storeys, etc.).
- PDF vector takeoff — a real fixture (`frontend/e2e/fixtures/test-drawing.pdf`)
  correctly detected a closed rectangle as an area candidate.
- Scale calibration — verified the math against a known example (a 72-pixel
  reference line over 4.10 m → 17.56 points/metre).
- Regrouping, unsupported-extension rejection (400), and missing-auth-token
  rejection (401) all confirmed.

### 4.5 What's explicitly not done yet

- **NestJS integration** — the backend has no route that calls this service
  yet. It runs standalone (`:8100`) and is ready to be called, but nothing
  in `backend/` does so.
- **AI-vision plan reading** — the donor app has an optional path where an
  AI vision model reads a scanned plan directly. Only the pure
  scale-math half of that (`plan_read.py`'s `derive_scale_ratio` etc.) was
  ported; no AI provider call was built, matching the same "no AI backend
  decided yet" scoping as the chat widget (§3.1).
- **Deployment** — a `Dockerfile` exists (installs the DDC Linux `.deb`
  packages at build time, same pattern as OpenConstructionERP's backend
  image) but has not been deployed anywhere yet.

---

## 5. Third-party services in use

### 5.1 OpenStreetMap tiles (via Leaflet)

**Used for:** the dashboard's "Project sites" map.
**Auth:** none — no API key, no account.
**Cost:** free.
**Important caveat:** the default `tile.openstreetmap.org` server used here
is meant for **light development/evaluation use only** — OSM's tile usage
policy prohibits heavy or commercial production traffic against it without
prior arrangement. Before this app has real production traffic, the tile
source should move to either a self-hosted tile server or a paid provider
(e.g., MapTiler, Stadia Maps, Mapbox) that fronts OSM data under a proper
commercial agreement. Flagging this now so it isn't discovered the hard way
(rate-limited or blocked) after launch.

### 5.2 Open-Meteo (weather)

**Used for:** the dashboard's "Site weather" widget.
**Endpoint:** `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current_weather=true`
**Auth:** none — no API key.
**Cost:** free for non-commercial use under Open-Meteo's terms; they ask
heavy/commercial users to self-host their open-source stack or use their
paid tier. Worth revisiting if usage grows.

### 5.3 DataDrivenConstruction (DDC) converter binaries

Not a network API, but a third-party dependency worth listing: the
`RvtExporter`/`IfcExporter`/`DwgExporter`/`DgnExporter` binaries that do the
actual BIM/CAD file conversion are DataDrivenConstruction's free "Community"
tier, distributed as signed `.deb` packages from
`pkg.datadrivenconstruction.io` (Linux) or bundled `.exe` files (Windows).
No API key; no network call at conversion time (everything runs locally,
offline, once the binaries are installed).

---

## 6. Local dev quick reference

| Service | Port | Start command |
|---|---|---|
| Frontend | 3000 | `npm run dev` in `frontend/` |
| Backend | 4000 | `npm run start:dev` in `backend/` |
| Converter service | 8100 | `./.venv/Scripts/uvicorn app.main:app --port 8100` in `converter-service/` |

Postgres: native install, database `setjeka_erp`, role `setjeka_erp` /
`setjeka_erp_dev`. Demo login stored at `~/.setjeka-erp/.demo_credentials.json`.

## 7. Production deployment

Live at `https://173.212.202.149` (raw IP, self-signed cert — no domain
registered yet) on the VPS that previously ran OpenConstructionERP; that
stack was torn down and this one deployed in its place. Full first-time
setup and redeploy steps: `deploy/README.md`. Summary:

- `docker-compose.prod.yml` (repo root): `postgres` (plain `postgres:16-
  alpine`) + `backend` + `frontend` + `nginx`, each with healthchecks and
  `restart: unless-stopped`.
- `backend/Dockerfile`, `frontend/Dockerfile`: multi-stage builds. The
  frontend uses `output: "standalone"` (`next.config.ts`) — static export
  isn't viable since `/projects/[id]` and `/contractors/[id]` are fully
  dynamic, unbounded-at-build-time routes.
- `deploy/nginx.conf`: TLS termination (nginx, not Caddy — same proven
  choice as OpenConstructionERP on this VPS) + reverse proxy to
  `frontend:3000` and `backend:4000`. Unlike OpenConstructionERP's nginx
  (which served a static SPA build directly from its own image), this one
  is a pure proxy to two live Node processes, since the frontend needs a
  running server, not just static files.
- Compliance document uploads persist in the `vendor_documents` named
  volume (`/data/vendor-documents` in the backend container), independent
  of the image/container lifecycle.
- Two real bugs surfaced and fixed during the first deploy (see
  `MEMORY.md`'s "Production deployment" section for the full detail): (1)
  Next's standalone server binds to `process.env.HOSTNAME`, which Docker
  auto-sets to the container ID, so without an explicit `ENV
  HOSTNAME=0.0.0.0` override the frontend was unreachable from outside its
  own container; (2) `prisma/seed.ts` runs via `tsx` against the Prisma
  client's **source** path, so the backend image needs `src/generated`
  copied in alongside `dist/`, not just the compiled output.
- **Not yet done**: pushing this repo to GitHub (blocked on credentials —
  see `MEMORY.md`), a real domain + Let's Encrypt cert (self-signed for
  now), and SharePoint sync for compliance documents (blocked on Azure AD
  app credentials).
