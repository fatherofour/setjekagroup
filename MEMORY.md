# Setjeka ERP — Project Memory

This file is a running record of what this repo is, where it came from, and
why key decisions were made. Update it as the project evolves — it exists so
a future session (human or AI) can pick this repo up cold and understand the
reasoning, not just the code.

See `document.md` for the fuller technical write-up (what's built, why, and
every third-party service in use) — this file stays focused on decisions and
history, that one on current technical state.

## What this is

A ground-up rebuild of Setjeka Group's construction ERP, replacing the
previous stack (OpenConstructionERP: FastAPI + React/Vite) with:

- **Frontend:** Next.js (App Router) + Tailwind CSS v4
- **Backend:** NestJS + Prisma 7 + PostgreSQL
- **Auth:** JWT access/refresh tokens, hand-rolled (no Passport)
- **Converter service:** the BIM→CAD→quote pipeline stays in Python,
  extracted as its own standalone microservice (`converter-service/`) rather
  than ported into NestJS. Extraction is done and verified; NestJS
  integration (the backend actually calling it) is not.

## Where it came from

Reference/donor repo: `../OpenConstructionERP` (sibling folder, same parent
directory). That app is *not* being extended further — this repo replaces
it going forward, but its UI, business rules, and design language are the
source of truth whenever "match the old app" comes up. Nothing is copy-pasted
wholesale; each piece is rebuilt fresh in the new stack, picking only what's
actually needed (see decisions below).

Built across Claude Code sessions starting 2026-09-19, in the working
directory `05 Application/setjeka-erp`. The full conversation history for
the build lives in that Claude Code session's transcript — this file is the
durable summary that survives when that session ends.

**Requirements source of truth:** `../../02 Client Inputs/Requirements/Setjeka
Feature and Functional Requirements Register.xlsx` (115 requirements across
Platform/Development/Project Management/Scheduling/Commercial/Procurement/
Document Control/BIM/Field Ops/QHSE/Collaboration/RFI/Submittals/Risk/Client
Portal/Reporting, plus a User Roles sheet) — confirmed line-by-line across 3
client meetings, notes for which live in `../../04 Delivery/Meeting Notes/`.
When a feature's exact shape is unclear, check this register and those
meeting notes before guessing or falling back to generic industry
convention — the PROCSA stage mislabeling below is exactly what happens when
that step gets skipped.

## Key decisions so far

- **Why rebuild instead of extend OpenConstructionERP:** the donor app had
  accumulated general-purpose OSS-ERP scope beyond what Setjeka needs; a
  fresh app scoped to Setjeka's actual workflows was chosen over continuing
  to trim/rebrand the donor.
- **Converter microservice split:** OpenConstructionERP's BIM/CAD/takeoff
  code is ~46,000 lines across 4 modules, tightly coupled to its own DB/auth.
  Investigation found the actual algorithmic core (file conversion +
  quantity extraction, zero DB/auth imports) was only ~6,270 lines across 10
  files — verified file-by-file with grep before copying, not assumed.
  That slice was extracted into `converter-service/` (standalone
  FastAPI, its own `.venv`) and tested against real fixtures: a real DXF, a
  real 2.4 MB IFC file converted via the actual installed DDC binary (297
  elements, 21 categories), a real PDF vector-takeoff detection, and the
  scale-calibration math. See `document.md` §4 for full detail. The NestJS
  backend does not call this service yet — that wiring is still open.
- **Auth:** `@nestjs/passport` was tried first and dropped after a DI wiring
  issue with its dynamic module in this Nest 12 + ESM setup; replaced with a
  small hand-written `JwtAccessGuard`. Fewer moving parts, same behavior.
- **"Keep me signed in":** checked → 14-day refresh token in `localStorage`;
  unchecked → 1-day refresh token in `sessionStorage` (cleared when the tab
  closes). Both TTLs are env-configurable (`JWT_REFRESH_TTL`,
  `JWT_REFRESH_TTL_REMEMBER`).
- **Forgot/reset password:** fully built end-to-end except actual email
  delivery. The reset link is logged server-side (`AuthService` via Nest's
  `Logger`) as a stand-in until Resend (or similar) is wired up. Tokens are
  single-use, SHA-256-hashed at rest, 1-hour expiry.
- **Nav structure:** "Overview" is a collapsible sidebar group containing
  "My Day" and "Dashboard" as children (mirrors OpenConstructionERP's
  `grp_overview` pattern), not three flat top-level items. "Projects" is a
  separate top-level entry.
- **AI chat widget:** floating button (bottom-right) + slide-in panel exist
  as a UI shell only — matches the old app's placement/look, but sending a
  message just shows a placeholder reply. No LLM is wired up yet; that's a
  deliberately separate, not-yet-scoped task.
- **Dashboard — finalized, full widget parity with the donor app:** first
  pass skipped widgets for modules that don't exist yet; on review, the
  call was reversed to *"add everything on the old dashboard"* but with a
  hard rule that survived the reversal — never fabricate a number. Widgets
  with no real data source behind them yet (Finance summary, Estimate
  resources, BIM coverage, Operations snapshot, Latest site photos,
  Upcoming milestones, RFI turnaround, Submittals pending, Inspections
  quality, Punch list quality, Cases) render as explicit "Coming soon"
  cards naming the module they depend on, never as empty/zeroed stat tiles.
  Everything else on the dashboard is real: KPI ribbon (5 tiles now incl.
  Planning, archived excluded from Total), a Getting Started checklist
  (2 real+checkable steps, 2 marked "Soon"), Portfolio overview / Today
  panels (real counts where trackable, "Not tracked yet" where not), Sites
  list, Activity feed (derived from project `createdAt`/`updatedAt` — no
  activity-log table needed), and a "Projects by status" bar chart. Two
  widgets use free/open data sources deliberately chosen to avoid needing
  an API key before they're useful: **project site map** (Leaflet +
  OpenStreetMap tiles) and **site weather** (Open-Meteo, with a picker when
  more than one project has coordinates), both driven by optional
  `latitude`/`longitude` fields on `Project`.
- **Sidebar mobile responsiveness (bug caught during dashboard QA):** the
  sidebar had no mobile handling at all — at 390px width it ate ~60% of the
  screen permanently. Fixed with an off-canvas drawer pattern (fixed +
  `-translate-x-full` below `lg`, `lg:static lg:translate-x-0` at `lg`+),
  a hamburger button in the header, and a backdrop that closes it on click
  or navigation. This is a shell-level fix, not dashboard-specific — it
  applies to every page.
- **Header: project switcher + stage badge + functional search.** Added a
  "current project" concept (`CurrentProjectProvider`, `localStorage`-backed)
  — selecting a project (via the switcher pane, the search palette, or
  visiting its detail page) sets it as the header's active context. Added a
  stage field to `Project`, editable via a header dropdown that PATCHes
  `/api/projects/:id` optimistically (rolls back on failure). The header's
  center search box went from a visual placeholder to a real `⌘K` command
  palette that filters projects live. Mobile header was overflowing once
  these were added — fixed by hiding the notifications/help placeholders
  below `sm` and shrinking the switcher's truncation width, rather than
  cutting any of the three new features.
- **PROCSA stage mislabeling, found and fixed.** The stage field above was
  originally built (previous session) using generic external PROCSA-2015
  stage names — an assumption made without checking what Setjeka actually
  uses, because the requirements register hadn't been read yet at that
  point. Reading it (R17) plus the 3rd meeting's transcript surfaced the
  real, verbatim Setjeka standard: **Initiation → Inception → Concept →
  Design → Documentation & Procurement → Construction → Closeout** (7
  stages, 0-indexed) — not PROCSA's 6-stage numbering. Renamed the Prisma
  enum `ProcsaStage` → `ProjectStage` and corrected every label. Lesson
  reinforced: check the register/meeting notes before falling back to
  generic industry convention, even for something as standard-sounding as
  "PROCSA stages."
- **Project Management foundations (R13–R19 in the requirements register).**
  Project management is core to what Setjeka does, so this is being built
  directly against the register rather than improvised. First slice, chosen
  as "foundations before features": richer `Project` fields (client,
  developer, location, value, dates, `projectType`, `contractForm` — FIDIC/
  JBCC/GCC/NEC, which per Meeting 002 §2.6 drives role titles, e.g. FIDIC
  calls the PM a "Project Engineer"), a flexible self-referencing project
  hierarchy (`ProjectNode`: phase/building/floor/zone/work package — R15),
  and a team directory (`ProjectMember`: linked `User` or lightweight
  external contact, role drawn from the register's User Roles sheet — R14).
  Also shipped the app's first per-project workspace page
  (`/projects/[id]`), which doubles as the natural place to edit these
  fields and sets the project as the header's current-project context on
  visit. **Deliberately deferred, not forgotten:** R16 task management, R18
  the control-tower dashboard, R19 issue register, and an internal-user
  picker for team members (blocked on a "list users" endpoint that doesn't
  exist yet — every member today is added as an external contact even when
  they're actually Setjeka staff).
- **AI chat button icon:** swapped the generic `MessageCircle` icon for the
  Setjeka icon-mark (`/setjeka/icon-mark.png`, inverted white — same
  treatment as the sidebar logo) so the floating trigger carries the brand
  mark instead of a stock icon.
- **Client/Owner ↔ Opportunities integration:** deferred in the old repo
  until its Opportunity module is finalized; carries over as the same open
  question here once a Projects create-flow is built out further.
- **Projects Overview (card grid) + trimmed create-project form.** Reworked
  the sidebar's "Projects" entry from a flat table-list page into a
  collapsible group containing a single "Overview" item, matching the old
  app's card-grid layout (map thumbnail, avatar, tag chips, total-value
  stat, relative-updated footer) — but scoped to fields that actually exist
  here: name, description, location (real non-interactive Leaflet/OSM
  thumbnail with a location pin), currency, stage, last-updated.
  Deliberately **not** ported: MasterFormat classification tag, BOQ count,
  PDF-export badge, "On map" toggle — those modules don't exist in this
  repo. The create form (`/projects/new`) is a single trimmed form, not
  OpenConstructionERP's full multi-step wizard-with-presets-and-
  module-scoring — it ports only what was already kept after that repo's
  own form-trimming pass: USD/ZAR currency, ASAQS/NRM classification
  standard, auto-generated project code (`PRJ-<year>-NNNN`, previewed via
  `GET /projects/next-code` without reserving the sequence number), and
  contingency % with a live-computed amount preview. `Project` gained
  `projectCode` (unique), `description`, `currency`, `classificationStandard`,
  and `contingencyPct` fields to support this; the `/projects/[id]` detail
  page's view/edit modes were extended to match every field the create form
  collects, so the round-trip is complete. Verified live end-to-end
  (login → Overview → New Project → detail view/edit → Overview again),
  including dark mode and 390px mobile width.
- **Global FAB overlap bug (found during this pass's mobile QA).** The
  fixed-position AI chat button (`bottom-4 right-4`) permanently obscured
  the last card's content at full scroll-to-bottom rest on the new Overview
  page at mobile width — not a screenshot artifact, confirmed by scrolling
  an actual viewport to its max and comparing before/after. This wasn't
  Overview-specific: the shared `<main>` container in `(app)/layout.tsx` had
  no bottom clearance reserved for the FAB on *any* page. Fixed at the
  layout level (`pb-24`/`sm:pb-28` instead of symmetrical `py-*`) rather
  than patching the one page that happened to expose it.
- **Contractors directory (PROC "Vendor/Contractors Master" foundation
  slice) + Team now pulls from it.** User clarified the business model:
  Setjeka is purely a project manager — it never does the delivery work
  itself, so a project's Team is inherently made up of multiple external
  contractors/vendors, and those should come from a real shared directory
  rather than being retyped per project (the old flow had every external
  team member as a one-off free-text entry). Added a `Contractor` model
  (company name, trade/specialty as free text — not an invented taxonomy,
  contact name/email/phone/address/notes) as a global, shared list (no
  per-owner scoping — it's Setjeka's own directory, not per-project data),
  plus a `/contractors` page (nav: new "Procurement" sidebar group,
  mirroring the "Projects" group pattern) with inline add/edit/delete.
  Deleting a contractor still assigned to any project's team is blocked
  (409) rather than silently orphaning that team entry's company name.
  `ProjectMember` gained an optional `contractorId` FK: picking a contractor
  from the Team panel's dropdown sets it, with `externalName` reused to
  mean "the specific contact person at that contractor for this project"
  (optional) rather than a fully manual name+company pair. The old
  one-off/manual entry path is kept as a fallback ("— One-off contact —")
  for externals not worth adding to the master list. Superseded by the much
  larger Organisation/Party registration build below — compliance tracking
  and the onboarding-approval workflow that used to be listed here as
  deferred are now built.
- **Native `<select>` dropdowns replaced with a custom `Select` component
  app-wide.** User reported the highlighted-option color in open dropdowns
  was blue; tried `accent-color` globally first since that's the standard
  CSS lever for this, but it does not reliably control the OS-rendered
  highlight row inside an open native `<select>` popup on Chrome/Windows
  (confirmed by screenshot — still blue after the CSS change). Built
  `frontend/src/components/ui/Select.tsx` (button + custom absolutely-
  positioned listbox, full keyboard nav, closes on outside click/Escape,
  highlighted row and check-mark styled in brand emerald) and swapped every
  `<select>` in the app to use it (New/Edit Project forms, the project
  hierarchy type picker, the Team role/contractor pickers, the dashboard
  weather site picker) so the highlight color is fully within the app's own
  control everywhere, not just wherever this bug happened to be reported.
- **Organisation/Party registration — the Contractors module generalized
  per a large external spec, scoped down deliberately.** The user pasted a
  ~34-section "Contractor/Consultant/Supplier/Vendor Registration module"
  spec and said to build what's necessary from it and ignore the rest. A
  codebase audit first (Explore agent) confirmed this app has **no** RBAC
  enforcement anywhere (`JwtAccessGuard` — is-authenticated-only — is the
  sole authorization check in every controller; `User.role` is stored but
  never checked), no file/document upload or storage, no notification
  system, and no generic audit log. Per the spec's own rule ("integrate
  with existing X, don't build a new one" — and there is no existing X for
  any of those four), the build stayed inside what the app can actually
  support:
  - `Contractor` gained `classifications` (enum array — Contractor/
    Consultant/Supplier/Subcontractor/ServiceProvider/Manufacturer/
    SpecialistContractor/Other; multi-select, since an org is never
    permanently just one type), `disciplines` (free text, not a fixed
    enum — same "don't fabricate a taxonomy the client hasn't confirmed"
    reasoning as `tradeType`, reinforced by the PROCSA-stage lesson above),
    `registrationNumber`/`taxVatNumber`/`tradingName`/`country`/
    `stateProvince`/`city`/`yearEstablished`/`website`, and two independent
    status fields: `registrationStatus` (Draft→Submitted→UnderReview→
    MoreInfoRequired→Approved/Rejected/Suspended/Archived) and
    `prequalificationStatus` (kept separate per the spec — an org can be a
    fully approved registered vendor while still Not Assessed for
    prequalification on a given scope).
  - New `OrganisationContact` (multiple contacts per org, with
    isPrimary/canReceiveRfqs/canReceiveCorrespondence/
    canReceivePaymentNotifications flags), `ComplianceRecord` (covers both
    compliance documents and professional registrations — same shape, one
    model instead of two; a Valid/ExpiringSoon(30-day window)/Expired/
    PendingVerification status is **computed at read time from
    `expiryDate`**, never stored, per the spec's explicit instruction),
    `OrganisationProjectAppointment` (the §29 architecture fix: role,
    contract value/dates/scope live on a per-project appointment record,
    never on the organisation itself, so the same contractor can be Main
    Contractor on one project and Subcontractor on another), and
    `OrganisationStatusHistory` (scoped audit trail for just this entity's
    status changes, not an app-wide log).
  - `/contractors/new` is a single focused create step (not the spec's
    10-step wizard) that posts immediately (status defaults to Draft) and
    redirects to `/contractors/[id]`, mirroring the existing
    `projects/new` → `projects/[id]` pattern exactly — this satisfies
    "don't lose data between steps" without inventing a client-side
    wizard/autosave framework the rest of the app doesn't have. The detail
    page is the app's first tabbed workspace (`components/ui/Tabs.tsx`,
    plain buttons, no new dependency): Overview / Contacts / Compliance /
    Project Associations.
  - Duplicate detection (`GET /contractors/check-duplicate`) warns on
    name/registration-number/tax-number match but never blocks creation,
    per the spec.
  - **Explicitly deferred, and why** (see the plan file used for this task,
    `abundant-leaping-lemon.md`, for the full table): real file upload
    (no storage infra — `ComplianceRecord.attachmentUrl` is a link-only
    placeholder), an `organisation.*` RBAC permission catalog and the
    Financial Information section (no RBAC to gate it, and storing bank
    details with zero access control would be a real liability — safer to
    defer the whole section than ship it unprotected), notifications (none
    exist), Project Experience and Equipment records (no consuming
    workflow yet — Tender/Prequalification, Resource Planning aren't
    built), and deep Contractor/Consultant/Supplier-specific sub-profiles
    (grade/capacity, staff counts, MOQ/lead time) — V1 ships the shared
    core architecture, which is the part the spec itself frames as most
    important.
  - **Real bug found and fixed during this build, not test noise:**
    creating a contractor with a name that already exists (the unique
    constraint) threw an unhandled 500 instead of a friendly error, because
    nothing caught Prisma's `P2002`. Confirmed via a genuine leftover-test-
    data collision, not manufactured — fixed by mapping `P2002` to a 409
    `ConflictException` in both `create` and `update`. Matters especially
    here since duplicate detection is explicitly a *warning*, not a
    blocker, so a real user hitting this collision after seeing (and
    dismissing) the warning was always a live path, not just a test
    artifact.
- **Document upload for compliance records + Financial tab, built on user
  request (reversing two of the deferrals just above).** The user asked for
  real file upload ("stores on SharePoint and an upload folder... on the
  servers") and for the deferred Financial Information section, positioned
  as a tab after Project Associations.
  - **Uploads:** local disk storage only for now (`backend/uploads/vendor-
    documents/`, path from `UPLOAD_DIR` env var, gitignored) via multer
    `diskStorage` + `FileInterceptor` — 20MB limit, extension allowlist
    (pdf/jpg/jpeg/png/doc/docx/xls/xlsx). `ComplianceRecord.attachmentUrl`
    (the link-only placeholder from the previous slice) was replaced with
    `attachmentStoredName`/`attachmentFilename`/`attachmentMimeType`/
    `attachmentSize` plus a `sharePointUrl` column reserved for later.
    **SharePoint sync is NOT built** — it needs an Azure AD app registration
    (tenant ID, client ID/secret, target site+drive) the user hasn't
    provided yet; asked about this and awaiting an answer, tracked as
    open/pending below. Download is auth-gated (`GET .../document`, streamed
    through the API, not a public static path) since a plain `<a href>`
    can't carry the JWT — the frontend fetches it as a blob via
    `apiFetchBlobUrl` and opens an object URL instead.
  - **Financial tab:** added directly to `Contractor` (bankName,
    bankAccountName, bankAccountNumber, preferredPaymentMethod,
    paymentTerms, creditTerms, withholdingTaxInfo) rather than a separate
    model, since it's a single profile per organisation, not a list. Ships
    with a visible on-page warning that this app still has no RBAC, so the
    tab is visible to any signed-in user like everything else — the user
    explicitly chose to proceed with that known gap rather than defer the
    feature further.
- **Sidebar made collapsible** (desktop only, `lg:` — mobile keeps its
  existing off-canvas drawer untouched) — a new icon-only rail state
  (`lg:w-[68px]`) toggled by a `PanelLeftClose`/`PanelLeftOpen` button
  pinned to the bottom of the sidebar, state persisted to `localStorage`
  (`setjeka_sidebar_collapsed`). Nav group icons stay visible collapsed;
  labels/chevrons/children hide via `lg:hidden`; clicking a group icon while
  collapsed re-expands the sidebar rather than trying to flyout its
  children.
- **Real, pre-existing layout bug found and fixed while testing the
  collapse toggle.** The app shell's `<main>` has always had
  `overflow-y-auto`, but its ancestor chain was never actually height-bound
  to the viewport — `body` used `min-h-full` (a floor, not a ceiling) and
  the `(app)/layout.tsx` wrapper was plain `flex flex-1` with no height of
  its own. So on any page tall enough to need scrolling, the **whole
  document** scrolled as one unit instead of just `<main>` — meaning the
  sidebar and header would scroll out of view too, since `position: static`
  siblings scroll with their container. This had been true since the
  sidebar/header were first built, just never surfaced, because most QA
  screenshots this session were taken at scroll-top or as full-page
  composites. It surfaced now because the new collapse button sits at the
  very bottom of the sidebar, and Playwright's click auto-scrolled the
  whole (unbounded) page to reach it. Fixed by giving the `(app)/layout.tsx`
  root wrapper an explicit `h-dvh` instead of `flex-1` — an absolute
  viewport-relative height that doesn't depend on `body`/`html` being
  height-bound, so it doesn't risk affecting `/login` or any other route
  group. Verified: after the fix, scrolling `<main>` by 600px leaves the
  `<aside>`'s bounding box exactly at `{x:0, y:0}` matching the viewport
  height, confirmed via Playwright `boundingBox()` before/after.
- **Payment records + contractor performance ratings, on user request.**
  Two more additions to the Contractors module:
  - `PaymentRecord` (contractorId, an *optional* link to a specific
    `OrganisationProjectAppointment` since not every payment ties to one
    project, amount, currency, paymentDate, reference, method, notes) —
    surfaced as a "Payments made" list inside the existing Financial tab
    (not a separate tab), per how the request was phrased ("the financial
    should have a record of payment made to vendors"). Totals are summed
    **per currency, never combined** — adding raw USD + ZAR numbers
    together would be meaningless.
  - `OrganisationRating` (contractorId, a *required* link to an
    appointment — rating is about performance on a specific completed
    engagement, matching the user's own example: "we close off on
    Radisson Blu project... we rate them"; `raterType` INTERNAL/CLIENT;
    `stars` 1-5; `comment`) — a new **"Ratings" tab**, positioned right
    after Financial per the request ("the next close to financial should
    be rating"). Shows a running average (overall, and split by rater
    type) at the top of the tab.
  - **"Client gets to rate them from the client portal" is only
    half-built, deliberately.** There is no client-facing portal in this
    app — no client user accounts, no client auth, nothing for a client to
    log into. Building that is a significant separate undertaking (a whole
    second auth surface), not a natural extension of today's session. What
    *is* built: the `CLIENT` rater type exists and can be recorded today —
    just by Setjeka staff, on the client's behalf (e.g. after a phone call
    or email), through the same authenticated form as an internal rating.
    The UI says this plainly rather than implying self-service submission
    exists. Deliberately **not** built: an unauthenticated public rating
    endpoint — that would be a spam/abuse vector with zero portal
    infrastructure (no client identity, no rate limiting, no way to tie a
    submission to a real engagement) to guard it.
  - New `StarRating` UI primitive (`components/ui/StarRating.tsx`):
    read-only (`pointer-events-none`) when used for display in a list,
    interactive click-to-set when given an `onChange` — verified during
    testing that the read-only mode is genuinely inert (a test script
    accidentally targeted a list-display star and Playwright correctly
    refused the click, confirming the `pointer-events-none` guard works
    as intended rather than being dead code).

- **Compliance document in-app preview** (user request): a
  `DocumentPreviewModal` renders images/PDFs inline (`<img>`/`<iframe>` on
  a blob URL) instead of always opening a new tab; Word/Excel show a
  "Download to view" fallback since there's no in-browser renderer for
  those without a third-party service — not viable for private,
  auth-gated documents.

- **Project collaboration module** (user request — full detail in
  `document.md` §2.5): Tasks, Issues, a polymorphic Comment (entityType/
  entityId, inspired by a pattern found in OpenConstructionERP's own
  codebase), Notifications (finally wiring up the `Bell` icon that was a
  dead placeholder all session), and a per-project Control Tower dashboard
  that restructured `/projects/[id]` into a tabbed workspace (Overview/
  Tasks/Issues/Team/Structure). Closes requirements register rows R16/
  R18/R19. Verified end-to-end via curl by creating a second real `User`
  row and linking it as a `ProjectMember` (the UI has no picker for this
  yet — `ProjectMember.userId` — but the backend DTO already accepts it),
  confirming all three notification types (assignment ×2, @mention) fire
  correctly. `CommentThread` was also retrofitted into the Schedule
  module's `ActivityDetailPanel`, so schedule activities now carry the
  same discussion surface as tasks/issues.

- **Document Control module** (user request, second of the "what other
  submodules belong under Projects" picks — full detail in `document.md`
  §2.6): repository/folders, immutable revision control ("current" always
  computed at read time, never stored), a review workflow reusing the
  existing polymorphic `Comment` (`CommentEntityType` gained
  `DOCUMENT_REVISION`), transmittals, and a per-revision access-log audit.
  File storage reuses `compliance-records/upload.util.ts`'s exact multer
  pattern in a new `project-documents/upload.util.ts`. Comparison is
  side-by-side (two preview panes), not true overlay diffing — no
  rendering/diffing library exists in this app. Verified end-to-end via
  curl: two revisions confirmed immutable and correctly ordered, a review
  + comment round-tripped, view/download each produced exactly one
  `DocumentAccessLog` row, a transmittal was created and issued. Same
  pre-existing gap as Compliance documents: cascading a project delete
  removes the DB rows but not the files on disk — cleaned up manually.

- **Risk Register module** (user request, third of the "what other
  submodules belong under Projects" picks — full detail in `document.md`
  §2.7): probability×impact score always computed at read time (never
  stored), a fixed `HIGH_SEVERITY_THRESHOLD = 15` (of 25) for escalation
  since no configuration surface exists anywhere in this app for any
  business rule, and `CommentEntityType` gained a fifth value, `RISK`.
  **Caught a real, previously-shipped bug while building it**: `ProjectTask`/
  `ProjectIssue`'s date fields (`dueDate`) were passing raw date strings
  straight to Prisma 7 instead of `new Date(...)`-parsing them first,
  which Prisma rejects with a 500 rather than coercing — this had been
  live since the Project Collaboration build but no verification pass in
  that module had ever actually set a due date. Fixed in all three
  services (tasks, issues, risks) once found. Verified end-to-end via
  curl (escalation notification fired at score 25, a synthetic overdue
  notification appeared for a past `reviewDate`, dashboard counts matched
  by hand) and Playwright (create/comment/score-badge/dashboard-count, all
  clean, zero console errors).

- **RFI + Submittals module** (user request, fourth and last of the "what
  other submodules belong under Projects" picks — full detail in
  `document.md` §2.8): grouped and built together since the register
  files both under one category, Technical Administration. `Rfi` gained
  a `ballInCourtId` that isn't a register ask — a small addition (whose
  turn it is to act) found genuinely useful in OpenConstructionERP's own
  RFI model, brought in per the user's standing invitation to reuse what
  that research found worth it — defaulting to the assignee, flipping to
  the raiser on response, notifying on every change. `Submittal.status`
  is the one place this session where a category-like field is a closed
  enum rather than free text, because the register explicitly names all
  six states; `SubmittalStatusHistory` mirrors the existing
  `OrganisationStatusHistory` pattern exactly (same `$transaction`
  shape as `ContractorsService.updateStatus`). `CommentEntityType` now
  has seven values, `NotificationType` seven. Verified end-to-end via
  curl (ball-in-court defaulted and flipped correctly, two
  `SubmittalStatusHistory` rows landed in order, both notification types
  fired, dashboard counts matched by hand) and Playwright (RFI
  create→respond, submittal create→two status changes→history list, both
  comment threads, Overview's two new stat cards — all clean, zero
  console errors). This closes the four-module sequence
  (Document Control → Risk Register → RFI + Submittals) the user asked
  for after reviewing what else belonged under "Projects."

- **Schedule module** (user request — full detail in `document.md` §2.4):
  Gantt/Calendar/Card/Grid views over one shared activity+dependency
  dataset, a from-scratch CPM engine (working-day calendar, inclusive
  duration convention, forward/backward pass, float, critical path — no
  charting library used anywhere), and MS Project XML import (not
  Primavera — that format was an open, unconfirmed client question).
  Two real bugs caught and fixed before shipping: an off-by-one in the
  duration convention (found by hand-tracing a worked example), and MS
  Project XML's timezone-naive timestamps silently shifting a day
  depending on server timezone (found by inspecting actual import output,
  not assumed). Baseline save/list/delete is built and verified; the
  Gantt ghost-bar variance *display* against a baseline is not — see the
  deferred table in `document.md` §2.4.

## Local dev environment

- Backend: NestJS dev server on port 4000 (`npm run start:dev` in
  `backend/`), Postgres database `setjeka_erp` on the machine's native
  Postgres 18 install (not Docker), role `setjeka_erp` / password
  `setjeka_erp_dev`.
- Frontend: Next.js dev server on port 3000 (`npm run dev` in `frontend/`).
- Demo login credentials are stored locally (not in the repo) at
  `~/.setjeka-erp/.demo_credentials.json`, matching the pattern used for
  OpenConstructionERP's own demo account. **Admin email changed** (user
  request) from `admin@setjekagroup.co.za` to
  `setjeka@setjekagroup.co.za` — same password, same user row (just the
  email column updated via `UPDATE "User" SET email = ...`, not a
  delete+recreate), applied to both local dev and production. The
  credentials file above was updated to match. Also fixed
  `prisma/seed.ts`, which still hardcoded the old email — left as-is it
  would have created a second, duplicate admin user on any future fresh
  install/reseed instead of the intended one.

## Favicon

Replaced the default Next.js favicon with the Setjeka "S" mark
(`public/setjeka/icon-mark-512.png`, flattened onto white — the app's
other uses of that mark are white-on-green via a CSS invert filter, which
doesn't suit a favicon shown on a light browser-tab background). No image
tool was available in this environment (no PIL, no ImageMagick, no
`sharp` pre-installed) — installed `sharp` + `png-to-ico` in a scratch
directory just for this one conversion (16/32/48/64px PNGs → one
multi-resolution `.ico`), then discarded the scratch install. Replaces
`frontend/src/app/favicon.ico`, which Next.js's App Router picks up
automatically (no metadata config needed). Deployed to both local dev and
production (the frontend Docker image needed a rebuild for prod, since the
favicon is baked into the build).

## Production deployment

**Live now** at `https://173.212.202.149` (raw IP, self-signed cert — no
domain yet), on the same VPS that used to run OpenConstructionERP. That
stack was torn down (`docker compose down` in `/opt/setjeka`, user
confirmed no backup needed — it's being fully replaced, not run
alongside) and setjeka-erp deployed in its place at `/opt/setjeka-erp`,
by tarring the repo (excluding `node_modules`/`.next`/`dist`/`uploads`)
and streaming it over the existing SSH connection — **not** via git clone,
since there was no GitHub remote pushed yet at deploy time (see below).

- **Stack**: `docker-compose.prod.yml` at the repo root — `postgres`
  (plain `postgres:16-alpine`, not OpenConstructionERP's `pgduckdb` image,
  since this app has no DuckDB dependency) + `backend` + `frontend` +
  `nginx` (4 services, vs. OpenConstructionERP's 3 — see why below).
  `backend/Dockerfile` and `frontend/Dockerfile` are new; `deploy/nginx.conf`
  and `deploy/README.md` document the full first-time-setup and redeploy
  procedure.
- **Why nginx is a separate container here** (OpenConstructionERP baked it
  into the frontend image): that app's frontend was a static Vite SPA nginx
  could serve directly. This app's frontend is a Next.js server (`next
  start`/`server.js`) — dynamic routes like `/projects/[id]` need a live
  process, not static files — so nginx here is a pure reverse proxy to two
  upstream Node processes (`frontend:3000`, `backend:4000`), not a file
  server. TLS-in-nginx-not-Caddy and the self-signed-cert approach are
  reused as-is from OpenConstructionERP's proven setup on this same VPS
  (see that repo's `deploy/docker/nginx.conf` for the full Caddy-failure
  writeup).
- **Two real deployment bugs found and fixed during this first deploy:**
  1. The frontend container's healthcheck failed (`unhealthy`) even though
     `next-server` logged "Ready" — Next's generated standalone
     `server.js` does `process.env.HOSTNAME || '0.0.0.0'`, and **Docker
     auto-sets `HOSTNAME` to the container ID for every container**, so it
     was binding to that container-ID "hostname" (resolving only to the
     container's own bridge IP, e.g. `172.18.0.4:3000`) instead of all
     interfaces — reachable from nowhere outside that exact container.
     Fixed with an explicit `ENV HOSTNAME=0.0.0.0` in `frontend/Dockerfile`'s
     runtime stage, overriding Docker's own env var.
  2. `prisma/seed.ts` (used to create the initial admin account) is run
     directly via `tsx`, not compiled — it imports the generated Prisma
     client from its **source** path (`src/generated/prisma`), but
     `backend/Dockerfile`'s runtime stage only copied `dist/` (the
     compiled output). Fixed by also copying `src/generated` into the
     runtime image, just for that one script.
- **Seeding**: `docker compose exec backend sh -c "SEED_ADMIN_PASSWORD='...' npx tsx prisma/seed.ts"`
  creates `admin@setjekagroup.co.za` — there's no self-registration.
- Verified end-to-end after fixing both bugs: `curl` login, and a real
  Playwright browser session (login → dashboard → contractors) against
  `https://173.212.202.149` itself, zero console errors or failed requests.

## Open/pending work

- **GitHub push blocked on credentials.** User asked to push this repo to
  `https://github.com/fatherofour/setjekagroup.git` (without the usual
  Claude co-author attribution this time — explicit instruction, to be
  announced/credited separately later). This machine has **no** git
  credential for GitHub at all: no SSH key for `github.com` in `~/.ssh`
  (only `known_hosts`), no `credential.helper` configured, no `gh` CLI
  installed. The deploy above went ahead anyway via a direct tar-over-SSH
  copy to the VPS specifically because it doesn't depend on this — but the
  actual GitHub push itself needs either a PAT or an SSH deploy key from
  the user before it can happen.
- NestJS → converter-service integration (the extraction itself is done;
  nothing in `backend/` calls it yet).
- AI-vision plan reading in the converter service (only the pure scale-math
  half was ported; no AI provider call was built — same open scoping
  question as the chat widget).
- Real AI backend for the chat widget (not started, not scoped).
- Notifications and Help — present in the header as placeholders, no
  backend behind either yet.
- Search is functional but scoped to projects-by-name only, since that's
  the only searchable entity that exists — will need to expand as more
  modules land.
- Team directory has no internal-user picker yet (no "list users" endpoint) —
  external-contact entry only, even for Setjeka staff.
- Organisation/Party registration: no RBAC exists anywhere in this app, so
  the status/review endpoints **and now the Financial tab** are open to any
  authenticated user — a real, known gap the user chose to accept rather
  than defer the feature further (see decisions above). Compliance document
  storage is local-disk-only; **SharePoint sync is asked-for but not built
  — blocked on the user providing Azure AD app credentials** (tenant ID,
  client ID/secret, target SharePoint site+drive). Project Experience,
  Equipment records, and the deep Contractor/Consultant/Supplier-specific
  sub-profiles are deferred pending a real consuming workflow. The rest of
  the PROC module (RFQ, Quotes, Evaluation, Purchase Orders, Vendor
  Performance scorecard, Vendor Portal) is still fully ahead.
- The client-portal hard-rule-on-approvals is specified in the meeting
  notes but not yet built — CLI in the requirements register is the one
  remaining module adjacent to Project Management, blocked on a real
  second auth surface (client accounts) that doesn't exist anywhere in
  this app. RFI, Submittals, Risk Register, and Document Control
  (RFI/SUB/RISK/DOC) are all now built — see `document.md` §§2.6-2.8.
- Schedule module (see `document.md` §2.4 for the full deferred table):
  Primavera P6 import, 4D/BIM schedule simulation (explicitly out of
  scope per Meeting 002), cost/budget fields on activities, drag-to-
  resize/reschedule directly on Gantt bars, and the baseline-vs-current
  variance overlay/report (save/list/delete baseline works; the
  comparison view doesn't exist yet) are all not built.
- Project collaboration module (see `document.md` §2.5 for the full
  deferred table): comment threading/replies, real email/SMS/push
  notifications, and websocket real-time updates (the bell polls every
  60s instead) are not built. The frontend still has no picker for
  linking a `ProjectMember` to a real platform login (`userId`) — the
  backend already accepts it, this is a UI gap only. Document Control
  (§2.6), Risk Register (§2.7), and RFI + Submittals (§2.8) are all now
  built — the full four-module "what else belongs under Projects"
  sequence is complete. Client Portal (CLI) is the one remaining
  register module adjacent to Project Management, blocked on a real
  second auth surface this app doesn't have.
- No production deployment yet for the Schedule, Project collaboration,
  Document Control, Risk Register, or RFI/Submittals modules — the
  tar-over-SSH + `docker compose up -d --build` deploy is blocked in
  this session's current permission mode (see below), still pending.
  The GitHub push itself is unblocked and up to date as of the RFI +
  Submittals commit.
- **A free temporary domain was identified but not fully wired up**:
  `173-212-202-149.sslip.io` resolves to the VPS today (sslip.io embeds
  the IP in the hostname — no signup, works instantly), and `certbot` is
  already installed on the VPS. Issuing the actual Let's Encrypt
  certificate (which needs nginx briefly stopped) was blocked by this
  session's auto-mode permission classifier under a "DNS / Domain / Cert
  Changes" gate. The VPS code deployment (git-clone-based redeploy of
  `/opt/setjeka-erp`, replacing the old tar-over-SSH copy) was similarly
  blocked under a "Production Deploy" gate. Both need the user to either
  exit auto mode for those two steps or add a Bash permission rule
  (Settings → Permissions) before they can be completed.
- Converter service deployment (Dockerfile exists, not deployed anywhere).
- OpenStreetMap tile usage: fine for dev, but its usage policy disallows
  heavy production traffic against the free tile server — needs a
  self-hosted or paid tile source before real production load (see
  `document.md` §5.1).
