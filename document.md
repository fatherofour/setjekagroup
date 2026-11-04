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

### 2.12 Opportunities — DEV Pipeline, "Stage 0"

Closes the requirements register's **DEV / Development Management**
section (confirmed directly from `Setjeka Feature and Functional
Requirements Register.xlsx`, rows 8–12): capturing a prospective
development **before** it becomes a real `Project` — a "Stage 0" this
app's `Project.stage` model never covered, since that starts at
Initiation. It also closes a standing note from before the setjeka-erp
rebuild (`opportunity-project-integration-deferred`): once Opportunities
was "genuinely finalized," wiring a Client dropdown + address
auto-populate on New Project became a hard requirement — this module's
**Convert to Project** action is the cleaner equivalent of that in this
app's actual architecture (pre-filling a new `Project` from the
opportunity's data directly, rather than a dropdown on the create form).

**How it maps to PROCSA Stage 0.** The PROCSA Responsibility Matrix's
Stage 0 ("Project Initiation & Briefing", Development Manager only) is
what Setjeka's own stage list calls *Initiation*. An Opportunity **is**
that stage; converting it creates the Project directly at **Inception**.
The opportunity screen is organised around the matrix's line items:

| PROCSA | Line item | Where it lives |
|---|---|---|
| 0.1 / 0.3 | Need & desirability; client's vision | `Client` record + the opportunity brief (`description`) |
| 0.2 | First business case | `description` + `estimatedValue` |
| 0.4 | Source appropriate land | `OpportunitySite` register, one `SELECTED` |
| 0.5 | Land rights — zoning, environmental, infrastructural, legal | `OpportunityApproval` |
| 0.6 / 0.7 | Procure market research; appoint consultants | Opportunity RFQs → automatic ranking → `OpportunityAppointment` |
| 0.8 | Process payments to creditors | Not built here — payments are recorded against the project appointment after conversion |

A checklist on the Overview tab shows these. **Only "client captured"
and "site selected" block conversion** — a project can't be set up
without knowing who it's for and where it is. Approvals and consultants
are advisory, because Setjeka may legitimately carry an outstanding
approval or appointment into Inception.

**`Opportunity`**: name, description, `developmentType` (free text —
same reasoning as `Contractor.disciplines`: the register's categories
are examples, not a confirmed closed set), location (target area —
the exact site comes from the site register), `estimatedValue`/
`currency`, `clientId` → `Client`, `stage` (own enum:
`IDENTIFIED`→`UNDER_EVALUATION`→`APPROVED`→`CONVERTED`, plus terminal
`ON_HOLD`/`REJECTED`), `ownerId` (defaults to the creator — the
Development Manager), `convertedProjectId`. Deliberately **not**
project-nested — there's no `Project` yet. Internal staff manage it
behind `InternalOnlyGuard`; clients and consultants see their slice of
it through the portals below.

**`Client`** (replaced the earlier free-text `clientName`/
`clientContactName`/`clientEmail`/`clientPhone` columns): a shared client
directory — name (unique), registration number, contact person, email,
phone, address, notes. Added because the client asked for "space to
enter new client details" at this stage *and* for client portal access,
and a portal login needs an organisation to belong to before any
project exists. The migration copied every existing opportunity's client
text into a `Client` row before dropping the old columns, so nothing was
lost. A new client can be added inline from the New Opportunity form
(`ClientPicker`), or from **Opportunities → Clients**.

**`OpportunitySite`** (PROCSA 0.4): every site considered — name,
address, erf/stand/title-deed number, size (m²), current zoning,
ownership, asking price, coordinates, notes — with status
`CANDIDATE`/`SHORTLISTED`/`SELECTED`/`REJECTED`. At most one is
`SELECTED`; `POST .../sites/:siteId/select` drops any previous choice
back to `SHORTLISTED` in the same transaction, and `PATCH` refuses to set
`SELECTED` directly so that rule can't be bypassed.

**Consultant appointment by RFQ** (PROCSA 0.6–0.7). Reuses the
procurement `Rfq`/`RfqInvitation`/`Quote` models: `Rfq.projectId` became
optional and `Rfq.opportunityId` was added, with a database `CHECK`
that exactly one is set. An opportunity RFQ also carries `discipline`,
`currency` (defaults to the opportunity's) and `priceWeight`/
`ratingWeight` (default 60/40). The flow:

1. **Choose a discipline** — the dropdown (`GET /consultants/disciplines`)
   lists every discipline actually registered in the Contractors
   directory, with a count. Picking e.g. *Architect* lists **every**
   registered architect (`GET /consultants?discipline=`; matched
   case-insensitively, excluding rejected/suspended/archived firms), best
   track record first, **all ticked by default**.
2. **Send** — one RFQ, one invitation per ticked firm.
3. **Quotes** — a firm with a vendor-portal login submits its own;
   otherwise staff record the quote when it arrives. One live quote per
   firm per RFQ (a resubmission replaces it).
4. **Automatic ranking** (`consultant-ranking.ts`, computed at read time,
   never stored):
   - *Price score* — lowest fee = 100, others = lowest ÷ their fee × 100.
   - *Track-record score* — the average, as a % of 5★, of every past
     `OrganisationRating` (1–5★) and every `VendorScorecard` (its five
     1–5 dimensions averaged) across all the firm's appointments. A firm
     with no history is scored at a neutral 3★, so it's neither rewarded
     nor punished and price alone separates it.
   - *Overall* = weighted by the RFQ's price/track-record split. Ties go
     to the cheaper fee. Quotes in another currency are listed but not
     ranked — comparing ZAR with USD needs an exchange rate the app
     deliberately doesn't hold.
   - The #1 firm is shown as **Recommended**.
5. **Appoint** — one click on the recommended firm. Appointing anyone
   else is allowed (the ranking advises; the Development Manager decides)
   but **requires a written justification**. The appointment stores the
   rank and score the evaluation gave at that moment, so an override
   stays auditable after later ratings shift the live ranking.

Worked example from the test run: A quoted R100k with no history, B
R120k with a 5★ record, C R90k with a 2★ record. Overall scores were B
85, A 78, C 76 — the dearest firm is recommended because its record
outweighs a 25% price premium at 60/40, which is the trade-off the
client described.

**`OpportunityAppointment`**: the appointed firm, role (derived from the
discipline — Architect → `ARCHITECT`, Quantity Surveyor →
`QUANTITY_SURVEYOR`, etc., otherwise `CONSULTANT`), fee, rank/score at
award, justification, who appointed and when. It's kept separate from
`OrganisationProjectAppointment` (which needs a `projectId` and drives
five contractor-profile screens that assume one) and becomes one on
conversion. An appointment can be revoked before conversion; its RFQ
then reopens as `CLOSED` so another firm can be appointed from the same
bids.

**Portals.** Both are ordinary `EXTERNAL` accounts tied to one
organisation via `User.clientId` or `User.contractorId` (one login can't
be both). Access is granted from the client's page / the opportunity's
Client tab, or the contractor's **Portal access** tab. As with the
Administration invite flow, no email provider is connected, so the
set-password link is shown for staff to send. Both portals re-read the
caller's organisation from the database on every request rather than
trusting the token, so removing access takes effect immediately.
- **Client portal** (`/client-portal/...`, menu *Portal → My
  Developments*): read-only view of their own client's opportunities —
  brief, stage history, sites (rejected ones hidden), approvals,
  appointed team. **Never** quotes, fees or scores.
- **Vendor portal** (`/vendor-portal/...`, menu *Portal → My RFQs*): the
  RFQs the firm was invited to (opportunity and project RFQs alike), its
  own quote only, submit/update/withdraw while the RFQ is issued and
  before the end of its due date, and whether it was awarded. Never
  other firms' names, quotes or scores.

The sidebar now hides internal-only menus (Opportunities, Contractors)
from external logins, and shows the Portal menu only to them.

**`OpportunityStageHistory`**: same shape as `SubmittalStatusHistory`/
`OrganisationStatusHistory` — a direct stage change with a logged
history row, satisfying "stage transitions retain dates, owners and
history." Deliberately **not** the heavier request/approve
`StageTransition` workflow built for Projects — that exists for a
requester/external-approver split that doesn't apply here; an
Opportunity is single-actor internal pipeline work.

**`OpportunityApproval`** (Authority approvals, Required: Yes):
`approvalType` (free text), `status`
(`PENDING`/`SUBMITTED`/`APPROVED`/`REJECTED`), owner, due date,
`evidenceNotes` (free text — no project-agnostic document store exists
pre-Project, so a text reference is the honest V1 rather than building
one just for this).

**Move to Inception** (`POST /opportunities/:id/convert-to-project`):
only from `APPROVED`, and only with a client and a selected site. It
creates the `Project` at stage **`INCEPTION`** via the existing
`ProjectsService.create` (reusing its project-code numbering), with
client = the client's name, location and coordinates = the selected
site, plus name, description, value and currency. Then, in one
transaction:
- each `OpportunityAppointment` becomes an `OrganisationProjectAppointment`
  (status `APPOINTED`, fee, RFQ number as the reference) **and** a Team
  member — one per active vendor-portal login of that firm so those
  logins can open the project, or a single directory-only member if it
  has none;
- each active client-portal login becomes a `CLIENT` Team member (or one
  directory-only `CLIENT` member from the client's contact details);
- the opportunity becomes `CONVERTED` with a history row.

If that transaction fails, the just-created project is deleted, so a
half-converted opportunity can't be left behind. A converted opportunity
is read-only and can't be deleted — it's the project's Stage 0 record.

**Fixed along the way:** RFQ numbers restarted at `RFQ-YYYY-0001` per
project, but `rfqNumber` is unique across the whole table, so a second
project's first RFQ would have hit a duplicate-number error. The
sequence is now global (`nextRfqNumber` in `rfqs.service.ts`), shared by
project and opportunity RFQs.

**Deliberately not building, and why:**

| Deferred | Why |
|---|---|
| Feasibility register (site/location/type/est. value/cost/funding/risks/assumptions as a dedicated structured record) | The register explicitly marks this **"Not needed now"** — the client's own words, not an inference |
| Development milestones | Register marks this **"Default"** — lower priority than this section's two "Yes" rows |
| File/document evidence on approvals, sites and RFQs | No project-agnostic document store exists pre-Project; text fields are the V1 stand-in |
| Fully automatic award (no human click) | The ranking pre-selects and recommends; appointing a consultant commits Setjeka contractually, so a Development Manager confirms it with one click. Overrides are allowed but justified and recorded |
| Configurable evaluation criteria beyond price + track record (e.g. technical score) | The client asked for price and ratings. The weights are adjustable per RFQ; more criteria can be added to `rankQuotes` later |
| Currency conversion in the ranking | No exchange-rate source in the app; other-currency quotes are shown but not ranked |
| Emailing RFQs / portal invites | No email provider connected (same as every other invite in the app); staff send the set-password link, and the RFQ appears in the firm's portal |
| PROCSA 0.8 payments to creditors at opportunity stage | Payments already exist against project appointments; pre-project payments weren't asked for |
| Reusing Project's `StageTransition` request/approve workflow for opportunity stages | Different shape of problem — single internal actor, not a requester/external-approver split |

**Verified** with two throwaway scripts (both deleted afterwards, all
test data removed):
- **API (48 checks):** discipline list and case-insensitive consultant
  pool sorted by track record; duplicate client rejected; client and
  vendor portal grant → set-password → login; one login can't be both;
  site selection keeps exactly one selected and `PATCH` can't bypass it;
  RFQ to three architects, vendor submits and re-submits (updates, not
  duplicates), staff record two more; scores exactly B 85 / A 78 / C 76
  with B recommended; vendor and client responses never contain
  competing fees or scores; vendor gets 403 on internal and client-portal
  routes and client gets 403 on internal routes; override without
  justification refused; no quoting after award; conversion refused
  before Approved; on conversion the project is at `INCEPTION`, located
  at the selected site with its coordinates, the architect is a project
  appointment and an `ARCHITECT_ENGINEER` member, the client login is a
  `CLIENT` member and can open the project, a non-appointed vendor can't;
  the converted opportunity is read-only.
- **Browser (Playwright, staff + vendor + client logins):** the whole
  flow through the UI, including the inline new client, sites,
  approvals, the RFQ discipline picker (all firms ticked, track record
  shown), the vendor quoting in its portal, the ranking table, the
  justification gate, Move to Inception landing on the new project, and
  the client portal. Also dark mode, 390px width (no horizontal scroll),
  and zero browser console errors.

This closes the `opportunity-project-integration-deferred` note in the
global memory store — see `MEMORY.md`.

### 2.12a PROCSA Stage 0 — finalised for all roles

Completes §2.12 against the PROCSA matrix's Stage 0 column (0.1–0.8,
Development Manager only) and the requirements register's DEV rows. Those
rows name an **Executive** alongside the Development Manager, and the client
takes part through 0.3. The role catalogue and evidence rules are in
`backend/src/opportunities/stage0.ts`.

| Item | Built |
|---|---|
| **0.1** Establish need and desirability | `Opportunity.needAndDesirability`. Existing `description` text was copied in by the migration; `description` is now a short summary |
| **0.2** First business case | `ViabilityScenario` now belongs to an opportunity *or* a project (a database CHECK enforces exactly one). Same calculator as Stage 1 desktop viability. One scenario is marked preferred. Completed market research pre-fills a new scenario's rent or sale price. Scenarios are **copied** to the project at conversion |
| **0.3** Formalise the client's vision | `clientVision` + `visionConfirmedAt/By`. The client confirms it in their portal (`POST /client-portal/opportunities/:id/confirm-vision`). Editing the vision, or changing the client, clears the confirmation. Staff can't tick the client's item for them |
| **0.4** Source appropriate land | Existing site register + selection |
| **0.5** Procurement of land rights | The selected site carries a land acquisition status (negotiating → offer → agreement signed → transferred/leased) with agreed price and dates. Land rights are categorised **zoning / environmental / infrastructure & external services / legal**, linked to a site, with authority, reference and evidence files. Done when the site is secured and every right is granted |
| **0.6** Procure market research | `MarketResearch`: provider, status, recommended product, target market, achievable rent/sale price, vacancy, demand evidence, findings, report files |
| **0.7** Appoint consultants | Existing ranked consultant RFQs |
| **0.8** Process payments to creditors | `OpportunityPayment`: the Development Manager records the invoice, an **Executive who didn't record it approves**, then it's marked paid. Rejection needs a reason. Paid consultant invoices become `PaymentRecord`s on the project appointment at conversion |
| Executive (register DEV R8/R11) | `InvestmentDecision`. The Development Manager requests it once the client, need and a preferred business case are on file; it stores a snapshot of the case. An Executive (internal `MANAGER` or `ADMIN`, not the requester) approves or declines with reasons. **Approval is now the only way an opportunity reaches APPROVED** — setting the stage directly is refused, and the stage is frozen while a decision is pending |
| Evidence (register DEV R11) | `OpportunityDocument`: files on local disk (`UPLOAD_DIR`), optionally linked to a land right, site, research report, payment or business case |
| Development milestones (register DEV R12) | `DevelopmentMilestone` with baseline, target and actual dates; status (on track / slipped / overdue / complete / complete late) and variance computed at read time. A PROCSA template covers the Stage 0 events and the end of each stage 1–6. Template milestones **record their own actual date** when the event happens (vision confirmed, research completed, site secured, all land rights granted, investment decision, conversion, each stage gate approved). They move to the project at conversion and continue on the Inception tab |

**Stage 0 tracker** (replaces the earlier 5-item checklist). Development
Manager 0.1–0.8, Executive E.1 (investment decision) and E.2 (payments
approved), and Client C.1 (vision confirmed). Items tick themselves from
evidence; staff can sign off Development Manager and Executive items by
hand with a note. **Blocks conversion:** client, selected site, and an
approved investment decision.

**Approval Center** now also shows Executives pending investment decisions
and Stage 0 payments, and never asks anyone to approve their own request.

**Client portal** adds the need, the vision with a Confirm button, the
preferred business case headline (cost, value, profit on cost, yield),
land-right categories, acquisition status and milestones. It still never
shows payments, fees or quotes.

**Verified:**
- **API (49 checks)** across Development Manager, Executive, client and
  architect logins:
  - **Vision:** the confirm/clear cycle, and staff can't tick the client's
    item.
  - **Milestones:** template, baseline and a 45-day slip; five Stage 0
    milestones recorded their own actual dates.
  - **Land rights:** stay open until the site is secured and every right
    granted.
  - **Evidence files:** upload, download intact, and links to records from
    elsewhere refused.
  - **Payments:** the Development Manager can't approve, can't pay before
    approval, can't edit after approval, and a rejection needs a reason.
  - **Investment decision:** approval can't be set by stage, conversion is
    blocked without the decision, one pending at a time, the stage freezes
    while pending, the requester can't decide, and it shows only in the
    Executive's queue.
  - **Client view:** no fees.
  - **Conversion:** business case copied (the opportunity keeps its own),
    milestones carried with "enters Inception" recorded, paid invoice →
    project payment record, land rights → consents with category and
    authority, brief seeded from need and vision.
- **Browser (Playwright):** the full flow through the UI as all three
  roles, including market research pre-filling the business case, site
  acquisition, evidence upload, Executive approval from the Approvals
  queue, client confirmation in the portal, Move to Inception and the
  milestones continuing on the project. No sideways scroll at 390px and
  zero browser console errors.

### 2.13 PROCSA Stage 1 — Inception (all roles)

Built from the PROCSA Responsibility Matrix's Stage 1 column for every
role. PROCSA defines the stage as: *"Establish the client requirements and
preferences, assess user needs and options, appointment of necessary
consultants, establish the project brief including project objectives,
priorities, constraints, assumptions, aspirations and strategies."* The
roles are the Development Manager, Project Manager, Architect, Quantity
Surveyor, and the Structural, Civil, Electrical and Mechanical Engineers.
The full line-item catalogue is in `backend/src/inception/procsa.ts`.
Everything lives on a new **Inception (Stage 1)** tab of the project
workspace, plus a project **Meetings** tab and an **Approvals** page.

**Roles.** The register's User Roles sheet groups Architect / Civil /
Structural Engineer as one role. PROCSA gives each its own Stage 1 duties,
so `ProjectMemberRole` gained `ARCHITECT`, `STRUCTURAL_ENGINEER`,
`CIVIL_ENGINEER`, `ELECTRICAL_ENGINEER` and `MECHANICAL_ENGINEER`.
`ARCHITECT_ENGINEER` stays, relabelled "Architect / Engineer (general)",
for existing members. `OrganisationProjectRole` gained Electrical and
Mechanical Engineer. Consultants appointed from an RFQ now join the Team
under their own PROCSA role.

**Line items → modules**

| Deliverable | PROCSA | Module |
|---|---|---|
| Project brief | DM 1.1, PM 1.1, all consultants 1.1 | `ProjectBrief`: client requirements, user needs, options, objectives, priorities, constraints, assumptions, aspirations, strategies, budget target, target completion. Consultant input is a comment thread (`CommentEntityType.PROJECT_BRIEF`) |
| Site assessment | DM 1.2, PM 1.4, consultants 1.4, engineers 1.7 | `SiteConstraint` (characteristics, rights, constraints with impact/status/mitigation) and `SiteInvestigation` (surveys/tests needed before Concept, who recommended, who is responsible, cost, findings) |
| Desktop viability | DM 1.3 (+ QS 1.7–1.8, engineers 1.9 advice) | `ViabilityScenario` — inputs only; results computed at read time (`inception/viability.ts`). One scenario is marked preferred |
| Procurement policy | DM 1.5, PM 1.2, consultants 1.3 | `ProcurementPolicy`: delivery strategy, tender method, contract form (writes `Project.contractForm`), minimum quotes, preferential procurement, local content, approval thresholds, and the default price/track-record split for consultant RFQs |
| Consents & approvals schedule | PM 1.7, consultants 1.4 | `ConsentApproval` register. Stage 0 authority approvals are copied in on conversion (and were back-filled for already-converted projects) |
| Professional team | DM 1.4, PM 1.3 / 1.5 / 1.6, consultants 1.5–1.6, Architect 1.5, QS 1.4 | `RequiredService` (which disciplines are needed; "covered" is derived from appointments), project-level consultant RFQs (same ranking as Stage 0), and per-appointment roles & responsibilities, fee basis/%, agreement form and agreement status through to Signed |
| Initiation programme | PM 1.8 | One click adds 8 Stage 1 activities to the project Schedule as a finish-to-start chain; the existing critical-path engine dates them |
| Information register | Architect 1.7–1.8, engineers 1.8 / 1.10, QS 1.9 | `InformationItem`: what data/drawings/plans exist, who holds them, status, linked document |
| "Advise on …" items | all consultants 1.3 / 1.4, Architect 1.5, QS 1.4 / 1.7 / 1.8, engineers 1.7 / 1.9 | `ConsultantAdvice` by topic, shown in the relevant section; the author's role is snapshotted |
| Initiation meetings | all consultants 1.2; register CLI "Client communications" | `Meeting` + `MeetingAttendee` (invite, present/absent, minutes, issue to attendees with notifications). Action items are ordinary `ProjectTask`s with `meetingId` |
| Client approval of Stage 1 documentation | PM 1.9; register CLI "Client approvals", COL "Approval center" | `StageDeliverable` + `StageDeliverableEvent` and the `/approvals` queue |

**Sign-off (PM 1.9).** Seven documents need the client's approval: brief,
site assessment, desktop viability, procurement policy, consents
schedule, consultant appointments, and initiation programme. Each has a
"ready" rule (e.g. the brief needs requirements, objectives and
constraints) before it can be submitted. The client then approves it, or
requests a revision with a reason. Each approval stores a snapshot of
what was approved. **Editing an approved or submitted document reopens it**
(approved → new version), so an approval always matches what's on file.
The project **can't be requested from Inception into Concept until all
seven are approved**. This is checked again when the stage-gate request
is decided, in case something was reopened in between.

Only **the client** approves Stage 1 documents (PROCSA: client approval;
Meeting 3 hard rule, §2.15). The Development Manager originally held this
too, "acting for" the client; that was removed on 2026-10-03, and
`DeliverablesService.decide` now also refuses anyone who isn't an EXTERNAL
CLIENT member, whatever the permission matrix says. Admins can still
change other defaults in Administration → Permissions, which also lists
the Stage gate, Procurement, Inception documents and Meetings modules.

**Responsibility tracker.** Every role's Stage 1 line items, ticked
automatically where the app can see evidence. Examples: the architect
commented on the brief; was marked present at a held initiation meeting;
recorded advice on the procurement policy. The QS's agreement is Signed;
the PM's consents schedule is ready; all seven documents are approved.
Anything the app can't evidence, or that was done off-platform, is
signed off by hand with an optional note (`ResponsibilityCheck`).

**Approval Center (`/approvals`).** One queue of everything waiting on
the signed-in user's decision across their projects: submitted Stage 1
documents and pending stage-gate requests. It uses the same permission
check as the decide endpoints.

**Stage 0 → Stage 1 carry-over on conversion:** the brief starts from the
opportunity's business case and value. Authority approvals become the
consents schedule. Each appointed discipline becomes a covered required
service. The award rank, score and any override justification are copied
onto the project appointment.

**Engineering notes**
- Six registers share one engine (`inception/registers.ts` +
  `register-fields.ts`). Each register declares its fields, and the
  engine whitelists and type-checks the body (unknown keys dropped; enums,
  dates and numbers validated; member/document ids must belong to the
  project). Editing a register reopens the Stage 1 document it feeds.
- Consultant RFQs now have an "owner": an opportunity or a project
  (`RfqOwner` in `opportunity-rfqs.service.ts`). On a project, the award
  creates the project appointment and Team member(s) straight away
  (`inception/team.ts`, shared with conversion). Consultant RFQs (those
  with a discipline) are kept out of the Procurement tab's works/supply
  RFQ list.
- Migrations: `20261001120000_stage1_inception` (schema),
  `…120100_stage1_inception_data` (permission rows for the new roles and
  modules, plus back-fill of consents and award records — a separate
  migration because Postgres can't use a new enum value in the same
  transaction that added it), and `…120200_stage1_approve_defaults`.
  `seed.ts` matches.

**Deliberately not building, and why**

| Deferred | Why |
|---|---|
| A full feasibility study (funding structure, cash flow, sensitivity) | DM 1.3 asks for a *preliminary desk-top* viability, and the register's DEV "Feasibility register" row is marked "Not needed now". The bankable business plan is PROCSA Stage 2.4 |
| Generating the brief / policy / viability as branded PDFs | The register's reporting rows are separate work; the approval snapshot keeps the exact approved content |
| Emailing meeting invites and minutes | No email provider is connected (as with every invite in the app); invitees get in-app notifications |
| Document sets for Stages 2–6 | The `StageDeliverable` model takes any stage and key; only Inception's set is defined, because that's what was asked for |
| Auto-assigning PROCSA items to named people | Items attach to a role; the tracker shows who on the team holds it. PROCSA assigns duties to roles, not individuals |

**Verified** with two throwaway scripts (deleted afterwards, all test
data removed):
- **API (58 checks):**
  - **Stage 0 carry-over:** brief, consents, covered service, and the
    architect's distinct role.
  - **Brief:** can't be submitted before it's ready. The architect can
    comment but not approve (403), and their approval queue is empty
    while the client's shows the brief. A revision needs a reason. The
    approval snapshot matches the content, and editing afterwards
    reopens it as v2.
  - **Registers:** reject bad enums and members from another project, and
    attribute records to the caller's role.
  - **Viability maths:** sale case TDC R168.044m, GDV R200m, 19.02% profit
    on cost (below the 20% target), residual land R8.62m. Rental case NOI
    R21.318m, yield on cost 12.69%.
  - **Policy:** sets the contract form, and a project consultant RFQ
    defaults to its 70/30 split.
  - **Project RFQ:** the QS quotes through the vendor portal, is awarded,
    joins the Team as `QUANTITY_SURVEYOR`, and the RFQ stays out of the
    works/supply list.
  - **Meetings:** invites notify, empty minutes are refused, action items
    become tasks, and issuing marks the meeting held.
  - **Programme:** 8 chained activities dated by CPM; it can't be
    generated twice.
  - **Tracker:** auto and manual items as expected; unknown codes rejected.
  - **Gate:** blocked while documents are outstanding, opens once all
    seven are approved, blocks the decision again after a reopen, then
    moves the project into `CONCEPT` once re-approved.
- **Browser (Playwright, Development Manager + client):**
  - The Development Manager prepares every document through the UI and
    submits all seven.
  - Runs an initiation meeting with attendance and issued minutes.
  - The client sees seven items in Approvals and approves them all; the
    gate shows open.
  - The tracker shows evidence and a manual sign-off with its note.
  - Dark mode works, there's no sideways scroll at 390px on the Inception
    and Meetings tabs, and there were zero browser console errors.

### 2.13a Stage 1 for the consultants — Architect, QS and engineers

§2.13 built Stage 1 around Setjeka's Development Manager and Project
Manager. This section covers how the appointed consultants work through
their own PROCSA Stage 1 lists: the Architect, Quantity Surveyor, and
the Structural, Civil, Electrical and Mechanical Engineers. It also
closes three access gaps the consultants had.

**My Stage 1 (Inception tab → Overview → My Stage 1)**
- Consultants (EXTERNAL accounts) land on this section. It lists the
  caller's own PROCSA items, from `GET /projects/:id/inception/my-role`.
  Each item opens the form that completes it, so nothing has to be found
  across other sections:

  | Evidence kind | Inline action |
  |---|---|
  | `briefInput` (1.1) | Post input on the brief; it's stored as a `PROJECT_BRIEF` comment |
  | `attendedInitiationMeeting` | Your invited initiation meetings and your attendance |
  | `advice` | An advice form for the topic. Where PROCSA allows it, also a quick form to log a site constraint, recommend an investigation, recommend a service, or set a design criterion |
  | `ownScope` | Edit your own firm's scope and roles & responsibilities |
  | `ownAgreementSigned` | Points to the "Your appointment" card |
  | `informationOwned` | Add a row to the information register |
  | `informationShared` | Link to Documents & transmittals |

- **"Your appointment" card.** It shows your firm's terms and its
  agreement status. Once Setjeka has issued the agreement, you can
  **Accept and sign** it here. The card shows for every appointed firm,
  because PROCSA gives the Architect no "conclude the agreement" item but
  the firm still signs one.
- Internal staff see their own list (DM / PM). A member with no PROCSA
  Stage 1 list is pointed to Responsibilities by role.

**Endpoints**

| Route | Permission | Rule |
|---|---|---|
| `GET inception/my-role` | PROJECT_DEFINITION VIEW | Returns your PROCSA items with `evidenceRule`, your own firm's appointments, and your invited meetings |
| `PATCH inception/my-appointments/:id` | PROJECT_DEFINITION COMMENT | Your own firm only (otherwise 404). Refused once the agreement is SIGNED. Reopens the Professional Team deliverable |
| `POST inception/my-appointments/:id/sign` | PROJECT_DEFINITION COMMENT | Only from ISSUED; sets SIGNED with the date |

**Financial design criteria (QS 1.8 · engineers 1.9)**
- A new `DesignCriterion` register (Supporting → Financial design
  criteria) with fields: category, description, value, unit, and
  raised-by.
- Each role ticks its own item. A criterion raised by one consultant
  evidences that consultant's item only, so an engineer's criterion
  doesn't tick the QS's 1.8. Written advice on the topic still counts as
  before.

**Access fixes**
- **Consultant permissions.** The five consultant roles (Architect;
  Structural, Civil, Electrical and Mechanical Engineer) had full access,
  including awarding procurement and editing the team and fees. They now
  have:
  - VIEW and COMMENT everywhere;
  - CREATE and EDIT on tasks, issues, risks, documents, transmittals,
    RFIs, submittals, project definition and meetings;
  - APPROVE on RFIs and submittals;
  - nothing else (no DELETE, no TEAM, PROCUREMENT or financial edits).

  The migration `20261001170000_stage1_consultants` sets this, and
  `seed.ts` matches. `QUANTITY_SURVEYOR` and the legacy
  `ARCHITECT_ENGINEER` keep full access, because the QS is often
  in-house.
- **Consultant RFQ rankings** show every bidder's fee, so
  `/projects/:id/consultant-rfqs` is now internal-only.
- **Fee redaction.** For external callers, `professional-team` hides
  other firms' fee value, fee %, fee basis, rank, score and award
  justification. Deliverable history no longer returns the approval
  snapshot, which held every firm's fee.
- **Setjeka-only actions.** Submitting a document to the client, saving
  the procurement policy, and generating the initiation programme are
  internal-only (`InternalOnlyGuard`). The UI hides those buttons from
  consultants. Clients still see Approve / Request revision.
- **Accepted trade-off.** Consultants keep PROJECT_DEFINITION EDIT, so
  they can edit the brief, because PROCSA has them "assist in developing"
  it.

**Verified** with two throwaway scripts (deleted afterwards, all test
data removed):
- **API (40 checks):**
  - **my-role:** the architect sees only their own firm's appointment.
  - **Redaction:** other firms' fees, rank and justification are hidden
    from the architect and the QS. Staff see everything.
  - **403s for the architect:** consultant RFQs, team terms, submit,
    policy, programme, and deleting register rows.
  - **Another firm's appointment:** 404.
  - **Scope and signing:** scope saves and ticks the item; signing a
    DRAFTED agreement → 400; once issued, signing works; afterwards both
    re-signing and scope edits → 400.
  - **Brief input** ticks 1.1.
  - **Design criteria:** a criterion without a description → 400. The
    engineer's criterion ticks engineer 1.9 but not QS 1.8, and the QS's
    own criterion ticks it.
- **Browser (Playwright, 14 checks, architect + structural engineer):**
  - The architect lands on My Stage 1. Posting brief input ticks 1.1.
  - The scope is saved from the item, and the issued agreement is signed
    from "Your appointment".
  - Professional team shows the architect's own fee but not the rival
    firm's, with no RFQ card and no edit-terms buttons.
  - Sign-off has no Submit button, and the policy is read-only.
  - The engineer adds a criterion from 1.9, which ticks it, and the
    criterion appears in the Financial design criteria register.
  - There's no sideways scroll at 390px, and there were zero console
    errors.

### 2.14 Commercial — cost database, estimates (automated QS), budget, variations, invoices

Register COM (Commercial Management) and Meeting 002 decisions 2.4, 2.5,
2.8 and 2.12, plus Meeting 3 §5 ("budget against actual, variance, and
change orders" in this release). The user extended the scope as follows:

- **Regional cost database.** A cost database of construction materials,
  workmanship and other inputs, priced per region. Setjeka enters the
  prices herself and stores them under the region's title, e.g. Nigeria
  — Lagos.
- **Starts empty.** The user said "it would be blank for now". Only the
  structure ships, plus 18 standard cost codes, which are budget
  headings, not prices.
- **Automated QS.** The system works out quantities (blocks, cement and
  so on) from build-ups, by hand or from BIM/CAD models.
- **Prices from awarded RFQs.** An awarded RFQ updates the region's
  price sheet. Only the awarded quote does, never quotes that didn't win.
- **AI estimating not built.** Setjeka's local AI model running the rough
  estimate is noted for later and not built here.

Monitoring only: the QS keeps the cost system of record (Meeting 002,
2.4).

**Cost database** (`/cost-database`, internal only, `cost-database/`)

| Model | What |
|---|---|
| `CostRegion` | A titled region with its currency. All prices belong to one |
| `CostResource` | A material / labour / plant / subcontract / other input with its unit, e.g. "Cement OPC 42.5, 50 kg" per bag |
| `ResourcePrice` + `ResourcePriceHistory` | Price per resource per region. Every change keeps a history row (previous rate, source, who, and the RFQ if it came from one) |
| `WorkItem` + `WorkItemComponent` | A unit of measured work and its build-up: resource × quantity per unit + waste %. Optional cost code, model takeoff basis (area / volume / length / count) and keywords for matching model elements |
| `CostCode` | Standard cost codes. Works 01–13, professional fees 20, owner supply 30, overheads 40–42 |
| `FxRate` | Recorded exchange rates. The latest on or before the date is used, and the inverse pair also works |

- **Pricing.** A work item's rate in a region is
  `Σ quantity × (1 + waste%) × regional price` (`cost-database/pricing.ts`).
  It's computed at read time, so a price change flows into every item.
- **Missing prices.** Unpriced components count as zero and are listed by
  name.
- **Bulk saves.** The price sheet saves many prices in one call
  (`PUT /cost-regions/:id/prices`) and only writes prices that changed.
- **Deleting.** Regions, resources and work items that are in use can't
  be deleted; deactivate them instead.

**Estimates** (`/estimates`, internal only, `estimates/`)

- An `Estimate` can belong to a project, an opportunity, or neither (a
  standalone rough estimate). It's priced in one region and its currency.
- **Lines** are a work item × quantity, a single resource × quantity, or a
  lump sum. Each has a cost code and an optional rate override.
- **Markups** are applied in QS order:
  1. works;
  2. preliminaries % of works;
  3. overheads & profit % of works + preliminaries;
  4. contingency % of all the above;
  5. VAT.

  Cost per m² comes from the gross floor area.
- **Material & labour schedule.** Every build-up is multiplied out by its
  line quantity: blocks, bags of cement, m³ of sand, hours per trade.
  Quantities still multiply out when a rate is overridden.
- **Finalise** freezes each line's rate and build-up (`frozenBreakdown`),
  so later price changes don't move a final estimate. **Reopen** returns
  it to live prices.
- **Adopt as project budget** works only from a final estimate, in the
  project's currency, with every line coded, while the budget is
  unlocked.
  - Works go in by cost code, with overheads & profit spread pro rata.
  - Preliminaries go on code 01.
  - The estimate's contingency becomes the budget contingency.
  - VAT is left out.
- **Cost from BIM / CAD** (`ModelTakeoff`). An uploaded IFC, RVT, RFA,
  DWG, DGN or DXF file goes to the converter microservice (§4), which
  returns quantities grouped by category and type: count, area, volume,
  length. The grouped result is stored.
  - Each model type is suggested work items whose keywords match it.
  - The user picks the work item, the basis and a factor (e.g. × 2 to
    plaster both faces).
  - The chosen rows become `MODEL` lines, quantity × factor, with the
    model group as their source.
  - Backend env: `CONVERTER_URL` and `CONVERTER_INTERNAL_TOKEN`.
  - When the converter isn't running, uploads fail with a clear message.

**RFQ → award → price sheet** (`rfqs/`)

- A works/supply RFQ can be tagged with a cost region (`Rfq.costRegionId`).
- **Items.** It carries priced items (`RfqItem`), which are linked to
  cost-database resources or free text. Items are fixed once the RFQ is
  issued.
- **Quotes.** Vendors, in the vendor portal or the project tab, or staff
  recording a paper or email quote, give a unit rate per item
  (`QuoteItem`). Every item needs a rate, and the quote's price is the
  extended total.
- **Award** (new): `POST /projects/:id/rfqs/:rfqId/award` marks the
  winning quote. When the RFQ has a region, it then writes that quote's
  item rates into the region's price sheet.
  - The price source is recorded as "RFQ-2026-0001 · firm", and the
    history row links the RFQ.
  - Quotes in another currency are converted with the recorded FX rates.
  - Unlinked items, or items with no exchange rate, are skipped and named.
- **Price sheets only ever take rates from the awarded quote.**
  `POST …/update-prices` re-applies the awarded rates (e.g. after adding
  a missing exchange rate). It's refused before award.
- **Who can do it.** Items, award and the price update are internal-only.
  Vendors hold PROCUREMENT edit only so they can quote.

**Project commercial** (project → **Commercial** tab,
`/projects/:id/commercial/...`, new `COMMERCIAL` permission module)

- **Budget & contingency.**
  - `BudgetLine` by cost code.
  - `ProjectBudget` holds the contingency (guide = the project's
    contingency %).
  - Locking makes it the approved baseline; changes then come only
    through variations.
- **Variations** (`Variation`, `VariationEvent`), numbered VO-001, VO-002
  and so on per project.
  - Raised with a reason, value (negative for an omission), time impact,
    cost code and optional RFI.
  - The QS records an assessed value.
  - Setjeka sends it to the client, and client members are notified.
  - The client approves or rejects; a rejection needs a reason.
  - **Client-only approval** (Meeting 3 hard rule): the service requires
    the caller to be an EXTERNAL account with a CLIENT membership on the
    project, regardless of the permission matrix or the Admin bypass.
  - Approved values draw down the contingency, and omissions return to
    it.
  - Variations appear in the client's Approval Center and have their own
    comment thread.
- **Supplier invoices** (`SupplierInvoice`) are recorded against approved
  or issued POs, in the PO's currency.
  - An invoice that would take the PO past its value is refused, as is a
    duplicate invoice number per PO.
  - Approval must come from someone other than the recorder.
  - Then the invoice is marked paid with a reference.
  - Each order shows invoiced, paid, owed now and left to invoice.
- **Cost report** (`GET …/commercial/summary`), by cost code, in the
  project's currency:
  - budget;
  - approved variations;
  - revised budget;
  - committed: approved/issued POs (new `PurchaseOrder.budgetCodeId`)
    plus appointment fees, counting an appointment's value only when it
    has no POs under it, with consultant fees on code 20;
  - invoiced and paid: supplier invoices plus appointment payments;
  - forecast final: max(revised, committed);
  - variance.

  Contingency: original, drawn, remaining, and the pending exposure from
  submitted variations. Amounts in a currency with no recorded FX rate
  are listed in `missingFx` rather than added.
- **Access.**
  - Setjeka delivery roles: everything except APPROVE.
  - CLIENT: view, comment, approve.
  - Consultants, contractors and other: nothing.

  The client's Commercial tab shows Variations and the Cost report.

**Also in this build**

- **Currencies.** NGN, EUR, GBP, BWP, NAD, KES and GHS were added. All
  currency pickers use one list (`CURRENCY_OPTIONS`).
- **Opportunities.** The Business case tab links to estimates for the
  opportunity.
- **Navigation.** A new **Commercial** menu (internal): Cost database,
  Estimates, Project commercials.

**Migrations:**
- `20261003100000_commercial` (schema, currencies, enums).
- `…100100_commercial_data` (COMMERCIAL permission defaults and the 18
  cost codes; separate, because a new enum value can't be used in the
  same transaction).
- `20261003110000_rfq_items`.

`seed.ts` matches.

**Deliberately not building, and why**

| Deferred | Why |
|---|---|
| Seeded prices or build-ups | The user asked for a blank database for Setjeka to fill |
| AI-generated rough estimates | Noted for Setjeka's local AI model; not part of this build |
| Payment certificates, retention, claims (register COM rows) | Scope-of-work decision 4 (who issues payment certificates) is still open; invoices against orders cover the meeting's ask |
| Exchange-rate feeds | Rates are recorded by hand; no provider chosen |
| PDF / Excel export of estimates | CSV export is built; the formatted report formats are the Reporting item on the roadmap |
| Drawing the model in 3D | The takeoff reads quantities only; the BIM viewer is a separate register section |

**Verified** with two throwaway scripts (deleted afterwards, all test
data removed):
- **API (82 checks):**
  - **Cost database:**
    - region and resource uniqueness;
    - price-sheet saves rewrite only changed prices, with history;
    - work-item rate 13 643 = 8 400 + 3 150 + 968 + 1 125, with the
      unpriced labourer flagged.
  - **Estimate:**
    - works 2 637 160; prelims, overheads & profit, contingency and VAT
      to the cent; 33 505.12 per m²;
    - schedule of 1 260 blocks, 87.8 bags, 5.28 m³ and 108 h;
    - finalise freezes the rates, reopen follows live prices;
    - adopting is refused while a line is uncoded, then the budget
      reconciles.
  - **DXF:** priced at length × 3 m; a basis with no quantity is refused.
  - **IFC** (real DDC export of the sample model): every wall type
    suggests the wall work item.
  - **Variations:**
    - VO-001 assessed and sent;
    - the client is notified and it's in their Approvals;
    - the Development Manager and an Admin both get 403;
    - a rejection needs a reason;
    - the client approves;
    - an omission returns to contingency (drawn 130 000), with pending
      exposure shown.
  - **Invoices:**
    - refused on a draft PO, when over-invoicing, and for a duplicate
      number;
    - the recorder can't approve, and it can't be paid before approval.
  - **FX:** a USD PO is first listed as a missing rate, then converted
    at 1 500.
  - **RFQ:**
    - a missing item rate is refused;
    - the vendor portal shows the itemised quote;
    - staff can record one;
    - the sheet doesn't change before award, and re-applying before
      award is refused;
    - the vendor can't award;
    - the award writes 9 000, skips and names the free-text diesel, and
      the history traces the RFQ;
    - the vendor sees the award;
    - a second award is refused.
  - **Access:** the vendor gets 403 on the cost database, estimates and
    the cost report; the client can read the cost report.
- **Browser (Playwright, 13 checks):**
  - Region, three prices saved together, and a work item built with a
    live rate preview (12 675).
  - Estimate line 1 521 000; schedule of 1 260 blocks; DXF uploaded;
    finalised and adopted.
  - Budget locked; variation raised and sent; the client approves it on
    a 390 px phone with no sideways scroll.
  - RFQ with a region and a database-linked item: quote recorded,
    awarded, and the Lagos sheet updated to 9 200.
  - Zero console errors.
  - The run found and fixed one bug: a quote recorded before the RFQ's
    region was chosen defaulted to ZAR instead of the region's currency.
    Quotes (staff and vendor portal) now default to the region's
    currency.

### 2.15 Client decisions, notes & actions, and the client portal

Built on 2026-10-03 from the user's direction after the roadmap review:
- the client alone approves Stage 1 documents;
- Stage 0 is run by both the Development Manager and the Project Manager;
- Stage 0 consultant picks are indicative, as the client described;
- notes → actions, to be used wherever notes are needed from now on;
- the client portal.

Document numbering was deliberately left for later.

**Fixes to match the client's decisions (Meeting 3)**

| Decision | What changed |
|---|---|
| Only the client approves; Setjeka never approves on the client's behalf | Stage 1 documents: APPROVE removed from every role but CLIENT (migration `…120000_client_only_stage1_approval`, `seed.ts`). The service also requires an EXTERNAL CLIENT member, the same rule as variations (§2.14). Only clients see Approve / Request revision, and the item is only in a client's Approval Center |
| Stage 0 is operated by the Project Manager as well as the Development Manager | The Stage 0 tracker role is "Development Manager / Project Manager" |
| Stage 0 vendor selection is indicative only and not binding | See below |

**Indicative Stage 0 picks.**
- **At Stage 0.** The opportunity's Consultants tab reads "Indicative professional team", with **Select** rather than **Appoint**.
- **On conversion.** Each pick becomes an `OrganisationProjectAppointment` with status **PROPOSED**. The firm is not added to the team, its fee is not counted as committed, and the required service shows as "Indicative (Stage 0)" rather than covered.
- **Stage 1 readiness** counts only firm appointments.
- **At Inception**, Setjeka uses Professional team:
  - **Confirm appointment** → APPOINTED, and the firm and its logins join the team;
  - **Release** → TERMINATED, and the discipline can be appointed by a consultant RFQ instead.
- **Endpoints:** `POST inception/appointments/:id/confirm` and `POST inception/appointments/:id/release` (internal only).

**Notes & actions** (Meeting 3 §2.4, replacing "messaging", which is
explicitly not chat)
- **Model.** The existing `Comment` threads are now notes. A note can be addressed to a named person (`recipientId`). Ticking **Make it an action** gives it a due date, a priority and an OPEN / DONE status.
- **Alerts.** The person is alerted with `ACTION_ASSIGNED` or `NOTE_FOR_YOU`, and the author gets `ACTION_COMPLETED`. Open actions due within two days raise a due-soon reminder.
- **Where notes appear.** On tasks, issues, risks, RFIs, submittals, document revisions, schedule activities, meetings, variations and the brief (everywhere a thread already was). Also new: **Project notes** on the project's Actions tab, and **Notes & actions** on an opportunity's Overview.
  - Before a project exists, notes belong to the opportunity: `Comment.projectId` is now optional, plus `opportunityId`, with a CHECK that a note has exactly one owner.
  - Opportunity notes are internal-only.
- **Who a note can go to.** Project members with a login, plus internal staff. A note to someone outside the project is refused.
- **My Day** (`/my-day`, `GET /me/actions`) shows:
  - actions for me, open first, plus those done in the last fortnight;
  - plain notes for me until I acknowledge them ("Got it");
  - project tasks assigned to me, including meeting actions.
- **Action register** — a new project **Actions** tab (`GET /projects/:id/actions`): note actions on any record plus meeting action items, with owner, due date, priority, source link, and open / overdue / done counts.
- **Meetings.** Each meeting shows **open actions brought forward** from earlier meetings.
- **Notifications** carry a deep `link` (`notifications/links.ts`), so the bell opens the record itself. `Notification.projectId` is optional for opportunity notes. The bell now also shows on phones.
- **From now on** (the user's instruction), new modules should include notes wherever a record benefits from them.

**Client portal** (register CLI; scope §4.9; mobile first)
- **Landing.** Client logins land on **/portal** (*Portal → My Projects*). It lists their projects with stage, completion, programme % and decisions waiting, plus their Stage 0 developments.
- **Project page** (`/portal/projects/:id`, `GET /client-portal/projects/:id`), from top to bottom:
  - a stage stepper, then completion date, programme % and budget drawn;
  - **Waiting for your decision**: stage-gate move, variations (value, time impact) and Stage 1 documents. Each has Approve, or reject / request changes with a reason, using the same client-only endpoints;
  - notes and actions from Setjeka;
  - programme (progress, coming up);
  - milestones;
  - budget (approved, variations, current, paid, forecast, contingency left);
  - **documents & drawings** shared with the client;
  - meetings they're invited to, with issued minutes;
  - **Your decisions**, each recorded with name and time;
  - the project team (no fees);
  - a note thread to leave Setjeka a note.
- **Setjeka controls what the client sees.** Documents have a **Visible to the client** switch (`ProjectDocument.clientVisible`, off by default). For a CLIENT member, the documents API lists only visible documents and refuses to download others (404).
- **Scoping.** Everything is scoped to projects where the caller is a CLIENT member, re-read on every request. Another client gets 404; staff and consultants get 403.
- **Links.** Approval and notification links for clients open their portal page (`lib/portal.ts`).

**Not built yet:** site photographs (no photo module yet), a project-scoped sign-in address and access codes expiring at final account (scope §4.9), milestone and payment-certificate approvals, and email alerts (still waiting for the client's sending domain).

**Migrations:**
- `20261003120000_client_only_stage1_approval`
- `20261003130000_notes_actions`
- `20261003140000_client_visible_documents`

**Verified** with two throwaway scripts (deleted afterwards, all test
data removed):
- **API (53 checks):**
  - **Indicative picks:**
    - the tracker label reads Development Manager / Project Manager;
    - converting a real opportunity gives PROPOSED appointments, not on the team, shown as indicative, fees not committed;
    - a consultant can't confirm their own pick (403);
    - confirming adds the firm and its login; release works, and a released pick can't be confirmed;
    - the confirmed fee is then committed.
  - **Client-only Stage 1 approval:** not in the Development Manager's queue, in the client's; the Development Manager and an Admin get 403; the portal shows the submission note; the client approves.
  - **Notes and actions:**
    - an action with a deep-link alert;
    - an action without a person, or a note to an outsider, is refused;
    - it appears in My Day with its context, with a due-soon reminder;
    - nobody else can tick it off; the assignee completes it and the author is told;
    - a consultant's plain note reaches the client's dashboard and portal and clears on acknowledge;
    - the register merges note and meeting actions (1 open, 1 done);
    - opportunity actions reach the Executive's My Day and stay internal.
  - **Portal:**
    - shared vs unshared documents, including a 404 on download;
    - projects list with one decision waiting and programme 50%;
    - budget committed, variation with time impact, team without fees, decision history with name;
    - variation approved from the portal;
    - another client 404, staff and consultants 403.
- **Browser (Playwright, 12 checks):** desktop for Setjeka, a 390 px phone for the client.
  - **Setjeka:** the tracker label; confirming the indicative architect; giving an action from the Actions tab; the register; sharing a site plan; sending a variation and a note to the client.
  - **Project Manager:** completes the action from My Day.
  - **Client:**
    - lands on the portal;
    - approves the variation;
    - acknowledges the note;
    - opens the shared site plan;
    - sees the decision recorded with their name.
  - No sideways scroll and zero console errors.
  - The run caught two copy issues, both fixed: the services card claimed "covered" while a pick was only indicative, and My Day repeated the project name.

### 2.16 Site photos and in-app notifications

Built on 2026-10-04. The user asked for the site photos module and better
in-app notifications and alerts. **Email alerts** and **document numbering**
are deliberately on hold. Document numbering is held because the scheme
reaches everyone from the client to the contractors.

**Site photos** (register FIELD "Site photo capture")
- **Model.** `SitePhoto`: the stored file plus an optional small preview; caption; `takenAt`; latitude/longitude; "where on site" text; tags; `clientVisible`. It can link to one issue, task, programme activity and project area. Migrations `20261004100000_site_photos` and `…100100_site_photos_data`.
- **Taken on a phone.** A **Take photo** button opens the rear camera, and **Add photos** picks several from the gallery (on a desktop you can also drag photos in). Before upload, the device:
  - reads the camera's own date and GPS (`exifr`);
  - shrinks the photo to 2560 px on the long edge, keeping the original when that is already smaller;
  - makes a 480 px preview.
  
  A future date from a wrong phone clock is clamped to now. If a photo has no GPS of its own, the uploader can use the device's current location instead.
- **One sheet per batch.** Each photo gets its own caption. Where on site, the links and the tags apply to the whole batch, and Setjeka can share the batch with the client straight away.
- **Gallery.** Project tab **Site photos** (also in the nav), grouped by the day the photos were taken.
  - **Search** covers captions, places, tags, file names, who took them and the titles of linked records.
  - **Filters:** date range, linked record, and shared or not.
  - Tiles show note counts and, for Setjeka staff, whether a photo is shared.
- **Viewer.** Full image, date and time, who took it, a map link, tags, links to the related records, download, edit and delete. It also has the photo's **notes** (`CommentEntityType.SITE_PHOTO`). Arrow keys move between photos.
- **Linked both ways.** Issue and task details have a "Site photos of this issue/task" link to the filtered gallery (`?tab=photos&issue=…`).
- **Who can do what** (`SITE_PHOTOS` permission module):

  | Who | Rights |
  |---|---|
  | Setjeka delivery roles | Everything |
  | Consultants and contractors | View, add, comment, and edit or delete **their own** photos (enforced in `SitePhotosService`) |
  | Client and Other | View and comment |
  | Setjeka only | Decides what the client sees, one photo at a time or by selecting several |

- **Client portal.** The project page has a **Site photos** section showing only shared photos, with read-only details and notes. Unshared photos return 404 for a client, including their files.
- **Alerts** *(removed on 2026-10-25, §2.17 — uploads no longer send alerts)*.
  - **Linked to an issue or task:** a photo alerts that record's owner, or the task's assignee. Repeat uploads fold into one unread alert.
  - **Shared with the client:** the client gets one "New site photos from <project>" alert per batch, which opens the portal's photos section.
- **Storage.** Files go under `PHOTO_UPLOAD_DIR` (default `./uploads/site-photos`), up to 25 MB each, in .jpg, .png, .webp or .heic. HEIC previews only in Safari; other browsers offer the download.

**In-app notifications & alerts** (no email)
- **Categories** (`notifications/categories.ts`, mirrored in `lib/notifications.ts`): Approvals, Notes & actions, Assignments, Due soon. *(Meetings and Site photos were removed on 2026-10-25, §2.17.)*
- **Notifications page** (`/notifications`, under Overview):
  - filter by kind, by project and to unread only;
  - entries grouped Today / Yesterday / This week / Earlier;
  - mark read or unread, and mark all read.
- **Alert settings.** Each person can switch off any category except **Approvals**, which is always on so the client's decisions can't be missed. The setting is stored on `User.mutedAlertCategories` and checked in `NotificationsService.notify`.
- **Bell.**
  - Category icons and the project name on each entry, plus "See all notifications".
  - It checks every 30 s while the tab is visible and immediately when you return to it. It also refreshes at once when the page marks something read.
  - The unread count shows in the browser tab title.
  - **Pop-up alert:** anything that arrives while you're working appears briefly at the top of the screen.
- **Folding repeats.** `notify({ collapse: true })` refreshes an existing unread alert for the same record instead of stacking another.
- **Due-soon reminders can now be read.** They are still computed on read, since there is no scheduler. Reading one, or marking all read, stores it as read for the day, so it no longer shows as new until the next day's reminder. Action reminders are keyed by the note, so two actions on one record are dismissed separately.
- **API:**
  - `GET /notifications?category=&unread=1&projectId=`;
  - `PATCH /notifications/:id/unread`;
  - `GET|PUT /notifications/preferences`.

**Production fixes found on the way**
- **Uploads were lost on rebuild.** Project documents and photos were written inside the backend container. `docker-compose.prod.yml` now puts them on named volumes (`project_documents`, `site_photos`) via `DOCUMENT_UPLOAD_DIR` and `PHOTO_UPLOAD_DIR`. **Before the first redeploy with this change**, copy the files already uploaded on the server out of the old container and into the new volume.
- **Location was blocked.** nginx's `Permissions-Policy` had `geolocation=()`, which would have blocked "use my current location". It is now `geolocation=(self)`. The phone camera opens through a file input, which the policy doesn't govern.
- **Uploads were capped too low.** nginx's body limit was raised from 25 MB to 30 MB. Estimate model take-offs (up to 200 MB in the backend) get their own 210 MB location; the old 25 MB cap would have rejected most models.

**Verified**
- **API, 54 checks:**
  - **Uploads:** upload and links; tag clean-up; camera date kept and a future date clamped; preview stored or absent; links outside the project and non-photo files refused.
  - **Contractors:** they can add photos and edit or delete their own, but not others', and cannot share.
  - **Alerts:** the issue owner and the task assignee are alerted, with repeats folded together.
  - **Client:** sees nothing until a photo is shared, then only shared photos; gets one alert; cannot upload or edit. Their note reaches the PM with a link to that photo.
  - **Search and filters:** every search field and filter.
  - **Notification settings:** six categories, with Approvals locked; a muted category stays quiet.
  - **Notification list:** category and project filters; read and unread; reading a due-soon reminder dismisses it, as does mark all read.
  - **Delete** removes the photo's notes and files.
- **Browser (Playwright, 27 checks):** Setjeka on desktop; the client and Setjeka on a 390 px phone, with Setjeka also in dark mode.
  - **Setjeka:** upload sheet; thumbnails; viewer with full image, issue link, sharing state and a note; arrow keys; search; bulk stop-sharing; alert settings.
  - **Client:** the bell alert opens `/portal/projects/:id#photos`; only shared photos are shown, with no upload, edit or share controls, and Setjeka's note is visible.
  - **Setjeka on a phone:** Take photo opens the rear camera.
  - No sideways scroll and no script errors.
- **Problems the run caught, all fixed:**
  - the upload sheet's previews were revoked by React's development double-mount;
  - the chat launcher sat on top of the photo viewer's Post button;
  - the filter dropdowns were unstyled.


### 2.17 App Review fixes — due soon, site weather, land the client already owns

Built on 2026-10-25 from the 17 Oct App Review (Meeting notes `Setjeka_App_Review_2026-10-17`) and the user's corrections of 25 Oct.

- **Due soon covers milestones too.** The earlier "milestones are not actions" split was a mistake. Due-soon reminders now look **three days ahead** (`DUE_SOON_WINDOW_DAYS = 3`) across actions, programme milestones and stage deliverables.
  - A milestone reminder goes to the project's Development Manager and Project Manager; before a project exists (Stage 0) it goes to the opportunity owner.
- **Alert settings trimmed.** The categories are now Approvals, Notes & actions, Assignments and Due soon. **Meetings** and **Site photos** are gone from the settings; a scheduled meeting counts as an assignment. **No alert is sent when site photos are uploaded.** Migration `20261025100100_alert_categories_trim` removes the two old categories from everyone's muted list.
- **Site weather history.** `SiteWeatherDay` keeps one row per project per day: conditions, high/low, rain and wind.
  - A recorder runs every 3 hours for every project with coordinates. Turn it off with `SITE_WEATHER_RECORDING=off`.
  - The last 14 days come from Open-Meteo's forecast API, older days from its archive API; the forecast API returns older past days partly empty. Days the archive hasn't caught up on are skipped and filled on a later run.
  - `GET /projects/:id/weather?from=&to=`; `POST /projects/:id/weather/refresh` (Setjeka only).
  - Shown on the project Overview as **Site weather history**, and as a sheet in the Excel report.
- **Land the client already owns.** Stage 0 site register: **Client already owns the land** (`LandAcquisitionStatus.CLIENT_OWNED`). The site **is still registered** — address, erf, extent, zoning and so on — but the price fields are hidden. Saving it marks the site as the selected site and ticks the *Site secured* milestone. `CLIENT_OWNED` counts as secured wherever the app checks for that.
- **Stage 0 owners.** The Development Manager and the Project Manager both own Stage 0.
- **No dummy project.** None was created; the user asked for none.
- Migration `20261025100000_weather_and_owned_land`.

### 2.18 Approvals — four responses, response deadlines and e-signature

- **Four responses** everywhere the client decides — stage deliverables, variations, stage transitions and document revisions:

  | Response | Comment |
  |---|---|
  | Approved | optional |
  | Approved with comments | required |
  | Rejected | optional |
  | Rejected with comments | required |

  Stored as `decisionOutcome` (`ApprovalOutcome`). The old `approve: true/false` still works for older callers.
- **Response deadline.** Whoever submits sets the date the client must respond by (`responseDueAt`). A bare date means the end of that South African day; a past date is refused.
  - The Approvals page sorts by deadline and shows overdue items first.
  - Reminders `APPROVAL_DUE` (within 3 days) and `APPROVAL_OVERDUE` go to the client and can't be muted.
- **Signing the decision.** The approver chooses one of three ways:
  1. **Accept** — tick to confirm, no signature (`SignatureMethod.ACCEPTANCE`);
  2. **Type** the name, drawn in a handwriting font (`TYPED`);
  3. **Draw** on screen, or **upload** an image of the signature (`DRAWN` / `UPLOADED`).

  A signature can be saved under **My signature** (`/account/signature`, `UserSignature`) and reused.
- **Signed copies.** Each decision writes an `ApprovalRecord`: who, outcome, comment, method, signature image, IP address and browser, a SHA-256 of the signed file, and a snapshot of the facts decided (`facts.ts`).
  - For a PDF, the system stamps the signature and the decision on the top right of page 1 and adds a certificate page (`pdf.ts`, pdf-lib).
  - For anything else, it produces a certificate on its own.
  - The signed copies are listed under the record and in `GET /projects/:id/approval-records`, and stored under `SIGNOFF_DIR` (a named volume in production).
- **Documents can go to the client for approval** (`DocumentApprovalRequest`). From a document's detail panel, Setjeka sends a revision to the client with a deadline, and can withdraw it. Only an external user with the project's CLIENT role decides. The decision is recorded against that exact revision.
- **Who sees what.** Contractors and consultants see the records only for document revisions and stage transitions, never for variations or fee deliverables.
- **API:**
  - `GET|PUT|DELETE /me/signature`;
  - `GET /projects/:id/approval-records?subject=&subjectId=`, `GET …/approval-records/:id/signed`;
  - `POST /projects/:id/documents/:documentId/revisions/:revisionId/client-approval`; `GET /projects/:id/document-approvals`, `POST …/document-approvals/:id/withdraw`, `POST …/document-approvals/:id/decide`.
- The Express JSON body limit is raised to 2 MB in `main.ts` so a signature image fits.
- **Still open:** whether the ECT Act calls for an *advanced* electronic signature for any of these. The user has not yet decided that.
- Migration `20261025110000_signoff_and_deadlines`. It backfills the outcome on existing decisions.

### 2.19 PROCSA tracker and delivery registers — Stages 0 to 6

The user asked us to cover the Development Manager and Project Manager responsibilities in PROCSA from Stage 0 to close-out.

- **PROCSA tracker** (project tab **PROCSA**, nav *PROCSA tracker*). Lists every DM and PM responsibility, stage by stage, with its PROCSA reference.
  - **Stage 0** comes from the opportunity (§2.12a) and **Stage 1** from Inception (§2.13).
  - **Stages 2–6** are defined in `delivery/procsa-delivery.ts`:

    | Stage | DM items | PM items |
    |---|---|---|
    | 2 Concept & Viability | 5 | 8 |
    | 3 Design Development | 15 | 8 |
    | 4 Documentation & Procurement | 13 | 7 |
    | 5 Construction | 14 | 18 |
    | 6 Close-out | 10 | 8 |

  - **Items tick themselves** where the evidence is on the platform: a stage deliverable approved, a register entry recorded, a report generated, a programme baselined, and so on (`ProcsaService.evidenceFor`). Each item shows what ticked it.
  - Items with no record behind them are ticked by hand, with a note and the person and date kept (`setCheck`).
- **Delivery registers** (project tab **Registers**). Twelve registers share one table, `ProjectRegisterEntry`, with generic columns; each register's fields are defined in `delivery/registers.ts`:
  - project procedures; project finance; cash flow; sales and leasing; authority service agreements; insurances;
  - payment certificates; contractual claims; handover and completion certificates; defects; handover documents; final accounts.

  Setjeka staff edit them. Contractors can see the last six only, the ones marked `contractorsSee`. An entry can link a document from Document Control.
- **API:** `GET /projects/:id/procsa`, `PUT /projects/:id/procsa/:stage/:roleKey/:code`; `GET /delivery/registers` (definitions); `GET /projects/:id/delivery-registers`, `GET|POST …/delivery-registers/:key`, `PATCH|DELETE …/delivery-registers/:key/:id`.
- Migration `20261025120000_delivery_registers_reports`.

### 2.20 Reports — PowerPoint, PDF summary, Excel, close-out

Meeting 3 §2.9. Project tab **Reports** (also in the nav). Setjeka staff generate reports and choose which ones the client sees.

| Report | Format | Default period | Content |
|---|---|---|---|
| Progress report | PowerPoint | last 7 days | Ten slides in Setjeka's own report layout (cream/green/gold, Georgia headings): cover, executive summary, status detail, programme, cost report with chart, variations, critical risks, decisions, photo record, priority actions. Fully editable before it goes out. |
| Project summary | PDF | last 7 days | Figures and plain sentences, no tables: headline figures, status cards, this period, looking ahead, risks, client decisions, PROCSA progress, priority actions. |
| Programme and registers | Excel | last 30 days | 13 sheets: summary, programme, milestones, cost report, variations, risks, issues, RFIs, submittals, documents, site weather, and the delivery registers. Internal only — never shared with the client. |
| Close-out report | PDF | whole project | Completion certificates, handover documents, defects, final accounts and claims, cost outcome, variations, PROCSA. Satisfies PM 6.8 and DM 6.9. |

- **Status colours.** Programme, commercial, decisions and risks each get a green/amber/red status with a plain label, e.g. *Behind programme*, *Client decision required* (`report-text.ts`).
- **Client-facing reports leave out internal-only detail**, using the same rules as the portal. Only photos already shared with the client appear.
- **Dates.** Report periods are South African calendar days and are printed in Africa/Johannesburg time, whatever the server's zone.
- **Storage.** Files are kept under `REPORTS_DIR` (a named volume in production), recorded in `ProjectReport`. The client portal has a **Reports** section listing only the shared ones.
- **API:** `GET|POST /projects/:id/reports`, `GET …/reports/:id/file`, `PATCH …/reports/:id` (`clientVisible`), `DELETE …/reports/:id`.
- **Libraries:** `pptxgenjs`, `pdf-lib`, `exceljs`. The logo is `backend/assets/logo.png`, which the Dockerfile copies.

**Verified (2.17–2.20)**
- **API:** fixes 17 checks; approvals and signatures 33; PROCSA and registers 29; reports 20. All pass.
- **Browser (Playwright):**
  - fixes, 5 checks;
  - sign-off, 14 checks, including drawing on the signature pad and the client deciding a document in the portal;
  - PROCSA tracker and registers, 5 checks;
  - the Reports tab: generate, download, share, delete, and a 390 px phone with no sideways scroll.
- **Reports checked visually.** Every slide was rendered through PowerPoint, and both PDFs page by page. Fixed on the way:
  - the dark logo was invisible on the green cover;
  - table headers wrapped;
  - the cost-code column was right-aligned;
  - the PDF figure labels overflowed;
  - the period end showed the next day for South Africa, and the same slip in approval deadlines.


### 2.21 The Architect role — PROCSA Stages 2–6

Built on 2026-10-26. The user asked what to build for the architect, from PROCSA, the meeting notes, the requirements register and OpenConstructionERP, and decided:

- **The instruction chain.** The client reaches the architect only through Setjeka's PM and DM, and all of it is on the platform.
- **Drawing numbers.** Taken from the architect's own drawing sheet. This answers open items 8.11 and 9.1 ("extract").
- **Inspection checklists.** Register QHSE rows 66–67 are built now.

Migrations `20261026100000_architect_role` and `…100100_architect_role_data` (permission defaults and six starter checklists).

**PROCSA tracker: the Architect, Stages 2–6** (`delivery/procsa-delivery.ts`, `procsa.service.ts`)
- All 47 architect items (12 + 8 + 9 + 14 + 4), plus the 8 at Stage 1 from §2.13a, so 55 in total.
- **Items tick from the architect's own records**, not just from anything on the project. The new evidence kinds are:

  | Evidence | What counts |
  |---|---|
  | `drawings` | Revisions with a given purpose of issue, uploaded by the architect |
  | `communications` | Contract instructions drafted by the architect |
  | `inspections` | Inspections the architect carried out |
  | `meetingsAttended` | Meetings where the architect is marked present |
  | `transmittalsByRole` | Transmittals sent from the architect |
  | `consentRounds` | Submissions to an authority, matched by type (e.g. SDP, building plans) |
  | `docProgramme` | Drawings planned on the documentation programme |
  | `drawingRegister` | Numbered drawings issued on a transmittal |

- **Who sees what.** Outside parties see only their own role's list. The client sees none.
- **Sign-off by hand.** Setjeka signs off any item. The architect signs off their own items, with a note.

**Drawing register and documentation programme** (`drawings/`, project tab **Drawings**)
- **Upload drawings** takes several sheets at once. For each PDF, `title-block.ts` (pdfjs-dist) reads page 1:
  - It finds the labels (Drawing No., Rev, Title, Scale, Date, Status / Issued for) and their values, whether beside or beneath the label.
  - Labels nearer the bottom right win, so a revision table elsewhere on the sheet doesn't.
  - With no labelled number, it takes the most number-like token in the title-block corner.
  - With no text at all (a scan), it falls back to the file name.
  - The uploader checks and corrects each row before anything is saved. The register shows whether the number was read from the sheet, taken from the file name, or entered by hand.
- **Revisions attach to the base drawing.** A number already on the register adds a revision, matched case- and separator-blind (`drawingKey`); the same revision twice is refused. The drawing is stored as an ordinary project document (`documentType` "Drawing"), so transmittals, client approval and the portal work as before.
- **Purpose of issue** on each revision (`IssuePurpose`), as Meeting 3 asked: for information, comment, co-ordination, client approval, authority submission, procurement, construction, as built.
- **Register view.** Search, a filter by purpose, revision history with transmittals and the client's decision, and **Export to Excel**.
- **Documentation programme** (`PlannedDrawing`). Each planned drawing has a stage, a purpose and a date. It is matched to the register by number and shows *Planned*, *Due this week*, *Late*, *Issued* or *Issued late*.
- **API:**
  - `GET /projects/:id/drawings`, `GET …/drawings/export`;
  - `POST …/drawings/read` (reads only, keeps nothing), `POST …/drawings` (upload);
  - `PATCH …/drawings/:documentId`, `PATCH …/drawings/:documentId/revisions/:revisionId`;
  - `GET|POST /projects/:id/drawing-programme`, `PUT|DELETE …/drawing-programme/:id`.

**Authority approvals** (`authorities/`, project tab **Authorities**)
- This follows through the Stage 1 schedule of consents (`ConsentApproval`) with each round (`ConsentEvent`): submitted, comments received, resubmitted, approved, refused, note. Each round can carry the document sent or received and the authority's reference.
- The status moves on its own, including the new `RETURNED_WITH_COMMENTS`. The panel shows the number of submissions, days with the authority, and whether the expected decision date has passed.
- **Stage 1 sign-off.** Recording a round never reopens the Stage 1 *Consents schedule* sign-off. Adding or editing a consent reopens it only while the project is still at Inception or earlier.
- There's a list of SA approval types, and notes on each approval.
- **API:** `GET|POST /projects/:id/authorities`, `PATCH …/:id`, `POST …/:id/events`.

**Instructions and letters** (`communications/`, project tab **Instructions**, portal section **Requests and letters**)

| Kind | From → to | Rule |
|---|---|---|
| Client request `CR-` | Client → Setjeka | Always goes to the project's DM and PM; the client can't choose |
| Setjeka instruction `SI-` | Setjeka → consultant or contractor | Can *pass on* a client request or letter |
| Contract instruction `CI-` | Architect (or an engineer) drafts → contractor | Waits as *Waiting for Setjeka to issue*; Setjeka issues it |
| Letter `LT-` | Anyone | Outside parties' letters go to Setjeka only |

- **Receipts.** Each recipient confirms receipt and replies on the record, and the author and issuer are told.
- **Variations.** An issued instruction marked "may cost money" can become a draft variation for the client.
- **What the client sees** of a request passed on: its number, when, and to whom. The client never sees the content.
- **Privacy.** Contractors don't see variation links. The note thread on each instruction or letter is private to its parties: notes can't be addressed to, nor @mentions reach, anyone outside it. The same `canSee` check now also covers inspections (not the client) and unshared site photos (not the client), which were open before.
- **Alerts:** `COMMUNICATION_RECEIVED` (in Approvals, so it can't be muted), `COMMUNICATION_AWAITING_ISSUE`, `COMMUNICATION_ANSWERED`.
- **API:**
  - `GET /projects/:id/communications`, `GET …/communications-address-book`, `GET …/communications/:id`;
  - `POST …/communications`, `PATCH …/:id`;
  - `POST …/:id/send`, `…/issue`, `…/acknowledge`, `…/respond`, `…/close`, `…/cancel`, `…/variation`.

**Inspections and checklists** (`inspections/`, project tab **Inspections**)
- **Kinds:** quality, architect's site inspection, test witnessed, mock-up, practical completion, defects verification.
- **The flow:**
  - The contractor requests an inspection.
  - Setjeka or a consultant schedules the inspector, who is alerted.
  - The inspector marks each item Pass, Fail or N/A, with a note, which works on a phone.
  - Completing it needs every item marked, and a failed item rules out "Conforms".
  - The requester and the DM/PM are told the outcome.
- **Findings.** A failed item becomes an issue with one click, linked both ways. Photos can be taken against the inspection (`SitePhoto.inspectionId`).
- **Checklists.** Company-wide checklists by work type (`InspectionTemplate`). Setjeka edits them on the panel, and editing one never changes an inspection already recorded. Six starters: concrete pre-pour, masonry, waterproofing, roofing, architect's site inspection, practical completion walk-through.
- **API:** `GET|POST /projects/:id/inspections`, `GET|PATCH …/:id`, `POST …/:id/schedule|complete|cancel|issues`; `GET|POST /inspection-templates`, `PUT /inspection-templates/:id`.

**Permissions.** Two new modules:
- `COMMUNICATIONS`: approve means issue, Setjeka roles only; nothing is deleted.
- `INSPECTIONS`: consultants create and edit, contractors only request, the client has nothing.

They're set in the data migration, matched in `seed.ts`, and shown on the Permissions screen. Commercial and Site photos were missing from that screen and have been added too.

**Also fixed.** The site-photo date filter now reads bare dates as South African days.

**Navigation.** A new **Design & site** group: Drawings, Authorities, Instructions, Inspections.

**Verified**
- **Title-block reader, 14 checks** on generated A1 sheets: labelled cells with a decoy revision table, inline labels, OpenConstructionERP's fixture, and a scanned sheet falling back to the file name.
- **API, 77 checks:**
  - routing (the client can't reach the architect, and the architect's letters go to Setjeka);
  - drafted contract instructions waiting for Setjeka, then issue, receipt, reply, variation and close;
  - thread privacy, including note addressees and @mentions;
  - inspection request, scheduling, checklist rules, issues and photos;
  - drawing read, upload, revisions, duplicate and renumber refusals, programme status and Excel export;
  - authority rounds and their order;
  - the PROCSA items that tick themselves, scoping to the caller's role, and sign-off rights.
- **Browser (Playwright), 15 checks:**
  - **Architect:** reads and uploads a drawing, drafts a contract instruction, completes an inspection on a 390 px phone and raises the failed item as an issue, records an authority submission, and sees their own PROCSA list.
  - **Setjeka:** issues the instruction, schedules the inspection, and passes on the client's request.
  - **Contractor:** requests an inspection.
  - **Client:** raises a request in the portal on a phone in dark mode.
  - No sideways scroll and no console errors.
- **Fixed after the screenshots:** the dropdowns had no borders, and "pass on" was offered on contract instructions.

**Later**: all four followed the same day; see §2.22.


### 2.22 The Architect role, completed — reviews, schedules, markup, models

Built on 2026-10-26, after §2.21. The user: "complete what is left out for the architect".

Migrations:
- `20261026110000_architect_reviews`: `ApprovalSubject.REGISTER_ENTRY`, plus two notification types.
- `20261026120000_markup_and_models`: `DrawingMarkup` and `ModelObjectLink`.

**The architect's signed reviews** (Architect 5.7, 5.12, 6.2–6.4; `delivery/registers.ts`, `delivery-registers.service.ts`)
- **Register definitions** gain three settings:
  - `review`: who reviews, which categories, and the PROCSA reference;
  - `editableBy`: outside roles that add and edit entries;
  - `totals`: columns to total.
- **Who reviews what:**

  | Register | Reviewed by the architect | Architect can also |
  |---|---|---|
  | Payment certificates | Every valuation | — |
  | Handover and completion | Practical, works and final completion, and occupation (not the site handover) | — |
  | Handover documents | O&M manuals, warranties, guarantees, certificates, as-builts | Add and edit |
  | Defects | — | Issue the practical completion list and verify defects (Setjeka alone deletes) |

- **The review itself.** The architect signs a review with the same dialog the client uses (§2.18): four responses, comments, and a drawn, typed, uploaded or plain-acceptance signature.
  - It is recorded as an `ApprovalRecord` with subject `REGISTER_ENTRY`.
  - The linked certificate PDF is stamped and given a sign-off page; with no file, a certificate is produced.
- **Alerts both ways.** When Setjeka adds an entry for review, the architect is told (`REGISTER_REVIEW_REQUESTED`, in Approvals). When the architect reviews it, the PM, the DM and whoever added the entry are told (`REGISTER_REVIEWED`).
- **Setjeka can't review in the architect's place**, and nor can the contractor. Consultants and contractors can see the review records.
- **API:** `POST /projects/:id/delivery-registers/:key/:entryId/review`. The register summary now returns `canEdit`, `canDelete` and `canReview` per register, and the entries carry `reviewable` and `reviews`.

**Finishes schedule and area schedule** (two new delivery registers)
- **Finishes schedule** (Architect 2.8, 4.2, 4.9).
  - Fields: room or area, element, finish or product, supplier, specification clause, sample status (to be submitted, submitted, approved, rejected) and the data sheet.
  - Kept by the architect; contractors can read it.
- **Area schedule** (Architect 2.6, QS 2.7 / 3.7).
  - Fields: space, use, level, units, designed area and brief area, in m², and the stage it was measured at.
  - A totals row; a column nobody has filled in totals to a dash.
  - Kept by the architect and the QS; contractors don't see it.
  - Uses a new decimal field type with a unit.
- **PROCSA.** 2.6, 2.8 and 4.9 now tick from these schedules. 5.7, 5.12 and 6.2 now need the architect's signed review (`registerReviewed`), where before any entry in the register counted.

**Drawing markup** (register DOC row 51, FIELD row 65; `markups/`, `components/design/MarkupViewer.tsx`)
- **Opening it.** **Mark up** on any PDF or image drawing in the register, current or older revision, opens a full-screen viewer.
  - pdf.js draws the page, served from `/vendor/pdf.worker.min.mjs`.
  - Tools: redline, revision cloud, box, arrow, note and pin, in five colours.
  - Zoom, page through, and pan by dragging. It works on a phone.
- **Storage.** Markups are kept apart from the file, as the register requires. Coordinates are fractions of the unrotated page, so they hold at any zoom and in the export.
- **Who sees and edits.**
  - Notes and pins are numbered in the order they were made.
  - Anyone on the team can mark one *dealt with*; only its author, or Setjeka, edits or deletes it.
  - The client doesn't see markups.
- **Pins become issues.** A pin, meaning a site observation, becomes an issue with one click, with the drawing, revision and page in its description.
- **With markups.** This downloads the drawing with every markup drawn on, plus a closing page listing the numbered notes and pins with who made them, any issue raised, and whether each was dealt with (pdf-lib, `GET …/marked-up`).
- **API:** `GET|POST /projects/:id/documents/:docId/revisions/:revId/markups`, `GET …/marked-up`; `PATCH|DELETE /projects/:id/markups/:id`, `POST …/markups/:id/issue`.

**Models** (register BIM rows 55–61; `models/`, project tab **Models**, `components/design/ModelsPanel.tsx`)
- **Upload.** IFC only, up to 200 MB (nginx gives the route 210 MB). A model is stored as a project document of type "Model", and a new upload can be added as its next revision. Export from Revit, ArchiCAD and similar as IFC.
- **The viewer.** web-ifc (WASM, served from `/vendor/web-ifc.wasm`) reads the file in the browser, and three.js draws it.
  - Several models open together in one scene (federation), sharing one origin kept in double precision, so far-off site coordinates don't shake.
  - Orbit, pan and zoom; Escape closes it.
- **Objects.** Click an object to see its IFC type, name, GlobalId, property sets and quantities. Hide it, or show only it.
- **Measure.** Pick two points on the model to get the distance in metres (BIM row 60).
- **Issues and links.**
  - Raise an issue on an object (BIM row 59). It keeps the object's GlobalId and the camera view.
  - Link an object to a drawing or document, an RFI, a submittal or an inspection (BIM row 61).
  - The side panel lists the issues and links. Clicking one flies back to its view and selects the object, found by GlobalId so it survives a new revision of the model.
- **The client** sees only models Setjeka has shared (register CLI row 85: "BIM where permitted"), read-only and without the issues and links.
- **API:**
  - `GET|POST /projects/:id/models`;
  - `GET|POST /projects/:id/models/:docId/links`, `DELETE …/links/:linkId`;
  - `POST /projects/:id/models/:docId/issues`.

**Upload limits.** Drawings now take up to 50 MB (nginx gives `/drawings` and `/drawings/read` 60 MB), because A1 sets run past the 20 MB document limit.

**Build.** `scripts/copy-vendor.mjs` runs on `postinstall` and copies the pdf.js worker and the web-ifc WASM into `public/vendor` (git-ignored). The frontend Dockerfile copies `scripts/` before `npm ci` so this works in the image.

**Layout fix.** The viewers render into the page body through a portal. Inside the app shell, "full screen" was measured against the scrolling main area, so the header and chat button sat over them.

**Verified**
- **API, 59 checks:**
  - **Reviews:** who reviews and who keeps each register; the architect signs, the certificate PDF is stamped plus a sign-off page; Setjeka and the contractor can't review; the site handover is not one for review.
  - **Defects:** the architect issues and verifies defects but can't delete them.
  - **Schedules:** finishes and area schedules, with decimal areas; the QS keeps the area schedule only; the contractor reads finishes but not areas.
  - **Markup:** all six tools; geometry and pin-note checks; the client is refused; only a markup's author edits it; anyone marks it dealt with; a pin raises an issue once; the marked-up PDF has the sheet plus a notes page.
  - **Models:** IFC only; revisions attach; a model issue keeps its view and the owner is alerted; links to drawings, with other projects' records refused; the client sees only shared models, without links; removing links.
  - **PROCSA:** 5.7, 5.12, 6.2, 6.1, 2.6, 2.8, 4.9 and 5.13 tick themselves.
- **Browser (Playwright), 12 checks**, as the architect:
  - signs a payment valuation review with a typed signature;
  - builds an area schedule with totals;
  - draws a cloud, places a pin, raises it as an issue, and downloads the marked-up drawing;
  - opens the real sample IFC, selects a wall and sees its property sets, raises a model issue, and measures a distance;
  - opens the markup viewer on a 390 px phone.

  No console errors.
- **Fixed after looking at the screenshots:**
  - the viewers sat under the app header (now a portal);
  - the measuring dots were oversized;
  - the colour swatches ran off a phone;
  - an empty column totalled "0";
  - review dates printed as 2026/10/20.


### 2.23 Features brought over from OpenConstructionERP — files, BIM hub, coordination, rough estimates

Built on 2026-10-26/27. The user picked these from the donor app's architect features: "File versions, Transmittals, Full text search in drawings, File tags, Recycle bin for only the admins. The full BIM hub, the full federation and coordination hub, Smart views, BIM requirements, the rough cost estimate", together with the biggest gaps listed against the donor (clash detection, BCF, drawing index reconciliation, stamps and scale calibration, a DWG viewer, punch items pinned to drawings, distribution lists). Each was rebuilt here; no donor code is used.

Migrations:
- `20261026130000_files_bim_rom`:
  - Files: `ProjectDocument.deletedAt`/`deletedById`, `DocumentTag`, `DocumentTagLink`, `DocumentPageText`, `DocumentRevision.textStatus`, `DistributionList`, `DistributionListMember`.
  - Drawings: `DrawingCalibration`; `MarkupKind` gains `STAMP`, `MEASURE` and `AREA`.
  - Punch list: `PunchItem` (`PunchStatus`); `SitePhoto.punchItemId`.
  - BIM: `BimProcessing`, `BimElement`, `BimFederation`, `ClashTest`, `Clash` (`ClashStatus`), `SmartView`, `BimRequirementSet`, `BimRequirementCheck`; `ProjectIssue.bcfGuid`.
  - Rough estimates: `RomRate`, `RomRegionFactor`, `RomEstimate`.
  - Notes and alerts: `CommentEntityType` `PUNCH_ITEM` and `CLASH`; notifications `PUNCH_ITEM_ASSIGNED`, `PUNCH_ITEM_READY`, `PUNCH_ITEM_DECIDED`, `TEXT_EXTRACTED`.
- `20261026130100_rom_rates_data`: indicative 2026 rates (ZAR per m² GFA, excl. VAT, fees and land) for 10 building types × economy/standard/prestige, and nine provincial factors (Gauteng 1.00). These are a starting point for Setjeka's QS, who edits them on the Rough estimates page.

New backend libraries: `tesseract.js` 7 with `@tesseract.js-data/eng`, `@napi-rs/canvas`, `jszip`, `fast-xml-parser`, `dxf-parser`, `@mlightcad/libredwg-web` (through typed shims), `web-ifc` (Node entry).

**Files** (`files/`)
- **Full-text search.** `TextIndexService` polls every 20 s for revisions not yet read (`textStatus` null, five at a time):
  - a PDF's own text is read page by page with pdf.js;
  - a page with no text is a scan, so its largest embedded image is OCR'd with tesseract (about 2 s a page). Rendering pages onto `@napi-rs/canvas` crashed pdf.js, hence the image route.
  - Statuses: `SKIPPED`, `PROCESSING`, `DONE`, `NONE`, `FAILED`. `FULLTEXT_INDEXING=off` stops indexing; `FULLTEXT_OCR=off` keeps text but skips OCR.
  - Search (`GET /projects/:id/documents/search?q=`, and `GET /documents/search` across every project the user is on) uses Postgres `websearch_to_tsquery` with `ts_headline` snippets, an `ILIKE` fallback, and name and drawing-number matches. A client sees only client-visible documents.
- **Tags**: per-project coloured tags on documents and drawings, filterable in Documents and searchable in the drawing register.
- **Version restore**: an older revision is copied in as a new revision (its purpose and title block go with it); the older one stays on the record.
- **Recycle bin, administrators only.** Deleting a document is now a soft delete: it leaves every list, search and picker, and its drawing number is freed. Administration → Recycle bin restores it (refused if the number has since been reused) or deletes it for good with its files.
- **Distribution lists** (internal staff): named groups of project members. A transmittal takes lists as well as people, and every transmittal now has a PDF slip (letterhead, recipients, items, "received by" lines) at `GET /projects/:id/transmittals/:id/pdf`.

**Drawings and markup** (`drawings/`, `markups/`)
- **Drawing index check** (`POST /projects/:id/drawings/index-check`): the architect's index sheet, as a PDF, Excel, CSV or pasted list, is reconciled against the register. Numbers are matched however they are spaced or punctuated. The result lists what is missing, what is extra, and where revisions differ.
- **DWG and DXF.** `cad-svg.ts` draws them on the server as SVG, one group per layer (`GET …/revisions/:id/drawing.svg`, cached beside the file). DWG is read with libredwg, DXF with dxf-parser. CAD sheets can now be marked up, with layers switched on and off, and exported marked up.
- **Stamps** (seven fixed wordings), **scale calibration** (one line of known length per page), and **length and area measurements**. The scale is held per page, so lengths are right whatever the sheet's proportions, and the measurements print on the marked-up export.

**Punch list** (`punch/`, Architect 5.13 and 6.1)
- Items numbered `PL-001` onwards, pinned on a drawing revision (page and position) or unpinned, and given to a team member.
- Their flow: open → ready for inspection (said by whoever it is given to) → closed by an inspector, or sent back with a note → reopened by an inspector.
  - Inspectors are internal staff or the architect, engineer, QA, PM, DM or site manager. The client cannot see the punch list.
- Site photos can be attached to an item. There is a notes thread, alerts at each step, and a PDF (each drawing with numbered pins, then the list).
- PROCSA 5.13 and 6.1 count punch items as evidence.

**BIM hub** (`bim/`)
- **Reading the models.** `BimService` polls for IFC revisions not yet read and extracts every element with geometry (`bim-extract.ts`, web-ifc in Node):
  - its GlobalId, class, name, type, storey, materials, bounding box, and its own and its type's property and quantity sets, flattened as `Set.Name`;
  - a hash of all that, so revisions can be compared.

  The sample model gives 215 elements in about 2 s. `BIM_PROCESSING=off` stops it.
- **Element browser** with class and storey facets, text search, an Excel export and quantity totals by class.
- **Revision compare**: elements added, removed and changed, and what changed (name, type, storey, geometry, properties).
- **Federations**: saved sets of models that open together.
- **Coordination hub**: models and their read status, open clashes, open model issues, federations, smart views, requirement scores, and BCF.
- **Rules** (`rules.ts`), shared by clash tests, smart views and requirements: models, IFC classes and storeys, plus conditions on a field, `property:Set.Name` or `quantity:Set.Name` (is, is not, contains, has a value, more than, one of, pattern…).
- **Clash detection**: two selections tested by bounding box (sort and sweep), with a tolerance (default 10 mm).
  - A clash is keyed by its sorted element pair, so re-running keeps its status. Clashes no longer found are resolved by themselves, and a resolved clash found again becomes active.
  - Each clash has a status (new, active, resolved, approved) and a notes thread. One issue can be raised per clash, linked to both elements.
  - **Show** opens the viewer with the pair coloured red and blue, everything else ghosted, and the camera on them.
- **Smart views**: named rule lists (colour, see-through, hide, show only), worked out on the server and applied in the viewer with a legend. They can be chosen from the viewer's toolbar.
- **BIM requirements**:
  - imported from a buildingSMART IDS file (0.9 and 1.0: entity, property, attribute and material facets, with simple values, enumerations, patterns and bounds), from Excel or CSV (columns Requirement, IFC type, Property, Rule, Value), or written here;
  - checked against a model revision, with a score, results per requirement, and the failing elements and why.

  IFC2X3 "standard case" classes count as their parent (a rule on IFCWALL covers IFCWALLSTANDARDCASE). Facets that cannot be checked are reported as left out.
- **BCF 2.1** (`bcf.service.ts`).
  - **Export:** the model issues as a `.bcfzip` (topic, notes, the linked elements and the camera; the viewer is Y-up, BCF is Z-up).
  - **Import:** topics become issues linked to the same elements by GlobalId. A topic seen before (same GUID) is updated rather than duplicated.
- **Viewpoints** are now stored in the model's own coordinates: the viewer adds back the display origin when saving.
- **Who sees it:** the hub, clashes, smart views and requirements are for the project team; a client gets 403. Reading uses the documents permission, and raising issues the issues permission.

**Rough estimates** (`rom/`, internal staff)
- Gross floor area × the rate for building type and quality × the provincial factor, then escalation, contingency and VAT (15%), split into an elemental breakdown (preliminaries, substructure, frame, envelope and so on; separate splits for industrial, parking and healthcare).
- Saved against a project (Commercial → Rough estimate) or an opportunity (Business case). Each saved estimate records the rate and factor it used.
- Commercial → Rough estimates is the calculator plus the editable rate table.

**Frontend**
- New project tabs: **Punch list** and **BIM hub** (Coordination, Elements & quantities, Clash detection, Smart views, BIM requirements). Both are hidden from clients.
- New pages: `/search` (the search box also offers "Search inside documents") and `/rough-estimates`. Administration gains **Recycle bin**.
- Documents gain Search inside, tag chips and filter, and "Restore as current". Transmittals gain several documents per transmittal, lists, distribution-list management and the slip.
- Drawings gain an **Index check** view, tag chips, and markup for DWG/DXF.
- The markup viewer gains stamp, set-the-scale, measure-length and measure-area tools, and CAD layers.
- Components: `components/files/` (Tags, DocumentSearch), `components/bim/` (BimHubPanel, ElementsView, ClashView, SmartViewsView, RequirementsView, SelectionEditor), `components/design/PunchPanel.tsx`, `PlanView.tsx`, `IndexCheck.tsx`, `components/estimates/RomPanel.tsx`; `lib/files.ts`, `lib/bim.ts`. `ModelViewer` is exported with `focus` and `initialView`.

**Dev note.** `tsconfig.build.json` now has `watchOptions.excludeDirectories` (`uploads`, `dist`). Without it, every uploaded file made `start:dev` recompile and restart the server, which killed requests and the background OCR and model reading.

**Tests**
- **API, files and drawings: 38 checks.**
  - Search: text found in the PDF and by OCR in the scan; cross-project search; short queries refused.
  - Tags, with duplicates refused.
  - Restore: as rev C, keeping the purpose; reused numbers refused.
  - Distribution lists, then a transmittal to a list, and its PDF slip.
  - Index check: missing, mismatched and extra drawings.
  - DWG rendered as SVG with layers.
  - Calibration, then measure, area and stamp; unknown stamp wording refused; marked-up export, including for CAD.
  - Punch list: pin required, ready, send back (note required), close, PDF, no deleting closed items.
  - Recycle bin: soft delete, gone from list and search, number reusable, restore refused while reused, restore.
- **API, BIM and ROM: 44 checks.**
  - Two models read (215 elements, 4 storeys); element browser, filter, search, quantities, Excel.
  - Revision B finds the one renamed wall.
  - Federations, with duplicate names refused.
  - Clash runs: 54 clashes; a re-run is stable; an approved clash stays approved; an issue is raised once; an empty selection is explained.
  - Smart views and selection preview.
  - IDS and CSV import and checks; a bad file refused.
  - Hub totals.
  - BCF: export with a Z-up camera; re-import updates rather than duplicates; a foreign topic links to its element and reports the unmatched one.
  - ROM: arithmetic, save, scope required, unknown type refused.
- **Browser (Playwright), 28 checks, no console errors.**
  - Search with the OCR badge and highlights; tag chips and editor; a transmittal to a distribution list and its slip.
  - Recycle bin restore; the cross-project search page.
  - Index check; markup measurements (a 10 m scale line gives 20.00 m and 70.64 m²); CAD layers.
  - Punch pins and "ready".
  - Hub; elements; revision compare; a clash shown in the 3D viewer; a smart view with its legend; the requirements score.
  - ROM on its page and on a project.
  - The 390 px phone layout, with no sideways scroll.
- **Fixed after testing:** the index parser took a data row for a header and missed spaced numbers and trailing revisions; the element browser now opens on the most recently revised model.
- A demo project, **"TMP UI walk - Riverside offices"**, was left in the local database for review. It has drawings (PDF, scan, DWG), markups, punch items, two models, a clash test, a smart view, requirements and a ROM estimate.

### 2.24 The architect end to end, and the in-app guide

Built on 2026-10-27. The user asked whether the architect was covered end to end, then: "Let's have that [the end-to-end run] and then an in app guide that guides each role per module they open for the first time … then the same thing for the entire app end to end".

**The end-to-end run.** One project goes from Stage 2 to Stage 6. Each step is done by the person who would really do it, signed in as themselves. The cast:

- the architect, the client, the contractor, a structural engineer and a QS, each with a real login;
- Setjeka acting as PM.

Stage changes are requested by Setjeka and approved by the client. Stage 1 is the DM/PM's own flow, walked through in §2.17, so the run sets the project to Concept directly when the Stage 1 pack isn't complete.

At every stage, the run checks that the architect's PROCSA items tick themselves from the architect's own work: 12, 8, 9 (4.7 signed off by hand with a note), 14 and 4. Then a browser pass signs in as each person and opens every page and project tab they can reach, recording any refused or failed API call and any error text on the page.

**Found and fixed**
- **Record numbers clashed across projects.** Transmittal, RFI, submittal and purchase-order numbers were counted per project (TR-2026-0001 on each) but had to be unique across all projects. So the first transmittal, RFI, submittal or order on any project after the first failed with a server error. They are now unique per project (migration `20261027090000_numbers_per_project`).
- **The architect could not issue their own transmittals.** Issuing needed Setjeka's approve permission. Now whoever approves transmittals issues any of them, and the person a transmittal is from issues their own.
  - The form never set "from", so an outside party's transmittal is now recorded as from them.
  - Outside parties cannot send a transmittal as someone else.
  - This also makes PROCSA 2.9 and 5.10 tick from transmittals sent in the app.
- **PROCSA 4.9, 5.6 and 5.9 ticked from anyone's work.** On the architect's list they now count only submittals the architect reviewed and RFIs given to the architect. The DM/PM items that use the same evidence are unchanged.
- **Clients added to the team were offered internal tabs.** A client who is on the project team without a client-organisation login was treated as a consultant. They were offered Inspections, Punch list and the BIM hub, and got "You do not have VIEW permission". The project page now also checks the person's role on the project.
- **Registers and Team asked outside parties' browsers for the company contractor directory** and were refused.
  - Registers now offers the contractors on the project, so the architect's defects register can name the contractor.
  - Team hides adding and removing people from outside parties. Setjeka keeps the team.

**By design, confirmed by the run**
- Only Setjeka sends a document to the client for approval. The architect sends it to Setjeka.
- Only Setjeka makes distribution lists. The architect sends to them.

**The in-app guide** (`components/guide/Guide.tsx`, `lib/guide.ts`, `guide/guide.module.ts`)
- **Who it speaks to.** Each signed-in person gets a persona: Setjeka (any internal account, whatever their project role), architect, engineer, QS, contractor, client, consultant (any other project role), or supplier (a vendor login with no project). `GET /me/guide` works it out from the account and the person's roles across their projects.
- **Welcome tour, on first sign-in.** Eight steps, worded for the persona, each pointing at part of the app shell (`data-guide` attributes):
  1. welcome;
  2. the menu (on a phone, the menu button);
  3. the project picker;
  4. search;
  5. alerts;
  6. the guide;
  7. the account and signature;
  8. where to start.

  "Let's start" opens the persona's first screen. For the architect, that's their PROCSA list on the current project. Esc, Skip and the arrow keys work.
- **Screen tips, on each screen's first visit.** A card in the bottom right: two to four steps on what *this person* does on *this screen*, for example the architect's drawing register (title-block reading, purpose of issue, programme and index check, markup) versus the contractor's (build from "For construction"). It covers every project tab, the schedule, the portal pages and the top-level pages. "Got it" marks the screen seen, and "Don't show tips on new screens" turns tips off.
- **The journey: the whole app, end to end.** The header's help button, previously unwired, opens a panel. It lists the persona's journey in the order they'll work:
  - for the architect: getting started, then Stage 2 to Stage 6 with what to do at each;
  - for Setjeka: from opportunities through Stage 1, design, construction and close-out.

  Each entry opens that screen on the current project. A screen is ticked once its tips have been seen, with a progress bar. The panel also offers tips for this screen, the welcome tour again, tips on or off, and "start again".
- **Remembered per person, not per browser.** `User.guideState` (`{ seen, off }`), from migration `20261027100000_user_guide_state`, is read with `GET /me/guide` and written with `PUT /me/guide` (`seen`, `off`, `reset`). A tour or tip seen on a laptop doesn't come back on a phone.

**Verified**
- **API journey, Stage 2 to 6:** 58 checks. Each stage moves forward on the client's approval. The architect's PROCSA items tick themselves at every stage. Boundaries hold: the client can't open the BIM hub or punch list, Setjeka can't sign a review for the architect, and the architect can't open rough estimates or the recycle bin, can't send straight to the client, and can't make distribution lists. Each person gets the right guide.
- **Every screen as each person** (architect, client, contractor, engineer, QS): no refused calls and no error text on any screen they are offered. A client typing a hidden tab's address no longer loads it before their role is known.
- **The guide in the browser:** 18 checks:
  - the architect's tour, start screen, drawings tip, journey and on-demand tips, and turning tips off;
  - a second device that remembers;
  - the client's tour and tip on a phone in dark mode, with the internal tabs hidden;
  - the contractor's punch-list tip.

  No console errors.
- **Fixed after the screenshots:**
  - the tour's spotlight didn't dim the page, so it now uses four panels around the target;
  - on a phone the menu step points at the menu button;
  - two buttons were both labelled "Skip the tour".

---

### 2.25 The quantity surveyor — PROCSA Stages 2 to 6

Built on 2026-10-28. The user asked what the QS can do according to the requirements register and the meeting notes, and what to bring over from OpenConstructionERP. They then made two decisions:

- **Who issues payment certificates** (scope of work, decision 4): Setjeka's Project Manager ("most likely"; to be confirmed with the client).
- **How much the QS does here:** "the QS being able to do what is necessary for them to do in the system". This replaces Meeting 002's "monitoring only" for the QS's own work.

**Sources**
- **PROCSA:** the QS's 33 duties for Stages 2 to 6. Stage 1 was built in §2.13a.
- **Register COM:** the bill of quantities (import, edit, version, approve), payment certificates with retention, and RFI cost impact.
- **Meetings:**
  - Feature Register Review: "the QS also needs to be involved" when an RFI has a cost.
  - Meeting 3: Setjeka may later employ its own QS without new code.
- **From OpenConstructionERP:** the ideas were rebuilt natively, not copied:
  - `boq` importers: reading a bill from Excel;
  - `contracts` and `cvr`: the retention ledger, payment applications and the cash-flow S-curve;
  - `variations`: the final account;
  - `tendering`: tender packages from the bill.
- **Left out of the donor features:** the statutory payment clock, AIA forms, lien waivers, GAEB, e-invoicing and full earned value. None apply to how Setjeka works.

**Access**
- **The QS's permissions.** `QUANTITY_SURVEYOR` moved from full access to the consultant permissions. It keeps creating and editing Commercial and Procurement records, and deleting Commercial drafts. Before this, an outside QS could edit the team and award procurement. Migration `20261028090100_quantity_surveyor_permissions`; `seed.ts` matches.
- **Setjeka-only steps.** Setjeka staff alone:
  - lock or unlock the budget;
  - send a variation to the client, or withdraw it;
  - approve, pay or reject supplier invoices;
  - accept a bill or adopt it as the budget;
  - issue a tender or award it;
  - certify a valuation, return it or record its payment;
  - record a final account as agreed.
- **What the QS sees.** The project's Commercial tab now shows for the QS. Setjeka's own estimates, rough estimate and cost database stay internal; the QS works in bills instead.
- **The client** approves payment certificates themselves, as with variations: the service refuses anyone but an outside account with the client role on the project.

**Bills and cost plans** (Commercial → Bills & cost plans; `quantity-surveying/cost-plans.service.ts`)
- **Kinds:** preliminary and elemental (QS 2.5), detailed (3.5), pre-tender (4.3), the bill for tender (4.4), and the priced contract bill. Numbered BQ-001 per project.
- **Items:** a bill or element heading, item number, description, unit, quantity, rate and amount (quantity × rate, or a lump sum), with a type and a cost code. Types: measured, provisional sum, prime-cost sum, daywork.
- **Totals in QS order:** preliminaries %, contingency %, escalation %, then VAT; with per-bill subtotals and the cost per m².
- **Import** (`boq-import.ts`) from .xlsx or .csv, replacing or adding to the items:
  - **finding the columns:** it uses the first sheet with a Description heading, whatever the column order or wording;
  - **reading the rows:** a row with no figures starts a new bill; total and carried-forward rows are skipped; provisional, prime-cost and daywork sums are recognised by their wording; amounts like "1 234,50" and "R 1,234.50" both read correctly;
  - **export:** back out to Excel.
- **Revisions:**
  - Issuing freezes the items as rev N and tells the PM and DM.
  - Editing an issued bill takes it back to a draft.
  - Any revision can be compared with the bill as it stands, bill by bill.
- **Setjeka accepts** an issued bill. An accepted bill can become the project budget by cost code: escalation spread pro rata, preliminaries on code 01, the bill's contingency as the budget contingency, VAT left out.
- **Tender on the bill** (QS 4.5, 4.6):
  - The QS creates a draft RFQ whose items are the bill's. Setjeka invites, issues and awards it as before.
  - Under the bill, each tenderer's total is set against the QS's own, with the five rates furthest from the QS's.

**Contracts** (Commercial → Contracts & valuations; `contracts.service.ts`)
- **Fields:** contractor, form of contract, contract sum, retention % (default 10), retention limit (default 5% of the sum), VAT %, dates, and the priced bill.
- **From an awarded tender** (QS 4.7): the winner's rates become the priced contract bill, and their total the contract sum.
- **Fixed once certified:** the sum and the retention terms can't change after a certificate is issued; changes come through variations.
- **Variations** can now be linked to their contract at any status.
- **Final account** (QS 5.9, 6.2), worked out live:
  1. the contract sum;
  2. less the provisional and prime-cost sums, plus what the latest valuation shows spent against them;
  3. plus approved variations and agreed claims from the claims register.

  The QS prepares and submits it; Setjeka records it agreed. The final-accounts register follows each step.
- **Cash flow** (QS 5.2): the contract sum spread over the months on an S-curve, into the Cash flow register.
  - Running it again re-spreads the forecast and keeps the actuals.
  - A paid certificate adds to that month's actual.

**Valuations and payment certificates** (`valuations.service.ts`, `valuation-pdf.ts`)
1. **The QS starts a valuation.** It begins from the contract bill and the approved variations, each at the percentage last certified. Work certified before can't be taken back.
2. **The figures:**
   - gross = work done + variations + materials on site;
   - retention is capped at its limit, and half or all of it is released at practical or final completion;
   - less what was certified before, plus VAT.
3. **Submit.** The statement PDF is filed as a project document. A payment-certificates register entry is created, and the architect is asked to review it. The PM sees it in Approvals.
4. **Setjeka's PM certifies it** (PC-001 per project), with a response date. Where the project has an architect, their signed approval since the valuation was submitted comes first. The PM can instead return it to the QS with a reason.
5. **The client approves or rejects payment**, signed. They do it in Approvals, on the Commercial tab or in the client portal.
6. **Setjeka marks it paid.** The register entry follows each step, and the certificate PDF downloads from the valuation.
7. **A rejected certificate** goes back to the QS to revise. It is re-certified under the same number, after a fresh architect review.

**Also in this build**
- **RFIs.** An RFI given a cost impact alerts the project's QS (`RFI_COST_IMPACT`).
- **Registers.** The QS keeps the cash flow, claims and final accounts registers alongside Setjeka.
- **PROCSA.** The QS's Stage 2 to 6 list (`procsa-delivery.ts`), ticking itself from:
  - bills and estimates issued, by kind, and re-issued for 3.3;
  - transmittals the QS received, and variations the QS assessed;
  - tenders on the bill, contracts set up, and valuations the QS prepared;
  - the final valuation certified, and final accounts.

  The QS can sign their own items off by hand, as the architect can.
- **Notes and actions** on bills, contracts and valuations (`COST_PLAN`, `PROJECT_CONTRACT`, `VALUATION`).
- **The guide.** The QS starts on their PROCSA list. The Commercial tip and the journey (Stage 2 to 6) are written for the QS. Setjeka's and the client's Commercial tips mention the bills and certificates.
- **Migrations:**
  - `20261028090000_quantity_surveyor` (the models and new enum values);
  - `…090100_quantity_surveyor_permissions`;
  - `…090200_qs_note_types`.

**Verified**
- **QS journey (API), 84 of 84 checks.** One project from the first estimate to the final account, everyone signed in as themselves:
  - **The bill:** an Excel bill imports with a formula column, a cover sheet and a total row: 6 items, 4 bills, R 1 366 000.
  - **Rev 2:** repricing and remeasuring makes rev 2; comparing it with rev 1 shows concrete up R 9 250.
  - **The budget:** Setjeka accepts the bill and adopts it as the budget (R 1 402 250, contingency R 140 225).
  - **The tender:** two tenderers price the bill; the cheapest is R 1 399 000, 0.23% under the QS's total. The contract comes from the award with the winner's rates.
  - **Valuation 1:** 30% gives R 434 389.50 due, which passes review, certification, approval and payment, and lands as December's actual.
  - **Valuation 2:**
    - retention stops at R 69 950;
    - it is returned by the PM, then rejected by the client;
    - the architect's earlier review doesn't count for the resubmission;
    - it is re-certified as PC-002.
  - **The final valuation** releases all the retention. The final account is R 1 432 000 and is agreed.
  - **Every QS item ticks:** Stage 2 8/8, 3 8/8, 4 7/7 (4.2 signed by hand), 5 9/9, 6 2/2.
  - **Refused, as they should be:** the QS locking the budget, accepting their own bill, sending a variation, certifying, or paying; Setjeka deciding for the client; the architect and contractor opening Commercial.
- **Browser, 12 of 12 checks, no console errors:**
  - the QS imports a CSV with comma decimals, edits a row, saves and issues;
  - the QS sees the tender comparison and the contract with PC-001 to PC-003, and downloads the PDF;
  - Setjeka accepts the new bill;
  - the client sees payment certificates on a phone in dark mode, with no sideways scroll.

  A 13th check (the QS's first-visit Commercial tip) passed on the first run and correctly doesn't repeat.
- **Regression:** the architect journey (58/58), the per-role screen sweep (0 problems) and the guide (18/18) all still pass.
- **Not tested:** the portal page for a client-organisation login. The run's client is a team member, who decides from the Commercial tab.

**Gaps closed the same day** (the user: "fix the gaps")
- **The PM signs the certificate.** Certifying now goes through the same decision and signature dialog the architect and client use (`DecisionDialog`, which gained `extraBody` for the response date).
  - Approving issues the certificate and stamps the PM's signature on it. That signed copy becomes the document's latest revision, so the client's signature goes on top.
  - Rejecting, with comments, returns the valuation to the QS, also signed.
  - Consultants and contractors can open the signed certificates (`PAYMENT_CERTIFICATE` added to what they see).
- **Reports.** All three formats now carry the contracts and certificates:
  - the progress PowerPoint has a Contracts & Payment Certificates slide;
  - the PDF summary describes each contract in sentences;
  - the Excel export has Contracts and Valuations sheets.

  "This period" lists certificates issued and paid, and certificates waiting for the client count as client decisions.
- **Menu.** Commercial now shows to the QS, with entries straight to Bills & cost plans and Contracts & valuations. The cost database and estimates stay internal.
- **Tested:**
  - the QS journey, now 92/92, with the client as a client-company login using the portal;
  - the PM signing in the browser (4/4), the QS screens (13/13) and the menu (8/8);
  - and still the architect journey (58/58), the per-role screen sweep (0 problems) and the guide (18/18).
- **Deferred until every role is built** (the user's instruction):
  - the form of contract driving titles, terms and time limits;
  - dayworks and site measurement sheets;
  - price-escalation indices;
  - enforcing the minimum number of quotes.

### 2.26 The civil engineer — PROCSA Stages 2 to 6, and the engineers' groundwork

Built on 2026-10-29. The user's direction: "break down the Engineers … starting with Civil Engineer". Structural, electrical and mechanical follow, one at a time.

**Sources**
- **PROCSA:** the civil engineer has 48 items across Stages 2 to 6. Stage 1 was built in §2.13a. Most of them are the architect's kind of work, done for the civil works. Four are the civil engineer's own:
  - 2.3, concept design criteria;
  - 2.5, advising on further surveys and investigations;
  - 2.8, access, utilities, services and connections;
  - 5.13 and 6.5, preparing and concluding the final account for the civil works.
- **The register's User Roles sheet:** "Architect/Civil eng/Structural eng — models, federation, coordination, model issues". These were already open to the engineers. Test records are marked "No (standby)".

**Groundwork for every engineer** (`common/consultants.ts`)
- **Who reviews a contract's valuations.** Each contract names the consultant who reviews its valuations (`ProjectContract.reviewerRole`): the architect by default, or the civil, structural, electrical or mechanical engineer for their own works. Migration `20261029090000_contract_reviewer`.
  - A submitted valuation alerts that consultant only, and only they can review it on the payment certificates register. Anyone else gets "This valuation is reviewed by the civil engineer named on its contract".
  - The PM can certify only once that consultant's signed approval is on record.
  - Register entries now carry `reviewer` and `canReviewThis`, so the screen offers the review button only to the right person.
- **Registers.**
  - The engineers review payment valuations (for contracts that name them), completion certificates and handover documents.
  - They keep defects and handover documents for their works.
  - The civil engineer also keeps the authority service agreements (now "access, utilities and service connections") and the final accounts.
  - The reviews are now headed "Consultant's review".
- **PROCSA evidence.**
  - Every consultant's items count only their own work. Only the DM and PM lists count anyone's.
  - Any consultant can sign their own items off by hand.
  - New evidence kinds: design criteria raised, investigations recommended, written advice by topic, register entries and authority rounds recorded by the role.
- **Already open to engineers before this build:** drafting instructions, the punch list, inspections, drawings, models, the BIM hub and authorities.

**The civil engineer's list** (`procsa-delivery.ts`)

| Items | Ticks from the civil engineer's own work |
|---|---|
| 2.3 | A design criterion in the Stage 1 register |
| 2.5 | An investigation recommended, or advice on surveys |
| 2.6 | Advice on consents, or drawings issued for the authority |
| 2.7, 3.3, 3.7 | Rounds with the authority |
| 2.8 | A service connection on the register |
| 5.8 | A valuation they reviewed |
| 5.13, 6.5 | A final account in the register, started by them and later agreed |
| 5.14, 6.2 | Handover documents and completion certificates they reviewed |

The rest tick like the architect's:
- drawings by purpose, the documentation programme and meetings attended;
- transmittals and letters, contract instructions, inspections and tests;
- RFIs and submittals, punch items and defects.

**The guide.** The engineer persona starts on the PROCSA list. Its Registers and PROCSA tips and its Stage 2 to 6 journey now cover the engineers' work.

**Verified**
- **Civil journey (API), 25 of 25 checks.** One project from Stage 2 to 6, with the civil engineer, architect, QS, client, contractor and Setjeka each signed in as themselves:
  - **Every civil item ticks:** Stages 2 (11), 3 (7), 4 (9), 5 (16) and 6 (5).
  - **Only the civil engineer's own work counts:** the architect's design criterion doesn't tick the civil engineer's 2.3.
  - **Registers:** the civil engineer keeps service connections but not the architect's finishes schedule.
  - **The civil works contract names the civil engineer.** Only the civil engineer is alerted to review its valuation. The architect is refused, and so is the PM before the civil review. After it, the certificate is issued.
  - **Final account:** the civil engineer keeps the final account; Setjeka records it agreed.
  - **Access:** the civil engineer sees only their own PROCSA list and has no commercial access.
- **Regression:** the architect journey (58/58), the per-role screen sweep (0 problems), the guide (18/18), the QS journey (92/92), and the QS browser checks (13/13), PM signing (4/4) and menu (8/8) all still pass.

### 2.27 Non-conformance reports (NCRs)

Built on 2026-10-29. The user asked what in OpenConstructionERP the civil engineer would need, and chose NCRs from four options. The register lists them under QHSE, "Non-conformance reports", marked **Required: Yes**; there were none until now. The donor's `ncr` module was rebuilt natively.

**Not chosen this time:** measured valuations, test results (the register marks these "No (standby)"), and an interfaces and hidden-works register. Also not offered: GIS, point clouds, temporary works and the daily diary.

**The cycle** (project tab **NCRs**, under Design & site; `ncrs/`)
1. **Raise.** Setjeka, a design consultant (architect or engineer), the QA/QC manager or the site manager raises an NCR to a contractor on the team. It records:
   - type (material, workmanship, design, documentation or other);
   - severity (minor, major or critical);
   - location, an answer-by date, and any cost and time impact.

   A failed inspection offers **Raise an NCR for this**, which starts the NCR from what the inspection found. NCRs are numbered NCR-001 per project.
2. **Answer.** The contractor gives a root cause (a category plus their explanation), the corrective action and, optionally, the preventive action.
3. **Agree or send back.** The raiser (or Setjeka) agrees it, or sends it back with a reason.
4. **Fix.** The contractor puts it right and marks it ready to verify.
5. **Close.** The raiser verifies it on site and closes it, or sends it back. An NCR can only be closed with a corrective action on record.
6. **Void.** Setjeka or the raiser can void an open NCR, with a reason.

Every step is kept in the NCR's history.

**Who sees what**
- **Contractors** see only the NCRs issued to them or to their firm.
- **The client** sees none, as with inspections.
- **The permissions** sit with Inspections in the matrix. The service decides who raises, answers and closes.

**Also**
- **Alerts:**
  - issued → the contractor (`NCR_ISSUED`);
  - answered or ready to verify → the raiser (`NCR_RESPONDED`, `NCR_READY`);
  - each decision → the contractor (`NCR_DECIDED`).
- **Notes and actions** on each NCR (`NCR`), hidden from the client.
- **PROCSA:**
  - raising an NCR counts toward inspecting the works for conformity (Architect and Civil Engineer 5.5);
  - the PM's quality assurance item (5.10) now needs the agreed QA procedure plus inspections or NCRs showing it in use.
- **Reports:** an NCRs sheet in the Excel export. The "this period" text gives NCRs raised and closed, and how many are still open.
- Migration `20261029110000_ncrs`.

**Verified**
- **API, 22 of 22 checks:**
  - **Refused, as they should be:**
    - the contractor can't raise an NCR;
    - an NCR can only be issued to a contractor;
    - the client and another contractor see none;
    - the architect can't decide on the civil engineer's NCR;
    - the civil engineer can't answer for the contractor.
  - **The full cycle:**
    - raised from a failed inspection;
    - answered, sent back, answered again and agreed;
    - marked ready, sent back after the site check, then closed with all 9 history steps.
  - **Closed means closed:** a closed NCR can't be changed.
  - **Notes, voiding and Excel:** notes work and are hidden from the client; voiding needs a reason; the Excel sheet leaves out void NCRs.
- **Browser, 4 of 4 checks, no console errors:**
  - the civil engineer raises one from the failed inspection, with the form pre-filled;
  - the contractor answers it on a phone in dark mode, with no sideways scroll.

### 2.28 The structural engineer — PROCSA Stages 2 to 6

Built on 2026-11-02, the second of the engineers (the user: "go ahead with the structural engineer").

**The list** (`procsa-delivery.ts`, 47 items)
- **Stage 1** was built in §2.13a.
- **Stages 2 to 6** follow the PROCSA matrix's structural engineer: 11, 7, 9, 15 and 4 items.
- **The same work as the civil engineer's.** It's evidenced the same way, from the structural engineer's own records: design criteria, investigations and advice; drawings by purpose, authority rounds and service connections; inspections, tests, NCRs, RFIs and submittals; and the valuations, certificates and handover documents they review.
- **No final account.** Stage 5 runs to 5.15 and Stage 6 to 6.4, so their contract instructions, O&M review, practical completion lists and statutory certificates come one number earlier than the civil engineer's.
- **Built from the civil list.** The structural list is derived from the civil engineer's items, with the structural wording from PROCSA, so the two can't drift apart in how they tick.

**Also**
- **Service connections.** The register (access, utilities, services and connections) is now kept by every engineer, not just the civil engineer: PROCSA gives each of them item 2.8.
- **Final accounts** stay with the QS and the civil engineer.
- **Valuations.** A contract can name the structural engineer to review its valuations (§2.26). The guide's engineer content already covers them.

**Verified**
- **Structural journey (API), 25 of 25 checks.** One project from Stage 2 to 6, with each person signed in as themselves:
  - **Every structural item ticks** (11, 7, 9, 15, 4).
  - **The valuation** on the contract naming the structural engineer: only they are asked to review it, the architect is refused, and the PM can't certify first.
  - **Registers:** the structural engineer keeps service connections, but not the final accounts or the architect's finishes schedule.
- **Regression:** the architect journey (58/58), the per-role screen sweep (0 problems), the guide (18/18), the civil journey (25/25), NCRs (22/22) and the QS journey (92/92) all still pass.

### 2.29 The electrical and mechanical engineers — PROCSA Stages 2 to 6

Built on 2026-11-02, the last of the engineers (the user: "carry on").

**The lists** (`procsa-delivery.ts`, `servicesEngineerItems`)
- **One list, two roles.** The two PROCSA matrices are the same item for item: 12, 7, 9, 16 and 5 items, 49 each. One definition builds both, from the civil engineer's items, with only the wording differing.
- **Where they differ from the civil engineer:**
  - **2.11** "Provide cost estimates and life cycle costs as required" (new). It ticks from a cost estimate or life cycle costing the engineer uploads; liaison moves to 2.12.
  - **4.3** co-ordinating services design with the other consultants.
  - **4.4** "Provide cost estimate to quantity surveyor for incorporation into the construction budget". It ticks from the engineer's own uploaded cost estimate.
  - **5.9** adds commissioning. It ticks from a test or mock-up they witnessed, or a commissioning record they uploaded.
- **Final account.** Like the civil engineer, they prepare and conclude a final account of their works (5.13, 6.5). The final accounts register is now kept by the QS and the civil, electrical and mechanical engineers. The structural engineer has no final account in PROCSA.
- **Own documents only.** Document evidence can now count only the role's own uploads (`document` with `byRole`). So the QS's or Setjeka's estimate doesn't tick an engineer's 2.11 or 4.4.

**Verified**
- **Electrical journey (API), 26 of 26 checks.** Every item ticks. Setjeka's cost estimate doesn't tick the electrical engineer's 2.11. Valuations on a contract naming the electrical engineer go to them alone. They keep the final account of their works.
- **Mechanical journey (API), 25 of 25 checks.** The same, as the mechanical engineer.
- **Regression:** the architect journey (58/58), the per-role screen sweep (0 problems), the guide (18/18), and the civil (25/25), structural (25/25), NCR (22/22) and QS (92/92) journeys all still pass.

### 2.30 Minimum quotes, enforced

Built on 2026-11-02, the first of the extras the user chose once every role was built. Meeting 002, decision 2.7: "Where a client requires a minimum number of quotations, the platform enforces it." The project's procurement policy has always recorded the number (default 3); now it's enforced on works and supply tenders (`rfqs.service.ts`).

- **Issue.** A tender can only be issued once at least the minimum number of vendors are invited.
- **Award.** It can only be awarded once at least that many quotes are live. Withdrawn quotes don't count.
- **No bypass.** If the client agrees to fewer on a project, Setjeka lowers the number in that project's procurement policy (Inception), so the exception is on record.
- **The procurement screen** shows "2 of 3 vendors invited" or "2 of 3 quotes needed for award". It holds back the Issue and Award buttons until the number is reached.
- **Consultant appointments** (Inception → Professional team) keep their own ranking and justification rules; this applies to works and supply tenders.

**Verified:**
- **API, 6 of 6 checks:**
  - the minimum defaults to 3;
  - issuing with 1 of 3 invited is refused;
  - awarding on 2 of 3 quotes is refused, with the reason;
  - with 3 quotes it's awarded;
  - a project whose policy says 2 can award on two.
- **Regression:** the journeys that award tenders set their test projects' policy minimum, the way Setjeka would. They still pass: civil, structural, electrical, mechanical and QS.

### 2.31 The form of contract drives titles, terms and time periods

Built on 2026-11-02 (the user's choice from the list kept until all roles were built). Meeting 002, decision 2.6: "The contract form drives role titles, terminology, procurement rules, variation workflow and contractual time periods. Under a FIDIC agreement the project manager is titled project engineer." Until now the form (JBCC, GCC, NEC, FIDIC, other) was only recorded: on the project from the procurement policy, and on each contract.

**The terms** (`common/contract-forms.ts`, with a frontend copy in `lib/projectMeta.ts`)

| Form | PM's title | Client | Variations are | Certificate | Days to certify / pay (usual) |
|---|---|---|---|---|---|
| JBCC | Project Manager | Employer | Variation orders | Payment certificate | 7 / 7 |
| GCC | Project Manager | Employer | Variation orders | Payment certificate | 7 / 28 |
| NEC | Project Manager | Client | Compensation events | Payment certificate | 7 / 14 |
| FIDIC | **Project Engineer** | Employer | Variations | Interim Payment Certificate | 28 / 28 |
| Other or not set | Project Manager | Client | Variations | Payment certificate | 7 / 30 |

- **The periods are defaults.** Each contract can carry its own from its contract data ("Days to certify", "Days to pay"); left empty, the form's usual periods apply. Days to certify run from the QS submitting the valuation; days to pay from the certificate.
- **Check the periods.** They are the usual ones for each form, not legal advice. Setjeka should check them against the editions they use.

**Where it shows**
- **The PM's title.** Under FIDIC the PM is the Project Engineer:
  - on the project header and the Team list ("Project Engineer (Project Manager)");
  - on PROCSA ("Project Engineer (PROCSA Project Manager)", Stages 1 to 6);
  - on signed copies (the signer's role);
  - on the certificate ("Issued by …, Project Engineer, for Setjeka").
- **Terms.** The Commercial tab and the variations heading use the form's word ("Compensation events" under NEC). Certificates are named for the form: the PDF heading and the contract screen say "Interim Payment Certificate" under FIDIC.
- **Time periods.**
  - **Certify by.** A submitted valuation gets a certify-by date, shown on the valuation and as the due date in Setjeka's approvals queue.
  - **Pay by.** An approved certificate gets a pay-by date.
  - **Reminders.** Both join the reminders from three days before, as does the client's response date on a certificate.

**Not done here:** procurement rules and the variation workflow (for example NEC's quotation and acceptance periods for compensation events) don't change by form yet. The minimum quotes rule (§2.30) is per project, through the procurement policy.

**Verified**
- **API, 10 of 10 checks.**
  - **FIDIC project:**
    - PROCSA calls the PM the Project Engineer;
    - the contract takes FIDIC's terms (Interim Payment Certificate, 28 / 28), and its own 2 and 10 days override them;
    - the valuation's certify-by date is 2 days after submission, and shows in the approvals queue and as a reminder;
    - the PM signs as Project Engineer;
    - the pay-by date is 10 days after the certificate.
  - **NEC project:** variations are compensation events, payment is 14 days, and the PM keeps the title.
- **Regression:** the architect journey (58/58), the per-role sweep (0 problems), the guide (18/18), and the civil (25/25), QS (92/92), NCR (22/22) and minimum quotes (6/6) checks and the PM signing in the browser (4/4) all still pass. Browser, 4 of 4: the FIDIC project shows the Project Engineer on the Team list and header, and Interim Payment Certificates with the contract's periods.

### 2.32 Measured valuations: site measurement, dayworks and remeasurement

Built on 2026-11-02 (the user's choice from the list kept until all roles were built). Until now every contract was valued on % complete against the bill. Civil works are usually paid on quantities measured on site, remeasured at the end, with dayworks for work that can't be measured.

**A measured contract.** A contract set up by the QS can be marked "Measured contract" (on the new-contract form, or `measured` on the create, update and from-award routes). It can be changed until the first valuation is certified. The contract heading then says "measured (paid on agreed site quantities)".

**Site measurement** (the new "Site measurement" tab under Design & site; `SiteMeasurement`; `quantity-surveying/site-measure.*`)
- **Who measures.** Setjeka, the QS, and the consultant named on the contract to review its valuations (the civil engineer on civil works) record quantities measured against bill items, with the date and where.
- **The contractor agrees.** The contract's own contractor (a CONTRACTOR member tied to that contractor company) agrees each measurement, or disputes it with a reason. The measurer is told of a dispute and records a corrected quantity. Setjeka can record agreement made on site.
- **The bill view.** Each item shows its bill quantity, the quantity measured (not disputed) and the quantity agreed. Agreed quantities past the bill are flagged.
- **What can't change.** An agreed measurement can't be removed; a correction is a new measurement.
- **Who sees it.** Nobody but the contract's measurers and its contractor: another contractor on the project gets "not found". Clients don't see the tab.

**Dayworks** (`DayworkSheet`, DW-001 numbered per contract)
- **Submitting.** The contractor (or a measurer) submits a sheet with the date, the work, and labour, plant and materials.
- **Signing.** A measurer signs it, or rejects it with a reason. The submitter is told either way.
- **Notes.** Sheets carry the notes and actions thread.
- **Contracts.** Dayworks work on any contract, measured or not.

**In the valuation**
- **Measured lines.** On a measured contract each measured bill item becomes a line at its bill rate. Its quantity to date is the larger of the quantity agreed up to the valuation date and the quantity in the previous valuation. Its value is quantity × rate, and its % is derived.
- **The QS adjusts quantities.** The QS can change a measured line's quantity in the valuation, but never below the previous valuation's.
- **Lump sums.** Provisional and prime-cost sums stay on % complete. The column reads "Qty / %" when both kinds are present.
- **Dayworks.** Every signed daywork sheet dated up to the valuation date is a line at its full value, marked "Daywork". Valuations are cumulative, so a sheet paid before is not paid twice. "New variations & dayworks" brings in sheets signed since the valuation was started.
- **The final account** of a measured contract adds a "Remeasurement" line (each measured item at its latest valuation quantity, less its bill amount) and "Add signed dayworks".

**Alerts:** measurement recorded (to the contractor) and daywork submitted (to the measurers) are decisions owed; disputes and daywork decisions are actions. All four link to the tab.

**Verified**
- **API, 31 of 31 checks.**
  - **Access:**
    - the civil engineer named on the contract measures;
    - its contractor agrees, and can't measure or sign;
    - another contractor can't see it.
  - **Measurements:**
    - agree, dispute (a reason is needed), and the re-measure;
    - an agreed measurement can't be removed;
    - over-bill quantities are flagged.
  - **Dayworks:** sign; reject (a reason is needed); notes on sheets.
  - **Valuation 1:** pays agreed quantities to its date at the bill rate (R 18 000) plus the signed daywork only, and the QS adjusts a quantity.
  - **Valuation 2**, after the engineer's review and the PM's certificate:
    - picks up the later measurement (110 m3, past the bill);
    - keeps the paving at its certified quantity and refuses to go below it;
    - doesn't pay the daywork twice;
    - brings in a newly signed sheet on refresh.
  - **Final account:** shows the remeasurement and dayworks lines.
  - **Lump-sum contracts:** take no measurements.
- **Browser, 6 of 6:**
  - the engineer records a measurement;
  - the contractor agrees it on a phone in dark mode, with no sideways scroll (the bill table fits the phone);
  - the QS sees measured lines as quantities to date, and daywork lines marked.
- **Regression:** the architect journey (58/58), the per-role sweep (0 problems), the guide (18/18), and the QS (92/92), civil (25/25), NCR (22/22), minimum quotes (6/6) and form of contract (10/10) checks all still pass.

### 2.33 Contract price adjustment from price indices

Built on 2026-11-02 (the user's choice from the list kept until all roles were built). Until now escalation was only a flat % on a bill. Under JBCC and GCC contracts with contract price adjustment (CPAP), each payment is adjusted by published cost indices.

**Price indices** (`PriceIndex`, `PriceIndexValue`; Commercial > "Price indices")
- **Shared.** Indices (for example Stats SA's labour, plant, materials and fuel series) are kept once, for every project. Each has a unique code, a name and a source.
- **Monthly values.** The QS or Setjeka enters each month's value as it is published, or corrects one. Draft valuations that use the index are worked out again straight away, on any project.

**A contract's price adjustment** (`ContractEscalationWeight`, on the contract screen)
- **The contract data.** The base month (when the tender was priced), the fixed share that isn't adjusted (15% by default), the index lag in months (0 by default), and a weighting for each index.
- **Rules.** The weightings must add to 1, and a base month is needed. No weightings turns it off.
- **When it is fixed.** It can't change once a valuation on the contract is certified.

**In each valuation** (`EscalationService.forValuation`, `priceAdjustment` in `qs-math.ts`)
- **The formula:** adjustment for the period = (1 − fixed share) × the period's work × (Σ weight × index for the month ÷ index at the base month − 1).
  - The period's work is the work and variations to date, less what the last certified valuation had. Dayworks are left out: they are already at current prices.
  - The month is the valuation's month less the lag.
- **Cumulative.** The adjustment to date is the last certified valuation's plus this period's. It is part of the gross valuation, so retention applies to it.
- **Provisional figures.** If an index for the month isn't published yet, the latest one is used and the valuation says so: for example "provisional, latest published used: LABOUR Oct 2026". Entering the month's value updates the draft.
- **Missing base.** With no index for the base month, there is no adjustment that period, and the valuation says why.
- **Where it shows.** The valuation screen gives the adjustment to date with how it was worked. The certificate PDF adds "Contract price adjustment to date". The final account adds "Add contract price adjustment".

**Not done here:** the formula is one weighted set per contract. Separate formulae per work type (for example civil and building portions on one contract) aren't supported. Check the default 15% fixed share and the lag against the contract data in use.

**Verified**
- **API, 17 of 17 checks.**
  - **Indices:** the QS adds them; a code is used once; the contractor can't add one; months must be YYYY-MM.
  - **Contract set-up:**
    - the weightings must add to 1;
    - a base month is needed;
    - the set-up is fixed once a valuation is certified.
  - **Valuation 1:** 20% of R 1 000 000 at weights 0.40 / 0.45 / 0.15.
    - It is first provisional on October's indices: factor 1.095, R 16 150, in the gross.
    - Entering November makes it final: factor 1.105, R 17 850.
    - The certificate PDF prints.
  - **Valuation 2:** adjusts only the next R 300 000, for R 44 625 to date.
  - **Final account:** adds R 44 625.
  - **A contract without it:** has no adjustment.
- **Browser, 6 of 6:**
  - the QS enters an index value;
  - sees the contract's weightings, fixed once certified;
  - sees the adjustment and its working on a valuation;
  - sets up price adjustment on another contract (Save waits until the weightings add to 1).
- **Regression:** the architect journey (58/58), the per-role sweep (0 problems), the guide (18/18), and the QS (92/92), measured valuations (31/31), civil (25/25), NCR (22/22), minimum quotes (6/6) and form of contract (10/10) checks all still pass.

### 2.34 Test results, and hold and witness points

Built on 2026-11-03 (the user's choice from the list kept until all roles were built; the donor app's `construction_control`). The register marked test records "No (standby)". Everything lives on a new project tab, **Tests & hold points** (`quality-tests/`, `TestsPanel.tsx`), next to Inspections and NCRs. It uses the same permissions as inspections. The client sees none of it, and a contractor sees only their own work.

**Acceptance criteria** (`TestCriterion`, per project)
- **What each test must achieve.** A code, a name, the standard, the unit, and a rule: at least, at most, between, or pass/fail. Also how often to test.
- **A starting set.** "Add the usual SA tests" adds what the project doesn't have yet:
  - 28-day cubes, at least 30 MPa (SANS 5863);
  - slump, 75–125 mm;
  - base, subbase and fill compaction, at least 98, 95 and 93% Mod AASHTO;
  - water main pressure tests and drainage tests, pass/fail;
  - insulation resistance, at least 1 MΩ.
  The engineer edits them to the specification. A criterion can be retired and used again.
- **Who sets them.** Setjeka, the design consultants and QA/QC.

**Test results** (`TestResult`, TR-001 on)
- **Recording.** The contractor, the site manager, the engineers or QA/QC record each result with what was tested, the sample, the laboratory and the dates. A contractor's results are tagged to their own firm.
- **Judged on entry.** A measured value is checked against its criterion, and pass/fail tests are stated. For example, a cube at 27.5 MPa against 30 fails.
- **Retests.** A failure can be retested (cores after failed cubes, say), and both results show the link.
- **Review.** The engineer, QA/QC or Setjeka marks each result reviewed, with a comment.
- **NCRs.** A failure has a "Raise an NCR" button. It opens the NCR form filled in from the test, and the NCR and the test link to each other (`NonConformance.testResultId`).
- **Alerts.** A failure alerts the PM, QA/QC, the point's releaser and the contractor. A result a contractor records alerts the reviewers.

**Hold and witness points** (`HoldPoint`, HP-001 / WP-002, one sequence)
- **Setting one up.** Setjeka, the design consultants or QA/QC set the stops in the inspection and test plan. Each one can name:
  - the contractor;
  - who releases it;
  - the notice in hours (24 by default);
  - the programme activity it holds;
  - a test needed before release.
- **Notice.** The contractor gives notice of when the work will be ready, at least the notice period ahead, and the releaser is alerted. The releaser can turn it back as not ready, with a reason.
- **A hold point** is released by the named releaser or Setjeka. If it names a test, a passing result has to be recorded against it first. **Until it is released, its programme activity can't progress**: raising the % complete is refused and names the hold point.
- **A witness point** can be witnessed and released the same way. If nobody comes by the notified time, the contractor may go ahead, and the point records that it went ahead unwitnessed. A hold point never can.
- **History.** Each point keeps its history.

**Notes, alerts and PROCSA**
- Test results and hold points carry the notes and actions thread.
- The alert types are TEST_RECORDED, TEST_FAILED, HOLD_POINT_NOTIFIED and HOLD_POINT_DECIDED.
- These PROCSA items now also tick on a test result reviewed or a hold point released (by the role itself, where the item needs it): the architect's 5.8, and 5.9 for the civil, structural, electrical and mechanical engineers ("witness and review all tests").

**Verified**
- **API, 42 of 42 checks.**
  - **Criteria:** the starting set, added once; duplicate codes and bad ranges refused; the contractor can't set criteria; the client sees no results.
  - **A hold point on a slab pour:**
    - the held activity can't progress;
    - notice inside 24 hours is refused, and the contractor can't release it;
    - release is refused until a passing cube test is recorded;
    - the cube at 27.5 fails, an NCR is raised from it, the retest at 33 passes, and the engineer reviews it;
    - the point is released, and the activity then progresses.
  - **Witness points:** they go ahead after the notified time unwitnessed; a hold point never does; a point can be turned back or cancelled.
  - **Other checks:** another contractor sees none of it; notes work, and the client can't read them; the alerts arrive; civil PROCSA 5.9 ticks.
- **Browser, 7 of 7:**
  - the engineer sees the criteria, adds a hold point and records a passing slump;
  - "Raise an NCR" starts from the failed test and issues an NCR naming it;
  - the contractor gives notice on a phone, with no sideways scrolling.
- **Regression:** these all still pass:
  - the architect journey (58/58), the per-role sweep (0 problems) and the guide (18/18);
  - civil (25), structural (25), electrical (26), mechanical (25), NCR (22 API, 4 UI) and QS (92);
  - measured valuations (31), escalation (17), minimum quotes (6) and form of contract (10).

### 2.35 The interfaces register and hidden-works sign-off

Built on 2026-11-03, the last of the six extras chosen once all roles were built. It draws on the donor app's `interface_management` and its site-supervision hidden-works register. It adds two project tabs next to Tests & hold points: **Hidden works** and **Interfaces** (`site-records/`, `HiddenWorksPanel.tsx`, `InterfacesPanel.tsx`). Both use the inspections permissions and the same rules on who sees what (`common/site-party.ts`): the client sees neither, and a contractor sees only their own work.

**Interfaces** (`ProjectInterface`, IF-001 on)
- **What an interface is.** One party's work depends on another's. For example, slab penetrations the mechanical engineer needs from the structural engineer, or cast-in plates for a steel canopy.
- **The record.** Each interface names who provides it and who depends on it: any two people on the team, not the client. It also has a kind (physical, functional, spatial, information, programme or contractual), a place and an agree-by date, and it can be linked to a programme activity and an RFI.
- **Agreeing it.**
  1. The provider proposes the detail: sizes, positions, loads, drawing references.
  2. The dependant agrees it, or sends it back with a reason. The provider then proposes again.
  3. Once it is built as agreed, Setjeka, a consultant, QA/QC or whoever raised it closes it.
- **Overdue.** An interface past its agree-by date that isn't agreed yet is flagged overdue.
- **Contractors** raise interfaces they are a side to, and see only those.
- **Alerts and lists.** Interface alerts go to the provider when it is raised, to the dependant when a detail is proposed, and to the provider when it is agreed or sent back. The list filters to "Waiting on me".

**Hidden works** (`HiddenWork`, HW-001 on)
- **Asking for sign-off.** Before work is covered (drainage backfilled, a ceiling boarded, waterproofing screeded), the contractor or the site team asks for it to be signed off. The request gives the trade, the place, when it is ready and optionally a named inspector.
- **Photos.** Photos are added from the record and kept with it (`SitePhoto.hiddenWorkId`). **It can't be approved without a photo:** the photos are the record of what is hidden.
- **The inspector decides.** The named inspector (or Setjeka, or any consultant or QA/QC if none is named) either:
  - approves it, recording what is covered (sizes, depths, positions); or
  - turns it back with a reason. The contractor puts it right and asks again.
- **Covering it.** Once approved, the contractor marks it covered.
- **Covered too soon.** Work found covered before sign-off is recorded so. An NCR can be raised from it; the NCR form is filled in, and the two link (`NonConformance.hiddenWorkId`).
- **The register.** The register view, filtered by trade, is the record of what lies where, for the handover.

**Notes, alerts and PROCSA**
- Both records carry the notes and actions thread.
- **Alert types:** INTERFACE_RAISED, INTERFACE_PROPOSED and INTERFACE_DECIDED; HIDDEN_WORK_REQUESTED and HIDDEN_WORK_DECIDED.
- **PROCSA:**
  - An interface agreed with the role as a side now ticks "co-ordinate design interfaces": architect 2.7, and 2.9 for the engineers.
  - Any agreed interface ticks the PM's 3.7, "technical co-ordination".
  - Hidden work signed off by the role ticks "inspect the works for conformity" (5.5).

**Verified**
- **API, 42 of 42 checks.**
  - **Interfaces:**
    - the client sees none;
    - the two sides must differ, and the client can't be one;
    - it is overdue past the agree-by date;
    - a contractor who is no side can't see it or raise one between others;
    - only the provider proposes, and only the dependant agrees or sends it back;
    - after a revised proposal it is agreed and closed, with its history;
    - a contractor's own interface is hidden from another contractor;
    - an open interface can be cancelled;
    - the alerts arrive;
    - the structural engineer's PROCSA 2.9 ticks, but not the civil engineer's.
  - **Hidden works:**
    - the client sees none, and the inspector can't be a contractor;
    - the contractor's request is tagged to their firm, and the named inspector is alerted;
    - another contractor can't see it;
    - approval is refused without photos;
    - a photo is uploaded, counted and listed against it;
    - neither the contractor nor another engineer can approve it;
    - it is turned back, can't be covered, is asked for again, and is approved with the as-built record, then covered;
    - work covered before sign-off raises a linked NCR;
    - notes work, and the client can't read them;
    - civil PROCSA 5.5 ticks.
- **Browser, 9 of 9:**
  - the structural engineer raises an interface and proposes the detail;
  - the mechanical engineer agrees it on a phone;
  - the contractor asks for sign-off on a phone, and the approval waits for photos until one is added from the phone;
  - the civil engineer approves it with the as-built record;
  - the register lists every record;
  - no sideways scrolling on a phone.
- **Regression:**
  - the architect journey (58), the per-role sweep (0 problems) and the guide (18);
  - civil (25), structural (25), electrical (26), mechanical (25), NCR (22 API, 4 UI) and QS (92);
  - measured valuations (31), tests and hold points (42 API, 7 UI), escalation (17), minimum quotes (6) and form of contract (10).

### 2.36 Delay notices and extension-of-time claims

Built on 2026-11-03, the first item from the user's role-by-role review of the donor app (its `variations` module's notices and EOT claims). It adds a new project tab, **Delays & EOT** (`time-claims/`, `EotPanel.tsx`). It sits with instructions and letters in the permission matrix: the contractor and the client can read there.

**The periods, by form of contract** (added to `common/contract-forms.ts` and `lib/projectMeta.ts`, in calendar days)

| Form | Notice from the event | Claim from the notice | Assessment from the claim |
|---|---|---|---|
| JBCC | 28 (20 working days) | 56 (40 working days) | 42 (30 working days) |
| GCC | 28 | 28 | 28 |
| NEC | 56 (8 weeks) | 21 (3 weeks) | 14 (2 weeks) |
| FIDIC | 28 | 84 | 42 |
| Other or not set | 28 | 28 | 28 |

These are the usual periods, as defaults. **Setjeka should check them against the editions they use.**

**How a claim runs** (`TimeClaim`, EOT-001 on)
1. **Notice.** The contractor on the contract (or Setjeka for them) gives notice of a delay event: the cause, when it began, what happened, and the programme activity held up.
   - Notice is refused for an event that hasn't begun.
   - Late notice is **flagged, not refused**, for example "Notice 12 days after the 28-day period". Whether late notice bars the claim is the contract's business.
   - The PM and the QS are alerted, and the claim's due date is set from the form.
2. **The claim.** The contractor submits the days claimed, any costs, the particulars and when the delay ended.
   - The assess-by date is set from the form.
   - The claim goes onto the **Contractual claims register** under review, so the PROCSA claims items tick from it.
   - The claim screen shows the site weather recorded over the delay: days, wet days and rain. That is evidence for weather claims.
3. **Assessment.** The Setjeka PM (or DM) grants all, some or none of the days and costs, with reasons, and never more than claimed.
   - The claim is Granted, Partly granted or Not granted, and the register entry is agreed or rejected with the amount.
   - The contractor is told. **If days were granted, the client is told the new completion date.**
   - The PM is reminded from three days before the assess-by date, with the other approvals reminders.
4. **The contractor's answer.** The contractor accepts the assessment, or disputes it with reasons. A dispute puts the register entry back under review and lets the PM assess again.
5. **Costs go to the client.** "Send the costs to the client as a variation" raises a draft variation on the contract for the granted costs and days. It then goes through the usual flow, and **the client alone approves money** (Meeting 3). The granted costs can't change once the variation is raised.
6. **Withdrawal.** An undecided claim can be withdrawn by its contractor.

**Each contract's time position** (cards at the top of the tab)
- **The dates.** The contract's completion date, the days granted, and the revised date.
- **Running late.** Days past the revised date and, with the penalty per day that the PM records from the contract data, the penalties to date.
- **The periods.** The form's notice, claim and assessment periods.

**Who sees what**
- A contractor sees only their own contracts and claims.
- The client sees only decided claims and the contract dates, and reads notes only on decided claims.
- The consultants and the QS see all of it.
- Claims carry the notes and actions thread.

**Not done here:** no delay analysis on the programme (time impact or critical path). The granted days move the contract's dates, not the programme's activities. Disruption (loss of productivity) claims aren't separate.

**Verified**
- **API, 37 of 37 checks.**
  - **Before notice:**
    - a contractor sees only their own contracts;
    - JBCC's periods show;
    - notice on another firm's contract, or of a future event, is refused.
  - **Notice:**
    - EOT-001 is in time, with its claim due in 56 days;
    - notice 40 days after an event is flagged 12 days late;
    - the PM and QS are alerted;
    - the client and the other contractor see nothing.
  - **The claim:**
    - particulars are required;
    - 15 days and R 120 000 are claimed, to assess in 42 days, with the weather shown;
    - it goes on the claims register under review;
    - the contractor can't assess, and no more than claimed can be granted.
  - **The assessment:**
    - 10 days and R 60 000 are partly granted, and the register is agreed;
    - completion moves to 10 July 2027;
    - the client sees the claim and is told, and the contractor is told.
  - **Dispute and reassessment:**
    - a dispute needs reasons, and puts the register back under review;
    - the claim is reassessed at 12 days and accepted, moving completion to 12 July 2027.
  - **Costs:** a draft variation for R 60 000 and 12 days is raised on the contract, once only.
  - **Withdrawal and penalties:**
    - the late weather notice is withdrawn;
    - the contractor can't set the penalty;
    - the late earthworks show the days late, and penalties at R 5 000 a day.
  - **Notes and PROCSA:**
    - notes work, and the client reads them on a decided claim but not an open one;
    - the PM's PROCSA 5.15 ticks.
- **Browser, 9 of 9:**
  - the contractor sees the revised date, gives notice and submits a claim on a phone, with no sideways scrolling;
  - the PM grants it, and completion moves to 17 July 2027;
  - the client sees the revised date and the decided claims, but not the open one, and can't give notice.
- **Regression:**
  - the architect journey (58), the per-role sweep (0 problems) and the guide (18);
  - civil (25), structural (25), electrical (26), mechanical (25), NCR (22) and QS (92);
  - measured valuations (31), tests (42), interfaces and hidden works (42), escalation (17), minimum quotes (6) and form of contract (10).

### 2.37 Completion certificates and the defects liability period

Built on 2026-11-03, the second item from the user's role-by-role review of the donor app (`defects_liability`). It adds a new project tab, **Completion & defects** (`defects/`, `DefectsPanel.tsx`), which everyone on the project sees, the client included. It sits with instructions and letters in the permission matrix. Until now, defects were rows typed into a register, and the QS chose the retention release by hand.

**Each contract's path** (on the contract: `practicalCompletionAt`, `worksCompletionAt`, `defectsPeriodDays`, `defectsPeriodEndsAt`, `finalCompletionAt`)
1. **Practical completion.** Certified by the consultant who administers the contract (its reviewer role) or by Setjeka's PM or DM. The QS doesn't certify.
2. **Works completion.** Certified once every defect on the practical completion list is verified. It starts the defects liability period.
3. **The defects period.**
   - **Length.** The form's usual length (JBCC 90 days, GCC 365, NEC 364, FIDIC 365, otherwise 90) unless the contract data says otherwise. It can be changed until final completion.
   - **Reminder.** The PM is reminded from three days before it ends.
4. **Final completion.** Certified once the period has ended (dated no earlier) and every practical completion and defects-period defect is verified or declined.

**On the register and to the parties.** Each certificate goes on the **Handover and completion** register, and the client, the contractor and the QS are told.

**Retention follows the certificates** (`valuations.service.ts`)
- **Half the retention.** It can be released on a valuation only once practical completion is certified, on or before the valuation date.
- **The final valuation.** It (which releases the rest) can be raised only after final completion.
- **The QS journey's close-out** now certifies practical, works and final completion before its final valuation.

**Defects** (`ContractDefect`, DEF-001 on)
- **Three lists, by stage.**
  - The **practical completion list** runs until works completion.
  - The **defects liability period** list runs from works completion to final completion.
  - **Latent defects** are those found after final completion.
- **Listing them.** The consultants, QA/QC and Setjeka list defects. Each has 14 days to be put right unless a date is given, and the contractor is told.
- **The client reports defects** in the defects period or as latent defects. A report waits for Setjeka or a consultant to issue it to the contractor, or to decline it as not a defect.
- **Putting them right.**
  1. The contractor puts each right, with photos (`SitePhoto.contractDefectId`).
  2. The consultant verifies it on site, or sends it back (counted).
  3. Overdue defects are flagged.
- **The register.** Each issued defect keeps the **Defects** register in step: the list, the status and the verified date. That ticks the PROCSA defects items, for example the architect's 6.1.
- **Who sees what.** The client sees every defect; a contractor sees only their own contracts. Defects carry the notes and actions thread.

**Not done here:**
- **Latent defects:** no separate period or bond.
- **Certificates can't be withdrawn** once issued.
- **Defects on the drawings:** these stay in the punch list (§2.23).

**Verified**
- **API, 44 of 44 checks.**
  - **Before completion:**
    - JBCC's 90-day and GCC's 365-day periods show;
    - a contractor sees only their own contract, and the QS can't certify;
    - half the retention isn't released, and the valuation can't be made final;
    - the contractor can't list defects, and the client can't add to the practical completion list.
  - **Practical completion:**
    - the architect certifies it; it is on the register;
    - the client, contractor and QS are told;
    - the QS then releases half the retention.
  - **The practical completion list:**
    - two defects are listed, due in 14 days; the contractor is told; both are on the register under the practical completion list;
    - works completion is refused until they're verified;
    - another contractor sees none of it, and the contractor can't verify;
    - put right, sent back, put right again and verified;
    - a photo is added;
    - a defects-period defect is refused before works completion.
  - **Works completion and the period:**
    - the 90 days run from works completion, and the practical completion list closes;
    - the client's report waits for Setjeka, the architect and PM are told, and it isn't on the register until issued;
    - nothing is latent yet;
    - the architect issues it;
    - final completion is refused while the period runs;
    - a 10-day period has ended, but the open defect blocks final completion until verified;
    - final completion is refused when dated before the period's end, then certified;
    - the valuation can then be final, and all three certificates are on the register.
  - **Latent defects:** a latent report is declined; the client sees all four defects.
  - **Notes, reminders and PROCSA:**
    - the client adds a note;
    - the PM is reminded as a 3-day period ends;
    - the architect's PROCSA 6.1 ticks.
- **Browser, 9 of 9:**
  - the architect sees the finished contract with all retention due, certifies a new contract's practical completion, and lists a defect (the list follows the contract's stage);
  - works completion waits on it; the contractor puts it right on a phone, with no sideways scrolling;
  - the architect verifies it and certifies works completion, starting the 90-day period;
  - the client reports a defect for Setjeka to issue.
- **Regression:**
  - QS (93, with the new check that the final valuation waits on final completion);
  - the architect journey (58), the per-role sweep (0 problems) and the guide (18);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), tests (42), interfaces and hidden works (42), delays (37), escalation (17), minimum quotes (6) and form of contract (10).

### 2.38 The handover pack

Built on 2026-11-03, the third item from the user's role-by-role review of the donor app (its closeout and commissioning modules). It adds a new project tab, **Handover pack** (`handover/`, `HandoverPanel.tsx`), which everyone sees. It uses the instructions and letters permissions, like completion and defects.

**What is asked for** (`HandoverItem`, HO-001 on, per contract)
- **The types:** as-built drawings, O&M manuals, warranties, guarantees, compliance certificates, commissioning records, the health and safety file, or other.
- **Each item** has a title, an optional system (for example "Lifts") and a due date.
- **Who asks.** Setjeka, the consultants and QA/QC.
- **The usual pack.** "Add the usual pack" adds what the contract doesn't have yet:
  - as-built drawings;
  - O&M manuals;
  - commissioning and test records;
  - the electrical (SANS 10142-1), plumbing and fire certificates of compliance;
  - the contractor's guarantee;
  - manufacturers' warranties;
  - the health and safety file.
- **Changing the list.** An item nothing has been uploaded for can be removed. The contractor is told what is asked for.

**How an item runs**
1. **Upload.** The contractor uploads the files (`HandoverFile`).
   - Allowed: PDF, Word, Excel, DWG/DXF, IFC, zip and photos, up to 30 MB each (the server's request limit).
   - Stored under `HANDOVER_UPLOAD_DIR` (default `./uploads/handover`).
   - A file can be removed until the item is submitted.
2. **Submit.** The contractor submits the item. A warranty or guarantee needs the date it runs to, and who gives it. The consultants, QA/QC and the PM are told.
3. **Review.** A consultant, QA/QC or Setjeka accepts the item, or returns it with comments. A returned item goes back to the contractor to replace and resubmit.
4. **Hand over.** Setjeka's PM hands the contract's accepted items to the client in one go. The client is told, and only then sees and downloads them.

**Around it**
- **The register.** Each item keeps the **Handover documents** register in step: Outstanding, then Received, then Distributed. The register gains a "Commissioning records" type.
- **Final completion** (§2.37) now also waits on every handover item on the contract being accepted or handed over.
- **Warranty reminders.** Setjeka's PM, and the client once it is handed over, are reminded from 30 days before a warranty or guarantee runs out.
- **Notes.** Each item carries the notes and actions thread; the client reads notes only on handed-over items.
- **Who sees what.** A contractor sees only their own contracts.

**Verified**
- **API, 36 of 36 checks.**
  - **Asking for the pack:**
    - a contractor sees only their own contract and can't set the pack;
    - the usual pack is 9 documents, added once;
    - a lift manual is added for a system;
    - the contractor is told, all ten are on the register outstanding, and the client sees nothing.
  - **Supply and review:**
    - nothing is submitted without a file, and an executable is refused;
    - the manual is uploaded, and another contractor can't see or add to it;
    - it is submitted, the architect is told, and the register shows it received;
    - the contractor can't accept it;
    - it is returned with comments, the wrong file is removed, a new one is resubmitted, and it is accepted;
    - a warranty needs its run-to date.
  - **Hand-over:**
    - before hand-over, the client sees and downloads nothing;
    - the architect can't hand over; Setjeka hands over the two accepted documents;
    - the client is told, sees just those two, and downloads the manual;
    - the register shows them distributed;
    - Setjeka and the client are reminded of the warranty running out within the month;
    - the client notes a handed-over document, but can't see notes on one not handed over.
  - **Final completion:**
    - refused while 8 documents are outstanding, and the completion card says so;
    - once the unneeded ones are removed, it follows.
- **Browser, 7 of 7:**
  - the architect asks for the usual pack;
  - the contractor uploads and submits from a phone, with no sideways scrolling;
  - the architect accepts it, and Setjeka hands it over;
  - the client sees only what was handed over, and downloads it.
- **Regression:**
  - defects (44), QS (93), the architect journey (58), the per-role sweep (0 problems) and the guide (18);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), tests (42), interfaces and hidden works (42), escalation (17), minimum quotes (6) and form of contract (10);
  - delays (37), after a fix found by this run: late notice and late claims are now counted in South African calendar days. Rounding elapsed hours had counted a notice given in the afternoon one day late.

### 2.39 Baseline variance

Built on 2026-11-04, the fourth item from the user's role-by-role review. Baselines could already be saved (§2.4) but nothing compared against them. The schedule screen gains a **Baseline variance** view (`ScheduleVarianceView.tsx`; `GET /projects/:id/schedule/baselines/variance?baselineId=`, SCHEDULE view permission). It uses the latest baseline unless another is chosen.

**What a baseline now records.** Each activity's snapshot also keeps its % complete, whether it was on the critical path, and its float. Baselines saved before this keep none of that, so they show no critical path changes.

**Per activity** (all in working days, Monday to Friday, as the programme counts them)
- **Movement.** Start, finish and duration movement against the baseline: positive is later, negative is earlier.
- **Status.** Each activity is shown as late, early or on plan; activities added since the baseline are marked "added since".
- **Planned progress today.** This is straight-line over the baselined working days, counting today; a milestone is all or nothing. The gap to the reported % complete is shown. An unfinished activity 10 points or more short is **behind**.
- **Critical path.** **Now critical** (it wasn't at the baseline), **off the critical path** (it was), or critical.
- **Bars.** Baseline and current dates side by side on one time axis.

**The summary**
- **Forecast finish:** the latest current finish, against the baseline finish, in working days.
- **Progress today:** planned against actual, weighted by duration over the activities that do the work (summary rows left out).
- **Finishing late:** how many activities finish late (and how many of those are on the critical path), early and on plan.
- **Critical path:** how many activities are newly critical, off the critical path, or behind on progress, and how many were added.
- **Filters:** the list filters to late or added, behind on progress, on the critical path, or all.

**Not done here:**
- Planned progress is straight-line, not a resource-loaded curve.
- There's no history of progress over time (so no S-curve of actual progress), and no earned value; the user didn't choose earned value.
- Activities deleted since the baseline drop out of it, because their snapshots go with them.

**Verified**
- **API, 17 of 17 checks.**
  - **Before and at baselining:**
    - with no baseline, there is nothing to compare;
    - the baseline records which activities were critical;
    - straight after baselining, nothing has moved;
    - the baseline has the substructure finished by today (100% planned), and with nothing reported the work is behind.
  - **After the programme moves:**
    - the substructure takes 4 more days and finishes 4 working days late;
    - it pushes the frame 4 days, though the frame's own duration is unchanged;
    - the forecast finish is 4 days past the baseline, with the late activities on the critical path;
    - site services finish a day early, and when completed are not behind;
    - an instructed activity is new since the baseline;
    - the substructure at 60% against 100% planned is 40 points behind.
  - **Critical path:** site services grown to 40 days become newly critical, and the substructure drops off.
  - **Choosing a baseline:**
    - a second baseline becomes the default (nothing moved against it);
    - the first can still be chosen;
    - an unknown baseline is refused.
- **Browser, 6 of 6:**
  - the latest baseline is shown;
  - choosing the tender programme shows the finish later and the substructure 4 days late;
  - the newly critical activity is marked, and the behind filter works;
  - no sideways scrolling on a phone.
- **Regression:** these all still pass:
  - handover (36), defects (44), QS (93), the architect journey (58), the per-role sweep (0 problems) and the guide (18);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), tests and hold points (42, which use the programme), interfaces (42), delays (37), escalation (17), minimum quotes (6) and form of contract (10).

### 2.40 The portfolio dashboard

Built on 2026-11-04: roadmap item 5's last open part, and the fifth item from the user's role-by-role review.

- **Where.** A new **Portfolio** page (`/portfolio`, under Overview in the menu, Setjeka staff only; `GET /portfolio`, `portfolio/`). It shows every project that isn't archived.
- **The dashboard card.** "Portfolio overview" no longer says "Not tracked yet": it shows the portfolio's budget, forecast, how many projects have a budget, and how many need attention. The "Finance summary" placeholder is gone.
- **Where the figures come from.** Every figure comes from the project's own screens, not a second calculation:
  - cost from the cost report (§2.14);
  - the programme from the baseline variance (§2.39);
  - completion from the contracts and the extensions of time granted (§2.36).

**Each project**
- **Who and where:** name, code, client, Setjeka PM and stage.
- **Cost.** The projected final cost against what was set aside: the original budget and its contingency. Approved variations are in the revised budget and draw on the contingency, so they are counted once. Also shown: the amount over, the contingency left, and whether the budget is locked.
  - **Red:** over by more than 5%, or the contingency spent.
  - **Amber:** over at all, or the contingency spent once pending variations are approved.
  - **Grey:** no budget.
- **Programme.** The forecast finish against the latest baseline in working days, with progress against plan.
  - **Red:** more than 10 working days behind, or any contract past its revised completion date (granted extensions included).
  - **Amber:** behind at all, or late activities on the critical path.
  - **Grey:** no baseline and no contract dates.
- **Client approvals.** Stage 1 documents, variations, stage moves, document approvals and payment certificates waiting for the client.
  - **Red:** any overdue.
  - **Amber:** any waiting.
- **Risks.** Open risks.
  - **Red:** a high risk (score 15 or more) is open.
  - **Amber:** any risk is open.
- **On site.** Open NCRs, defects, extension-of-time claims and outstanding handover documents.
- **Overall.** The worst of cost, programme, approvals and risk.

**The page**
- **Totals in rand.** Converted at Setjeka's recorded exchange rates; anything with no rate is left out and named. The totals are revised budget, projected final cost, projects behind programme, approvals waiting (and overdue), and high risks.
- **Finding projects.** Search by project, client or PM; filter by health and stage. Projects needing attention come first.
- **Layout.** A table on wider screens and a card per project on a phone.
- **Download.** The list as shown can be downloaded as a CSV.
- **Speed.** Projects are worked out six at a time: 177 local test projects take about 3 seconds, and a real portfolio of tens of projects well under one.

**Not done here:** no history (the portfolio is as at now); amounts per project are in its own currency. The thresholds (5%, 10 working days, a risk score of 15) are defaults to agree with Setjeka.

**Verified**
- **API, 13 of 13 checks.**
  - **An on-track project** (budget, baselined programme on plan, nothing waiting) is green, with its budget, PM and baseline.
  - **An over-budget project.** Approved variations past the contingency make it red, R 70 000 over its R 1 050 000 budget and contingency; with no programme, its time is not tracked.
  - **A late project:**
    - a contract 20 days past completion makes the programme red;
    - a variation with the client makes approvals amber;
    - a high risk makes risk red;
    - overall is the worst.
  - **The totals** add the projects in rand and count approvals and high risks.
  - **A client** is refused.
- **Browser, 10 of 10:**
  - the dashboard card shows the real budget and links to the portfolio;
  - the three test projects show, those needing attention first, with "R 1.12m of R 1.05m, R 70k over" and the late contract;
  - the health filter works, and the CSV holds what is shown;
  - on a phone each project is a card, with no sideways scrolling;
  - a client has no Portfolio in the menu and is told it is for Setjeka staff.
- **Regression:** these all still pass:
  - variance (17), handover (36 API, 7 UI), defects (44 API, 9 UI), tests (42 API, 7 UI) and delays (37 API, 9 UI);
  - QS (93), the architect journey (58) and the guide (18);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), interfaces (42), escalation (17), minimum quotes (6) and form of contract (10).
- **The per-role sweep now covers this week's tabs:** NCRs, tests, hidden works, interfaces, measurement, delays, completion and handover. It found the client's Delays & EOT tab asking for the site options the notice form uses, which was refused (403). That list now loads only for people who can give notice. With the fix, the sweep shows 0 screens with problems.

### 2.41 HSE incidents

Built on 2026-11-04, from the user's role-by-role review (the donor app's `safety` and `hse_advanced` modules). The user chose **incidents only, no near misses**. It adds a new project tab, **Health & safety** (`hse/`, `HsePanel.tsx`). It sits with inspections in the permission matrix: the client doesn't see it, and a contractor sees the incidents involving their firm or reported by them.

**Reporting** (`HseIncident`, INC-001 on)
- **Who reports.** Anyone on the site team can report an incident (contractors, the site manager, the HSE manager, the consultants, Setjeka).
- **What they record:**
  - the type: injury, property or plant damage, environmental, fire, dangerous occurrence, security, or other;
  - the severity: no injury, first aid, medical treatment, lost time or fatality;
  - when and where it happened, and what happened;
  - what was done straight away;
  - who was involved, as names and roles only (no ID numbers are kept);
  - the contractor involved (a contractor's own reports are tagged to their firm), and the days lost;
  - photos, from the record.
- **Refused:** an incident dated in the future.
- **Alerts.** The HSE manager and the PM are told; the DM too when it is serious.
- **Reportable to the Department of Employment and Labour** (OHS Act section 24). Flagged automatically for:
  - a death;
  - an injury that keeps someone off work for more than 14 days;
  - a dangerous occurrence.

  The HSE manager can change the flag; this is a starting suggestion, not legal advice.

**Investigation and close-out**
- **Investigation.** The HSE manager (or Setjeka's PM, the DM or Setjeka) records the root cause and findings, and can correct the severity and days lost.
- **Corrective actions** (`IncidentAction`). Each has an owner on the site team and a due date. The owner is told and marks it done; the HSE manager is told when they do.
- **Closing.** An incident closes only when:
  - the root cause is recorded;
  - every action is done;
  - for a reportable incident, the date of the report to the Department is recorded, with its reference.
- **Notes and history.** Each incident carries the notes and actions thread and its history.

**The safety record** (`GET hse/incidents/stats`). For what the viewer can see:
- days without a lost-time injury (since the last one, or since the project started);
- lost-time injuries and days lost;
- incidents in all and in the last 12 months;
- how many are open;
- how many are reportable.

**The portfolio** (§2.40) shows open incidents under "On site". An open serious incident (lost time, a death, or reportable) turns the project's risk red; any open incident turns it amber.

**Not done here:**
- near misses (the user's choice);
- toolbox talks and inductions (not chosen);
- hours worked, so no lost-time injury frequency rate;
- permits to work, which are next.

**Verified**
- **API, 26 of 26 checks.**
  - **Reporting:**
    - the client sees nothing; a future incident is refused;
    - the contractor's first-aid report is INC-001, tagged to their firm and not reportable;
    - the HSE manager is told;
    - another contractor can't see it, and the contractor can't investigate.
  - **Serious incidents:**
    - a 20-day lost-time injury is flagged reportable, and the PM is told it is serious;
    - a scaffold collapse with nobody hurt (a dangerous occurrence) is reportable.
  - **Investigation and close-out:**
    - the HSE manager investigates and sets an action for the contractor, who is told;
    - closing is refused while the action is open;
    - the contractor marks it done (the HSE manager is told), and the incident closes; the reporter is told;
    - a reportable incident needs its root cause and then the Department report before it closes.
  - **Photos, notes and the record:**
    - a photo is added, and notes work; the client can't read them;
    - the record counts 3 incidents, 1 lost-time injury of 20 days, 2 reportable, and 2 days without a lost-time injury;
    - the contractor's record counts only their firm's.
  - **The portfolio** shows the open serious incident and the risk red.
- **Browser, 7 of 7:**
  - the contractor reports an incident on a phone, with no sideways scrolling;
  - the record shows the days without a lost-time injury;
  - the HSE manager investigates, sets an action, marks it done and closes the incident;
  - the reportable incident is flagged in the list until reported;
  - the client doesn't see the tab.
- **Regression:** these all still pass:
  - portfolio (13 API, 10 UI), variance (17), handover (36), defects (44), QS (93), the architect journey (58), the guide (18), and the per-role sweep (now covering Health & safety: 0 problems);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), tests (42), interfaces (42), delays (37), escalation (17), minimum quotes (6) and form of contract (10).

### 2.42 Permits to work

Built on 2026-11-04, the last HSE item from the user's role-by-role review (the donor app's `hse_advanced`). The Health & safety tab now has two parts, **Incidents** (§2.41) and **Permits to work** (`permits/`, `PermitsPanel.tsx`; `/projects/:id/hse/permits`). It uses the same permissions: the client sees none, and a contractor sees their own firm's permits or the ones they asked for.

**Asking for a permit** (`WorkPermit`, PTW-001 on)
- **The types:** hot work, working at height, excavation, confined space, electrical isolation, lifting, or other high-risk work.
- **Who asks.** The contractor or the site team.
- **What a request gives:**
  - the work, where it is, and the method;
  - the crew;
  - the period, which ends after it starts, runs for no more than **7 days**, and isn't already over.
- **The precautions** (`PERMIT_CHECKS`, from the Construction Regulations 2014 and the Electrical Installation Regulations) must each be confirmed. Extra precautions can be added.
  - **Hot work:** combustibles cleared within 10 m; an extinguisher at the work; a fire watch during the work and for 60 minutes after; gas cylinders secured with flashback arrestors.
  - **Working at height:** a fall protection plan (reg. 10); harnesses and anchors checked; edge protection or scaffold tagged; a rescue plan; the area below barricaded.
  - **Excavation:** services located; sides shored, battered or benched (reg. 13); barricades; ladder access; spoil kept 1 m back.
  - **Confined space:** a gas test before entry, which must be recorded; ventilation; a standby person; rescue equipment and a plan; isolations locked out.
  - **Electrical isolation:** isolated; locked and tagged out; tested dead; a competent person appointed.
  - **Lifting:** a lift plan; the crane and tackle certified; a competent operator and rigger; an exclusion zone; the wind within the crane's limit.
- **Alerts.** The HSE manager, the site manager and the PM are told.

**Issuing and closing**
- **Who issues.** The HSE manager, the site manager, the PM, the DM or Setjeka. A contractor can't issue their own permit.
- **Issuing.** The issuer issues the permit, with any conditions, or doesn't (with the reason). The crew are told.
- **Suspending.** The issuer can **suspend** a permit ("stop the work", with the reason; the crew are told at once) and reinstate it while its period runs.
- **Hand-back.** When the work is done, the holder hands the permit back. The issuer checks the area and closes it. A request not yet issued can be cancelled.
- **Live and expired.** A permit is **live** while issued and within its period. Past its end and not handed back, it shows **expired: hand back**.
- **The board** counts permits live now, waiting to be issued, expired and not handed back, and suspended.
- **The portfolio** (§2.40) shows live and expired permits under "On site", and an expired permit not handed back turns the project's risk amber.
- **Notes.** Permits carry the notes and actions thread.

**Not done here:**
- No check for clashing permits in one place (hot work beside a confined space, say).
- No sign-off by the crew themselves.
- The precaution lists are starting points for Setjeka's HSE consultant to adjust.

**Verified**
- **API, 27 of 27 checks.**
  - **Requests:**
    - the client sees nothing; each type has its precautions;
    - a request is refused with a precaution unconfirmed, for more than 7 days, ending before it starts, or for a confined space with no gas test;
    - the contractor's PTW-001 has an extra precaution, and the HSE and site managers are told;
    - another contractor can't see it, and the contractor can't issue it.
  - **Issuing to closing:**
    - the site manager issues it with a condition, and it is live; the contractor is told;
    - the HSE manager suspends it and the contractor is told to stop; it is reinstated;
    - the contractor hands it back and the issuer is told; the contractor can't close it, and the site manager closes it.
  - **Other ends:**
    - a request is turned down with a reason, and another is cancelled;
    - an issued permit past its end shows expired, can't be reinstated, and is counted on the board;
    - the portfolio shows it, with the risk to watch.
  - **Notes** work, and the client can't read them.
- **Browser, 7 of 7:**
  - the contractor asks for a working-at-height permit on a phone; the request waits until every precaution is ticked; no sideways scrolling;
  - the HSE manager issues it with a wind condition (it shows live), then suspends it;
  - the board counts the suspended permit;
  - incidents sit beside permits on the tab.
- **Regression:** these all still pass:
  - incidents (26 API, 7 UI), portfolio (13), variance (17), handover (36), defects (44), QS (93), the architect journey (58), the guide (18), and the per-role sweep (0 problems);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), tests (42), interfaces (42), escalation (17), minimum quotes (6) and form of contract (10);
  - delays (37). Its test briefly expected 12 days late when it ran just after midnight South African time: it worked out event dates in UTC, while the app (rightly) counts South African calendar days. The test now dates events by the SA calendar.

### 2.43 The daily site diary

Built on 2026-11-04, the first of the site manager's items. The user said to build them now, with only what is needed, and to confirm the Field operations scope with Setjeka later (`confirm-with-setjeka.md` 1.1). It adds a new project tab, **Site diary** (`site-diary/`, `SiteDiaryPanel.tsx`). It sits with the site records under inspections: the client doesn't see it, and the site team and consultants can read it.

**One page a day** (`SiteDiary`, unique per project and date, kept as the South African calendar day)
- **Who writes it.** The site manager, Setjeka's PM or DM, or Setjeka.
- **Refused:** a page for a day that hasn't begun.
- **What a page holds:**
  - the working hours (9 by default);
  - the weather recorded on site that day (§2.17), plus a note of what it was like;
  - labour by firm and trade, with a headcount;
  - plant, with how many and whether working, standing or broken down;
  - delays and what held the work up;
  - instructions received, deliveries, visitors and safety;
  - work done and other notes.
- **Copied forward.** A new day starts from the last day's labour, plant and working hours, so only what changed needs typing.
- **Signing.** The writer signs the day, which locks it. A day with nobody on site and no note isn't signed. Further entries go in the day's notes and actions thread.
- **On a phone.** The page is built to be filled in on site: previous and next day, a date picker, and a list of recent days showing who wrote each, the headcount and whether delays were noted.

**Where else the diary shows**
- **The safety record** (§2.41) now gives hours worked, from the signed diaries (people on site times the working day). It also gives the **lost-time injury frequency rate per 200 000 hours**. Hours worked was an open question in `confirm-with-setjeka.md`.
- **A delay claim** (§2.36) shows the signed diary days over the delay and the days that noted one, with the entries, as evidence. The client doesn't see these.

**Not done here:**
- No per-person timesheets: the diary records headcounts, not names or clock-ins.
- No link to the plant register, which comes with plant and equipment.
- Progress on activities is next: the look-ahead.

**Verified**
- **API, 17 of 17 checks.**
  - **Access and dates:**
    - the client sees nothing;
    - today starts blank for the site manager;
    - the contractor reads the diary but can't write it;
    - a future day and a badly given date are refused.
  - **Writing and signing:**
    - the site manager writes a day: 17 on site, plant, a rain delay, a delivery and a visitor;
    - the next day starts from it and keeps it on saving;
    - the day is signed and then locked;
    - an empty day isn't signed;
    - the list shows three days, and the rain day notes a delay.
  - **The safety record:** hours worked are 306 (2 signed days × 17 people × 9 hours), and the frequency rate is per 200 000 hours.
  - **A weather claim** over those days shows 2 signed days, one noting the delay.
  - **Notes** on a signed day work, and the client can't read them.
- **Browser, 7 of 7:**
  - the site manager's phone starts today from yesterday's labour;
  - they add a plumbing crew and a power-outage delay (19 on site), sign the day, and the page locks;
  - no sideways scrolling;
  - the previous day reads back signed, and the recent days list shows the delays;
  - the client doesn't see the tab.
- **Regression:** these all still pass:
  - permits (27), incidents (26 API, 7 UI), delays (37 API, 9 UI), portfolio (13), variance (17), handover (36), defects (44) and QS (93);
  - civil (25), structural (25), electrical (26), mechanical (25) and NCR (22);
  - measured valuations (31), tests (42), interfaces (42), escalation (17), minimum quotes (6) and form of contract (10);
  - the guide (18), and the per-role sweep (now covering the Site diary: 0 problems);
  - the architect journey (58). Its BIM step failed until the converter service, stopped by an earlier session restart, was started again (`converter-service/`: `python -m uvicorn app.main:app --port 8100`).

### 2.44 The look-ahead and progress on site

Built on 2026-11-04, the second of the site manager's items. It adds a new project tab, **Look-ahead** (`site-diary/look-ahead.*`, `LookAheadPanel.tsx`; `/projects/:id/look-ahead`). It sits with the site records: the client doesn't see it, and the contractor can record progress on their own work.

**The look-ahead**
- **What it shows.** The programme from this Monday, 2, 3 (by default), 4 or 6 weeks ahead, week by week (Monday to Sunday, the South African calendar).
- **Overdue first.** Anything past its finish and not complete comes first, under **Past their finish**.
- **What's left out.** Summary rows, finished work and anything beyond the horizon.
- **Each activity shows:**
  - its dates, contractor and whether it's critical;
  - its % complete against where the programme has it today (straight-line over its working days, a milestone all or nothing);
  - **behind** when 10 points or more short;
  - the last update and who made it;
  - any unreleased hold point holding it (§2.34). The update button is hidden until it's released.

**Recording progress** (`ScheduleProgressEntry`)
- **Who.** The site manager, Setjeka's PM, DM or planner, or Setjeka, on any activity; a contractor only on their own firm's activities.
- **How it works.** Each update goes through the programme's own update, so:
  - hold points still stop progress;
  - the dates and critical path are worked out again;
  - the status follows (in progress, or completed at 100%).
- **The history.** Each update is kept as a dated entry with the previous figure, the new one, a note and who made it. An activity's history is at `look-ahead/activities/:id`.
- **Rules.** Going down needs a reason, and recording the same figure again is refused.
- **On the diary.** The site diary (§2.43) shows the progress recorded that day.

**Not done here:**
- No resource levelling and no re-planning from the look-ahead: dates change on the Schedule.
- No actual-progress S-curve yet; the dated entries make one possible.

**Verified**
- **API, 19 of 19 checks.**
  - **The look-ahead:**
    - the client sees nothing;
    - three weeks from this Monday by default, six on request;
    - late brickwork at 20% comes first and is behind 100% planned;
    - plaster spans this week and next, and the roof is next week;
    - work beyond the horizon and finished work are left out;
    - the held slab shows its hold point.
  - **Recording progress:**
    - the contractor may update their own work, not the roofer's, and records 40% with a note, which moves the programme to in progress;
    - the roofer updates theirs;
    - the same figure is refused, and going down needs a reason (the site manager corrects it with one);
    - the held slab can't progress;
    - completed brickwork leaves the look-ahead and shows completed.
  - **The diary:** today's diary lists the four updates.
- **Browser, 6 of 6:**
  - on a phone, the contractor sees this week's plaster at 30%, no update button on the roofer's activity, and what holds the slab;
  - they record 60% with a note, with no sideways scrolling;
  - the site manager looks six weeks ahead.
- **Regression:** all 21 role journeys, the look-ahead, diary and tests browser checks, the architect journey (58 of 58), the screen sweep (0 problems) and the guide (18 of 18) pass.

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
- **Not yet done**: a real domain + Let's Encrypt cert (self-signed for
  now), and SharePoint sync for compliance documents (blocked on Azure AD
  app credentials). GitHub push is unblocked and the remote is kept up to
  date after every commit (see `MEMORY.md`) — production redeploy is now
  just `git pull && docker compose -f docker-compose.prod.yml up -d
  --build` on the VPS, no tar-over-SSH workaround needed.
