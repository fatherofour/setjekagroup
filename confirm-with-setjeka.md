# To confirm and follow up with Setjeka

What we need from Setjeka Group to finish, deploy and fine-tune the platform, as at 7 November 2026. Each item says what we built in the meantime, so nothing is waiting on an answer to keep working, but each answer may change how it behaves. Technical detail for every feature is in `document.md` (section numbers in brackets).

Status key: **Decide** means only Setjeka can make the call. **Confirm** means we built a sensible default; please check it. **Provide** means we need information or access from them.

---

## 1. Decisions that hold things up

| # | Item | Why it matters | Status |
|---|---|---|---|
| 1.1 | **Field operations and QHSE scope.** These were included at Meeting 3 but are not in the signed scope of work. Is this release 2, or a change request? | Already built so the platform is complete while this is agreed: tests and hold points, hidden works, HSE incidents, permits to work, and the site manager's daily diary, look-ahead and plant register. The commercial position still needs agreeing. | Decide |
| 1.2 | ~~**Data residency (POPIA).**~~ **Decided 4 Nov:** data is stored in South Africa, where Setjeka is registered. | We host in South Africa. Still to check: whether an AI assistant may use an overseas service, and the basis for moving Nigerian projects' personal data to South Africa under Nigeria's NDPA (usually a contract clause or consent). | Decided |
| 1.3 | ~~**E-signatures (ECT Act).**~~ **Decided 4 Nov: the signatures as built are acceptable.** Approvals are signed by drawing, uploading or typing a signature, or by plain acceptance, and are stamped onto the document. Is that enough for Setjeka's approvals, or do some need an advanced electronic signature? | It affects client approvals, payment certificates and stage gates. | Decide |
| 1.4 | **Document numbering** (parked since October). Should numbers follow originator / type / purpose / sequence / revision? This affects everyone from the client to the contractors. | Today each consultant's own drawing number is read from the title block, and Setjeka documents are numbered per register. | Decide (we owe the proposal, see 6.3) |
| 1.5 | **Drawing numbers from other parties.** The architect's numbers are read from the title block. Should engineers' and contractors' numbers work the same way? | It keeps drawing registers consistent. | Decide |
| 1.6 | **Project-scoped sign-in** (scope §4.9). This was explained in October and is waiting for a go-ahead. | It controls what an outside party sees when they belong to several projects. | Decide |
| 1.7 | **AI assistant.** **Built 4 Nov (§2.50):** it answers questions about a project from its records, on the Qwen 2.5 (3B) model running on the VPS itself. Answers take about 40 seconds on its 4 CPU cores, and it is for the Setjeka team only for now. Still to decide: whether outside parties get it, which tasks come next (drafting minutes and letters, summarising RFIs), and whether a faster server or a paid model service is worth the cost. | We advised against the "obliterated" DeepSeek model: its safety controls were removed, it needs datacentre hardware, and it knows construction no better. | Decide |

| 1.8 | **Countries.** Setjeka works across Africa, mainly South Africa and Nigeria. The platform's rules are South African today: the OHS Act, POPIA, JBCC/GCC, the SA time zone (UTC+2) and SA working days. **Built 4 Nov (§2.46):** each project carries its country (South Africa or Nigeria), which sets the site's day, the currency on new projects, who incidents are reported to (and the lost-days limit), and the permit wording. Please have the HSE consultant in Nigeria confirm the Nigerian rules: the Federal Ministry of Labour (Factories Act s51) for deaths, more than 3 days off and dangerous occurrences; the NSITF within 7 days; and the Lagos State Safety Commission on Lagos projects. Which other countries are needed? | Public holidays per country are not in the programme yet. | Confirm |

## 2. How Setjeka works: please confirm what we built

### Roles and approvals
- **Payment certificates are issued by Setjeka's PM.** The QS prepares the valuation, the contract's consultant reviews it, the PM certifies it, and the client approves payment (§2.25). The user said "most likely", so please confirm.
- **Instructions run client → Setjeka PM/DM → architect.** The client never instructs the architect directly; Setjeka issues the instructions the architect drafts (§2.21).
- **Only the client approves money and client decisions:** variations, Stage 1 documents, stage moves and payment certificates. Setjeka never approves on the client's behalf (Meeting 3). Extension-of-time costs also go to the client as a variation (§2.36).
- **Who issues and closes what on site.**
  - Hold points and hidden works: released or signed off by the named consultant or Setjeka.
  - Permits to work: issued by the HSE manager, the site manager, the PM or the DM.
  - Incidents: investigated and closed by the HSE manager, the PM or the DM.
- **What the client sees.** The client **does not** see NCRs, tests, hold points, hidden works, interfaces, incidents or permits. They **do** see:
  - decided extension-of-time claims and the revised completion dates;
  - every defect, and they can report defects;
  - handover documents once handed over.

### Contract periods by form of contract
These are the usual periods, set as defaults. Each contract can carry its own certify and pay periods. Please check them against the editions Setjeka uses.

| Form | Certify / pay (days) (§2.31) | Delay notice / claim / assessment (days) (§2.36) | Defects period (days) (§2.37) |
|---|---|---|---|
| JBCC | 7 / 7 | 28 / 56 / 42 | 90 |
| GCC | 7 / 28 | 28 / 28 / 28 | 365 |
| NEC | 7 / 14 | 56 / 21 / 14 | 364 |
| FIDIC | 28 / 28 | 28 / 84 / 42 | 365 |
| Other / not set | 7 / 30 | 28 / 28 / 28 | 90 |

- Under FIDIC the PM is titled **Project Engineer** on screens, signatures and certificates.
- Late notice of a delay is **flagged, not refused**. Whether it bars the claim is left to the contract.

### Money
- **Retention** (§2.37): 10% by default, capped at 5% of the contract sum. **Half is released at practical completion, and the rest only on the final valuation after final completion.** The platform now enforces this.
- **Contract price adjustment** (§2.33): the fixed (non-adjustable) share defaults to **15%** and the index lag to **0 months**. Each contract has **one** weighting formula; separate formulae for, say, civil and building portions aren't supported.
- **Minimum quotes:** **3 per tender** by default, set in each project's procurement policy (§2.30).
- **Contingency:** 25% by default on a new project. Approved variations draw it down.
- **Penalties for late completion:** recorded per contract by the PM. Please provide the contract data (see 3.3).

### Quality and site
- **Acceptance criteria starter set** (§2.34). The engineers should check these against their specifications:
  - cubes at 28 days at least 30 MPa;
  - slump 75–125 mm;
  - compaction at least 98 / 95 / 93% Mod AASHTO (base / subbase / fill);
  - insulation resistance at least 1 MΩ;
  - pressure and drainage tests, pass or fail.
- **Hold points stop the programme:** an activity under an unreleased hold point can't have its progress raised. Witness points let the contractor go ahead once the notified time has passed.
- **Hidden works need photos before they can be approved** (§2.35).
- **Handover pack** (§2.38): the usual nine documents per contract are:
  - as-built drawings;
  - O&M manuals;
  - commissioning records;
  - electrical, plumbing and fire certificates of compliance;
  - the contractor's guarantee;
  - manufacturers' warranties;
  - the health and safety file.

  Final completion waits on the whole pack being accepted.

### Health and safety
- **Incidents only, no near misses** (the user's decision, 4 Nov).
- **Reportable incidents:** flagged as reportable to the Department of Employment and Labour (OHS Act s24) for:
  - a death;
  - an injury that keeps someone off work for more than 14 days;
  - a dangerous occurrence.

  This is a starting rule, so please have Setjeka's HSE consultant confirm it.
- **Lost-time injury frequency rate (LTIFR)** is now worked out per **200 000 hours**, from hours worked in the signed site diaries (§2.43). Does Setjeka report it per 200 000 or per 1 000 000 hours?
- **Permits to work** (§2.42):
  - each permit runs for at most **7 days**;
  - the precaution lists for hot work, working at height, excavation, confined spaces, electrical isolation and lifting come from the Construction Regulations 2014 and should be reviewed by the HSE consultant. Setjeka may also have its own permit forms to match.
- **Not built (not chosen):** toolbox talks and inductions.
- **Plant** (§2.45): inspections are flagged when overdue or due within 7 days, certificates within 30. Cranes, hoists and access equipment must have a certificate. Does Setjeka want operators' daily pre-use checks recorded, and the fixed hire fee tracked against each item?

### Programme and portfolio
- **Baseline variance** (§2.39) counts working days, Monday to Friday. **There is no public-holiday calendar yet.** Does Setjeka want SA public holidays excluded?
- **Portfolio red / amber / green** (§2.40):
  - **red** for more than 5% over the budget plus contingency, more than 10 working days behind the baseline, a contract past its completion date, an overdue client decision, a high risk (score 15 or more), or an open serious incident;
  - **amber** when any of these starts to slip.

  Please confirm the thresholds.

## 3. Information and access we need

| # | What | Used for | Status |
|---|---|---|---|
| 3.1 | **A real bill of quantities** from Setjeka's QS (Excel or CSV) | Testing the BOQ import against their actual format | Provide |
| 3.2 | **The price indices they use** (for example the Stats SA P0151 series) and a contract's escalation data | Setting up contract price adjustment | Provide |
| 3.3 | **Contract data for a live contract:** completion date, penalty per day, retention, defects period | Checking the completion, defects and penalty screens on real figures | Provide |
| 3.4 | **Their own checklists:** inspection and test plans, hold and witness points, permit forms | Replacing our starting lists with Setjeka's | Provide |
| 3.5 | **Production domain and DNS access** | The live site and its HTTPS certificate (the server is ready; a temporary sslip.io address works) | Provide |
| 3.6 | **Email: an SMTP mailbox or sending service, and the sending domain's DNS records** | Built 7 Nov (§2.52, §5.4): the client is emailed when a stage move or the certificate of completion needs their signature, and the client and team when a project is completed or abandoned. **Until SMTP details are provided, these emails are only written to the server log.** In-app alerts and the floating sign-off reminder work today. Password reset and invitation links are also still only logged. | Provide |
| 3.7 | ~~**Server access.**~~ **Deployed 4 Nov:** the VPS (`173.212.202.149`) now runs the current platform, with the assistant and three test projects. It looks like a Contabo server, usually in Germany. Real client data should go on a South African server (decision 1.2), so is this VPS for testing only? | | Confirm |
| 3.8 | **Azure AD app details** (tenant, client ID and secret, SharePoint site and drive) | SharePoint sync. **Not connected.** Completed projects' documents, including the signed stage-gate and completion certificates (filed under "Sign-offs and certificates"), are kept in the platform's own folders and are visible there. Copying them to Setjeka's SharePoint needs this. | Provide |

## 4. Still to build (agreed, in order)

1. ~~Site manager's daily diary~~: built 4 Nov (§2.43).
2. ~~Look-ahead and progress~~: built 4 Nov (§2.44).
3. ~~Plant and equipment~~: built 4 Nov (§2.45). Lean: no hire costs or daily pre-use checklists yet. No hours-meter readings: plant is hired at a fixed fee (the user, 4 Nov).

These were built on the user's go-ahead; the scope is still to confirm (1.1).

**Raised but not chosen** (tell us if any become wanted): GIS / 3D site map, point clouds, temporary works, toolbox talks and inductions, earned value (CPI/SPI), near misses, a delay analysis on the programme, and separate disruption claims.

## 5. Known limits to be aware of

- **Retention and the final valuation are now locked to the completion certificates.** A QS can no longer release them by choice.
- **Completion certificates can't be withdrawn** once issued.
- **Granted extensions of time move the contract's completion date, not the programme's activities.**
- **The live map uses the free OpenStreetMap tile server,** which isn't allowed for heavy production use. A paid or self-hosted tile source is needed before full roll-out.
- **The model and drawing converter** (take-offs from Revit, IFC, DWG, DGN and PDF in Estimates) was missing from the server until 4 Nov; it is deployed now. It uses DataDrivenConstruction's free "Community" converters; **confirmed 4 Nov** that this tier covers Setjeka's use. The cost database has one region per country Setjeka works in: South Africa (rand) and Nigeria (naira).
- **Programme import** reads Microsoft Project XML. **Primavera P6 import isn't built.**
- **Setjeka can advance a stage without the client's signature (7 Nov).** It must give a reason; the client is still asked to sign, and the record shows both. Please confirm this flexibility is wanted for every stage.
- **The certificate of completion is sent only at Stage 6 (Close-out).** Completing a project without the client's signature is possible with a recorded reason.
- **An abandoned project is archived, not deleted:** its documents stay viewable, and it can't be edited. There is no "un-abandon" in the app.
- **The sample people's saved password no longer signs in** (on the server too, 7 Nov). Their accounts are active. Should we reset it, or has Setjeka changed it on purpose?
- **Outside site and HSE managers don't see Commercial (11 Nov).** Only Setjeka's staff, the QS and the client see budgets, variations, invoices and valuations. An outside firm's site or HSE manager is refused, even though the matrix lists their role with the Setjeka team. Please confirm (`permission-matrix.md` question 1).
- **A firm sees its own contract value, not the project's (14 Nov, the user's rule).** A contractor or consultant sees the value of their own contracts, appointments and orders on each project, and their overall total with Setjeka on the dashboard. They no longer see the project's value with the client or its contingency, and never another firm's contract. Proposed appointments and draft orders are listed as "not yet agreed" and left out of the totals. Please confirm that this is how Setjeka wants it.
- **What a contractor sees of the programme (14 Nov, the user's choice).** A contractor sees their own firm's activities, plus other firms' work linked to theirs (what they're waiting on, and what waits on them), with its dates and progress, but not other firms' notes or unrelated work. Please confirm.
- **Sign-in lockout (14 Nov, the user's rule).** Six wrong passwords in a row lock an account until an administrator unlocks it; resetting the password doesn't unlock it. Anyone who knows an address could lock that account on purpose, so Setjeka should keep two administrators. Please confirm.
- **Contingency follows the project's % (14 Nov).** Until Setjeka enters a contingency amount, the budget carries the project's contingency % (25% unless changed), and locking the budget fixes it. Forecasts in the cost report and the Portfolio now include it. Please confirm the 25% default.
- **Setjeka-only work (14 Nov, the user's rule).** Outside accounts, including the QS, contractors and outside site or HSE managers, can no longer raise RFQs, quotes, purchase orders or deliveries, change the project team or structure, or request stage moves. The QS still prepares a tender from their bill; Setjeka issues and awards it. Please confirm.
- **Dates (14 Nov, the user's rule).** DD/MM/YYYY everywhere by default; each person can choose another format under My settings.
- **Only Setjeka creates projects (11 Nov).** Outside parties are added to a project; they can't start one.
- **Notes are as private as their record (11 Nov).** A contractor sees notes only on their own firm's site records; consultants see no notes on commercial records; outside parties see notes only from projects they're on.
- **The QR check page is public.** Anyone with the signed document can open its record: the project name, who signed and when. It shows nothing else, and the reference can't be guessed.

## 6. Owed by us (the supplier)

| # | Deliverable | Status |
|---|---|---|
| 6.1 | Stage 0 workflow diagram (item 8.3) | Owed |
| 6.2 | The permission matrix (who can see and do what, by role) for Setjeka to review (item 8.5) | **Written 4 Nov:** `permission-matrix.md`, with six questions for Setjeka (section 4) |
| 6.3 | Document numbering proposal (item 8.8) | Owed, ties to 1.4 |
| 6.4 | Deploy the current platform to the live server | **Done 4 Nov** (`https://173.212.202.149`, self-signed certificate until a domain is set up, 3.5) |
| 6.6 | Deploy the 11 Nov fixes (notes privacy, project creation, Commercial access, Portfolio currencies) the 14 Nov firm contract values, and the 14 Nov critique fixes (programme privacy, lockout, dashboard, dates, Setjeka-only work) to the live server. **This deploy adds a database migration and an nginx change** | **Pushed to GitHub, not deployed yet:** waiting for the server password to be supplied again (it is never stored) |
| 6.5 | Deploy the 7 Nov changes (client sign-off, close-out, critique fixes) to the live server | **Done 7 Nov:** database backed up first (`/root/backups/setjeka-erp-db-20261107-1402.sql.gz`), then deployed and checked live: outside parties can't edit a project, Setjeka can't approve its own stage request, advancing needs a reason, and refusals are in plain words |
