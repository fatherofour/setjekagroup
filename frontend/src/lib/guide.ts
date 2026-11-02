// The in-app guide (27 Oct 2026): a welcome tour on first sign-in, a tip card
// the first time someone opens each screen, and a journey through the whole
// app for their role. Words here are what each person should DO on a screen,
// not a description of the software.

export type GuidePersona = 'setjeka' | 'architect' | 'engineer' | 'qs' | 'contractor' | 'client' | 'consultant' | 'vendor';

export const PERSONA_LABEL: Record<GuidePersona, string> = {
  setjeka: 'Setjeka team',
  architect: 'Architect',
  engineer: 'Engineer',
  qs: 'Quantity surveyor',
  contractor: 'Contractor',
  client: 'Client',
  consultant: 'Consultant',
  vendor: 'Supplier',
};

export interface GuideStep {
  title: string;
  body: string;
  /** A `data-guide` value to point at (welcome tour only). */
  target?: string;
}

export interface ScreenGuide {
  title: string;
  steps: GuideStep[];
}

type ByPersona<T> = Partial<Record<GuidePersona | 'all', T>>;

/** Which screen the person is on, as a guide key. */
export function screenKey(pathname: string, tab: string | null): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'projects' && parts[1] && parts[1] !== 'new') return parts[2] === 'schedule' ? 'project.schedule' : `project.${tab || 'overview'}`;
  if (parts[0] === 'portal') return parts[1] === 'projects' ? 'portal.project' : parts[1] ? `portal.${parts[1]}` : 'portal';
  if (parts[0] === 'administration') return `administration${tab ? `.${tab}` : ''}`;
  return parts[0] ?? null;
}

// ---------------------------------------------------------------------------
// Welcome tour: the first time someone signs in.
// ---------------------------------------------------------------------------

const MENU: Record<GuidePersona, string> = {
  setjeka: 'Opportunities, clients and every project live here. Project screens open for the project chosen at the top.',
  architect: 'Your work is under Design & site: drawings, models, the BIM hub, authorities, instructions, inspections and the punch list. Your PROCSA list is under Projects.',
  engineer: 'Your work is under Design & site: drawings, models, the BIM hub, authorities, instructions, inspections and the punch list. Your PROCSA list and the registers you keep are under Projects.',
  qs: "Your work is in each project's Commercial tab: bills and cost plans, variations, contracts, valuations and final accounts. Your PROCSA list is under Projects.",
  contractor: 'Instructions, inspections, RFIs and submittals, the punch list and site photos are your day to day.',
  client: 'Your projects, what is waiting for your approval, drawings, photos and your requests to Setjeka.',
  consultant: 'Everything for the projects you are on: meetings, documents, drawings, inspections and registers.',
  vendor: 'Requests for quotation sent to you, and the quotes you have sent back.',
};

export function welcomeTour(persona: GuidePersona, firstName: string): GuideStep[] {
  const who = persona === 'setjeka' ? 'on the Setjeka team' : `as the ${PERSONA_LABEL[persona].toLowerCase()}`;
  return [
    {
      title: `Welcome to Setjeka, ${firstName}`,
      body: `You're signed in ${who}. This one-minute tour shows you around. You can skip it and come back to it from the guide at any time.`,
    },
    { title: 'The menu', body: MENU[persona], target: 'sidebar|menu-button' },
    ...(persona === 'vendor'
      ? []
      : [
          {
            title: 'Choose the project',
            body: 'Pick the project you are working on here. Every project screen in the menu then opens for that project.',
            target: 'project',
          },
        ]),
    { title: 'Search', body: 'Find a project, a record, or words inside drawings and documents, including scanned ones. Ctrl+K opens it from anywhere.', target: 'search' },
    {
      title: 'Alerts',
      body:
        persona === 'client'
          ? 'Anything waiting for your approval, and replies from Setjeka, show here. Approvals are never muted.'
          : 'Things given to you, waiting for you, or due soon show here. You choose which kinds of alert you get on the Notifications page.',
      target: 'notifications',
    },
    {
      title: 'Your guide',
      body: 'The first time you open a screen, a tip card tells you what to do there. Open the guide here for your whole journey, from start to finish, in order.',
      target: 'guide',
    },
    { title: 'Your account', body: 'Save your signature here once, so approvals and reviews take a single click. Sign out from here too.', target: 'account' },
    { title: "You're set", body: START[persona].text },
  ];
}

/** Where each persona starts after the tour. */
export const START: Record<GuidePersona, { text: string; screen: string; tab?: string; href?: string }> = {
  setjeka: { text: 'Start with My Day: your actions and what is due. Then open a project.', screen: 'my-day', href: '/my-day' },
  architect: { text: 'Start with your PROCSA list on a project: it shows what is expected of you at each stage, and ticks itself as you work.', screen: 'project.procsa', tab: 'procsa' },
  engineer: { text: 'Start with your PROCSA list on a project: it shows what is expected of you at each stage, and ticks itself as you work.', screen: 'project.procsa', tab: 'procsa' },
  qs: { text: 'Start with your PROCSA list on a project: what is expected of you at each stage. It ticks itself as your bills, valuations and final accounts go in.', screen: 'project.procsa', tab: 'procsa' },
  contractor: { text: 'Start with the instructions issued to you, then inspections and the punch list.', screen: 'project.instructions', tab: 'instructions' },
  client: { text: 'Start with your project: anything waiting for your approval is at the top.', screen: 'portal', href: '/portal' },
  consultant: { text: 'Start with My Day, then open your project.', screen: 'my-day', href: '/my-day' },
  vendor: { text: 'Start with your requests for quotation.', screen: 'portal.rfqs', href: '/portal/rfqs' },
};

// ---------------------------------------------------------------------------
// Screen tips: the first time each screen is opened.
// ---------------------------------------------------------------------------

const s = (title: string, body: string): GuideStep => ({ title, body });

export const SCREENS: Record<string, ByPersona<ScreenGuide>> = {
  'my-day': {
    all: {
      title: 'My Day',
      steps: [
        s('Your actions', 'Notes addressed to you as actions, with their due dates. Tick one off when it is done, and whoever gave it to you is told.'),
        s('What is due', 'Milestones, deliverables and items due in the next few days, across every project you are on.'),
      ],
    },
  },
  notifications: {
    all: {
      title: 'Notifications',
      steps: [
        s('Everything that came to you', 'Open one to go straight to the record. Mark them read one at a time or all at once.'),
        s('Choose what you get', 'Mute any kind of alert you do not need. Approvals cannot be muted, so nothing waiting for your decision is missed.'),
      ],
    },
  },
  dashboard: {
    all: { title: 'Dashboard', steps: [s('Your projects at a glance', 'Stage, progress and what needs attention on each project you are on. Click a project to open it.')] },
  },
  approvals: {
    all: {
      title: 'Approvals',
      steps: [
        s('Waiting for you', 'Everything across your projects that needs your decision, oldest first.'),
        s('Decide', 'Approve, approve with comments, reject, or reject with comments. You sign each decision, and it is stamped on the document.'),
      ],
    },
    architect: {
      title: 'Approvals',
      steps: [
        s('Your reviews', 'Payment valuations, completion certificates and handover documents waiting for your signed review show here.'),
        s('Sign once', 'Pick a response, add comments, and sign. Your review is stamped on the certificate and the PM, DM and whoever added it are told.'),
      ],
    },
  },
  projects: {
    setjeka: { title: 'Projects', steps: [s('Every project', 'Open one to work on it, or start a new project. Converting an opportunity also creates its project.')] },
    all: { title: 'Projects', steps: [s('Your projects', 'These are the projects you have been added to. Open one to start work.')] },
  },
  search: {
    all: {
      title: 'Search inside documents',
      steps: [
        s('Words inside the files', 'Search finds words inside PDFs and drawings across your projects. Scanned sheets are read too, marked OCR.'),
        s('Open the match', 'Each result shows the page and the words around the match. Click to open the document.'),
      ],
    },
  },
  'rough-estimates': {
    setjeka: {
      title: 'Rough estimates',
      steps: [
        s('A first cost', 'Floor area x rate x provincial factor, plus escalation, contingency and VAT, split by element.'),
        s('Keep the rates current', 'The rate table below is a starting point. Have the QS check and update it before figures go to a client.'),
      ],
    },
  },
  'project.overview': {
    all: { title: 'Project overview', steps: [s('The project', 'Its stage, key dates and people. The tabs across the top are each part of the project; the guide shows them in the order you will use them.')] },
    client: { title: 'Your project', steps: [s('Where it is', 'The stage, the next milestones and what is waiting for you. Approvals come to you through Setjeka.')] },
  },
  'project.inception': {
    setjeka: {
      title: 'Inception (Stage 1)',
      steps: [
        s('Build the Stage 1 pack', 'Brief, site assessment, viability, procurement policy, consents, the professional team and the programme.'),
        s('Put each to the client', 'Send each document for the client to approve. The project can only move to Concept once all are approved.'),
      ],
    },
    all: { title: 'Inception (Stage 1)', steps: [s('Your appointment', 'Confirm your scope of services and responsibilities here when Setjeka asks you to, and sign your appointment.')] },
  },
  'project.procsa': {
    architect: {
      title: 'Your PROCSA list',
      steps: [
        s('What is expected of you', 'Every architect responsibility from Stage 1 to 6, by stage. Your current stage is open.'),
        s('It ticks itself', 'Each item ticks when your work shows it: drawings with the right purpose, a submission to the authority, an inspection done, a signed review. The note says what counts.'),
        s('Sign off by hand', 'If you did something outside the platform, sign the item off yourself with a note.'),
      ],
    },
    engineer: {
      title: 'Your PROCSA list',
      steps: [
        s('What is expected of you', 'Every responsibility of your discipline from Stage 1 to 6, by stage. Your current stage is open.'),
        s('It ticks itself', 'Each item ticks when your own work shows it: design criteria and investigations you recommend, drawings with the right purpose, a round with the authority, an inspection done, a valuation you reviewed. The note says what counts.'),
        s('Sign off by hand', 'If you did something outside the platform, sign the item off yourself with a note.'),
      ],
    },
    qs: {
      title: 'Your PROCSA list',
      steps: [
        s('What is expected of you', 'Every quantity surveyor responsibility from Stage 1 to 6, by stage. Your current stage is open.'),
        s('It ticks itself', 'Each item ticks when your work shows it: an estimate or bill issued, a variation assessed, a valuation submitted, a final account agreed. The note says what counts.'),
        s('Sign off by hand', 'If you did something outside the platform, sign the item off yourself with a note.'),
      ],
    },
    setjeka: {
      title: 'PROCSA tracker',
      steps: [
        s('Everyone, every stage', 'What each role owes at each stage, ticking itself from the records on the project.'),
        s('Sign off', 'Sign off any item with a note where the evidence lives outside the platform.'),
      ],
    },
    all: { title: 'Your responsibilities', steps: [s('By stage', 'What is expected of you at each stage. Items tick themselves as your work goes onto the platform.')] },
  },
  'project.meetings': {
    setjeka: {
      title: 'Meetings',
      steps: [
        s('Plan and record', 'Schedule the meeting with its type (design, consultants, site, client), record who was present, and issue the minutes.'),
        s('Actions carry on', 'Action items get an owner and a date. Open ones carry into the next meeting.'),
      ],
    },
    all: { title: 'Meetings', steps: [s('Your meetings', 'Agendas, minutes and the actions given to you. Being marked present counts towards your responsibilities.')] },
  },
  'project.actions': { all: { title: 'Actions', steps: [s('Every open action', 'Actions from notes and meetings on this project, with who has them and when they are due.')] } },
  'project.tasks': { all: { title: 'Tasks', steps: [s('Work to do', 'Add tasks, give them to someone and track them to done.')] } },
  'project.issues': {
    all: {
      title: 'Issues',
      steps: [
        s('Problems to resolve', 'Issues come from clashes, model comments, markup pins and failed inspection items, or are added here.'),
        s('Close the loop', 'Give each an owner and a due date, and close it when it is resolved.'),
      ],
    },
  },
  'project.risks': { all: { title: 'Risks', steps: [s('The risk register', 'Each risk with its likelihood, impact, owner and the plan to deal with it.')] } },
  'project.documents': {
    all: {
      title: 'Documents',
      steps: [
        s('Every file, every revision', 'Upload a new revision on top of the old one; the history stays. "Restore as current" brings an older revision back.'),
        s('Find things', 'Use tags and the filter, or Search inside to find words inside the files.'),
        s('Transmittals', 'Send documents to people or a distribution list. Each transmittal has a PDF slip.'),
      ],
    },
    architect: {
      title: 'Documents and transmittals',
      steps: [
        s('Specifications and reports', 'Your specification, reports and other documents go here. Drawings have their own register.'),
        s('Send with a transmittal', 'Choose the revisions and the people or a distribution list, then Issue. It goes out from you, and the slip is the record.'),
      ],
    },
    client: { title: 'Documents', steps: [s('Shared with you', 'Documents Setjeka has shared with you. Anything for your approval is in Approvals.')] },
  },
  'project.drawings': {
    architect: {
      title: 'Drawing register',
      steps: [
        s('Upload your sheets', 'Drop in your PDFs. The drawing number, revision and title are read from your title block. Check them and add to the register.'),
        s('Purpose of issue', 'Set why each revision is issued: comment, co-ordination, client approval, authority, construction. Your PROCSA items tick from this.'),
        s('Programme and index check', 'Plan your sheets on the documentation programme, and check your drawing index against the register with Index check.'),
        s('Mark up', 'Open any sheet to cloud, pin, stamp, set the scale and measure. A pin can become an issue.'),
      ],
    },
    contractor: {
      title: 'Drawings',
      steps: [s('Build from the right revision', 'Each drawing shows its current revision and purpose. Work only from drawings issued For construction.')],
    },
    all: {
      title: 'Drawing register',
      steps: [
        s('Current revisions', 'Every drawing with its revision, purpose of issue and transmittals.'),
        s('Mark up', 'Open a sheet to comment on it. Your markups are kept apart from the drawing.'),
      ],
    },
  },
  'project.models': {
    all: {
      title: 'Models',
      steps: [
        s('Upload IFC', 'Export from Revit, ArchiCAD or similar as IFC, and upload. A new upload can be the next revision of a model.'),
        s('In the viewer', 'Open models together, click an element for its properties, measure, raise an issue on an element, or link it to a drawing or RFI.'),
      ],
    },
    client: { title: 'Models', steps: [s('Shared models', 'Models Setjeka has shared with you, to look around in 3D.')] },
  },
  'project.bim': {
    all: {
      title: 'BIM hub',
      steps: [
        s('Coordination', 'Every model and its status, open clashes, model issues and requirement scores on one page.'),
        s('Clash detection', 'Pick two sets of elements and run. Each clash keeps its status between runs. Show opens it in 3D; raise an issue from it.'),
        s('Smart views and requirements', 'Colour or hide elements by rule, and check a model against your BIM requirements (IDS or a spreadsheet).'),
        s('BCF', 'Export model issues as BCF for Revit, ArchiCAD, Solibri or Navisworks, and import topics back.'),
      ],
    },
  },
  'project.authorities': {
    architect: {
      title: 'Authority approvals',
      steps: [
        s('Every submission', 'Add each approval you need: SDP, building plans, fire, heritage, statutory certificates.'),
        s('Record each round', 'Submitted, comments received, resubmitted, approved. Days with the authority and late decisions are shown.'),
      ],
    },
    all: { title: 'Authority approvals', steps: [s('Where each approval is', 'Each submission to the authority, its rounds and how long it has been with them.')] },
  },
  'project.instructions': {
    architect: {
      title: 'Instructions and letters',
      steps: [
        s('Contract instructions', 'Draft an instruction to the contractor here. Setjeka checks and issues it, then the contractor confirms receipt.'),
        s('From the client', "The client's requests reach you through Setjeka as a Setjeka instruction. Confirm receipt and reply on the record."),
        s('Letters', 'A letter from you goes to Setjeka.'),
      ],
    },
    contractor: {
      title: 'Instructions',
      steps: [
        s('Issued to you', 'Instructions issued to you by Setjeka. Confirm receipt so everyone knows you have it.'),
        s('Reply', 'Reply on the instruction itself, so the answer stays with it.'),
      ],
    },
    client: {
      title: 'Requests and letters',
      steps: [s('Ask Setjeka', 'Raise a request here. It goes to your Development and Project Managers, who take it to the architect or contractor.')],
    },
    setjeka: {
      title: 'Instructions and letters',
      steps: [
        s('Waiting for you', 'Contract instructions drafted by consultants wait here for you to issue.'),
        s('Pass client requests on', "Pass a client's request to the architect or contractor as a Setjeka instruction. The client sees that it was passed on, not what was said."),
      ],
    },
    all: { title: 'Instructions and letters', steps: [s('On the record', 'Instructions and letters to and from you, with receipts and replies.')] },
  },
  'project.ncrs': {
    contractor: {
      title: 'NCRs',
      steps: [
        s('Issued to you', 'Work or materials found not to conform. Give the root cause and how you will put it right, by the date asked.'),
        s('Put it right', 'Once your corrective action is agreed, fix it and mark it ready. The consultant verifies it on site and closes it.'),
      ],
    },
    all: {
      title: 'NCRs',
      steps: [
        s('Raise an NCR', 'When work or materials do not conform, raise an NCR to the contractor, or straight from a failed inspection.'),
        s('Agree the fix', "The contractor answers with the root cause and corrective action. Agree it, or send it back with your comments."),
        s('Verify and close', 'When the contractor says it is put right, check it on site and close it, or send it back.'),
      ],
    },
  },
  'project.inspections': {
    architect: {
      title: 'Inspections',
      steps: [
        s('Scheduled for you', 'When Setjeka schedules you, open the inspection on site, even on your phone.'),
        s('Work through the checklist', 'Pass, Fail or N/A for each item, with a note and photos. Complete it with the outcome.'),
        s('Failed items', 'Raise a failed item as an issue in one click.'),
      ],
    },
    contractor: {
      title: 'Inspections',
      steps: [s('Ask for an inspection', 'Request one before you cover up work, with what and where. Setjeka schedules the inspector and you are told the outcome.')],
    },
    setjeka: {
      title: 'Inspections',
      steps: [
        s('Schedule', 'Contractor requests arrive here. Choose the inspector and the date.'),
        s('Checklists', 'Keep the company checklists up to date. Changing one never alters an inspection already done.'),
      ],
    },
    all: { title: 'Inspections', steps: [s('Inspections', 'Inspections on this project, their checklists and outcomes.')] },
  },
  'project.punch': {
    architect: {
      title: 'Punch list',
      steps: [
        s('Pin it on the drawing', 'Place each item on the sheet where it is, and give it to the contractor with a date.'),
        s('Inspect and close', 'When the contractor says it is done, inspect it, then close it or send it back with a note.'),
      ],
    },
    contractor: {
      title: 'Punch list',
      steps: [s('Items given to you', 'Each item is pinned on the drawing. Fix it, add a photo, and mark it done, ready for inspection.')],
    },
    all: { title: 'Punch list', steps: [s('Snags on the drawings', 'Each item pinned where it is, who has it, and whether it has been inspected and closed.')] },
  },
  'project.photos': {
    all: { title: 'Site photos', steps: [s('Progress on site', 'Upload photos with a date and where they were taken. Link them to an inspection or punch item.')] },
    client: { title: 'Site photos', steps: [s('Progress', 'Photos Setjeka has shared with you, by date.')] },
  },
  'project.technical': {
    contractor: {
      title: 'RFIs and submittals',
      steps: [
        s('Ask a question', 'Raise an RFI to the architect or engineer, with the drawing it is about.'),
        s('Submit for review', 'Send shop drawings, samples and data sheets as submittals, and see each review.'),
      ],
    },
    architect: {
      title: 'RFIs and submittals',
      steps: [
        s('Answer RFIs', 'Questions given to you. Your answer is the official response on the record.'),
        s('Review submittals', 'Approve, approve with comments, or send back shop drawings and samples.'),
      ],
    },
    all: { title: 'RFIs and submittals', steps: [s('Questions and reviews', 'Requests for information and the submittals under review, with who has the ball.')] },
  },
  'project.procurement': {
    setjeka: {
      title: 'Procurement',
      steps: [s('RFQs to orders', 'Send requests for quotation, compare the quotes, award, and raise purchase orders. Keep at least the minimum number of quotes.')],
    },
    all: { title: 'Procurement', steps: [s('Tenders and orders', 'Requests for quotation and orders on this project.')] },
  },
  'project.commercial': {
    setjeka: {
      title: 'Commercial',
      steps: [
        s('Budget', 'Budget by cost code with contingency, or adopt a bill the QS issued. Lock it as the approved baseline.'),
        s('Variations', 'Raise a variation (or turn an instruction into one), let the QS assess it, and send it to the client. Only the client approves it.'),
        s("The QS's bills", 'Accept each bill or estimate the QS issues. Tender on the bill for tender, and set up the contract from the award.'),
        s('Certificates', "Valuations come from the QS. Once the architect has approved one, issue the payment certificate; the client approves payment, then you mark it paid."),
      ],
    },
    qs: {
      title: 'Commercial',
      steps: [
        s('Bills and cost plans', 'Your estimates and bills, stage by stage. Import from your own software as Excel or CSV, or work here. Issuing a revision sends it to Setjeka.'),
        s('Variations', "Price each variation with your assessed value and link it to its contract. Setjeka sends it to the client."),
        s('Contracts and valuations', 'Set up each contract from the awarded tender, value the work each month, and submit. The architect reviews it and Setjeka certifies it.'),
        s('Final account and cash flow', 'Keep the final account up as the works go, and spread each contract over its months for the cash flow.'),
      ],
    },
    client: {
      title: 'Commercial',
      steps: [
        s('Your budget', 'The budget, its contingency and variations. Variations wait for your approval in Approvals.'),
        s('Payment certificates', 'Setjeka issues each certificate after the QS and the architect. Only you approve payment.'),
      ],
    },
  },
  'project.registers': {
    architect: {
      title: 'Registers',
      steps: [
        s('Yours to keep', 'The finishes schedule, area schedule, handover documents and defects are kept by you.'),
        s('Yours to review', "Payment valuations and completion certificates wait for your signed review. Setjeka can't sign it for you."),
      ],
    },
    engineer: {
      title: 'Registers',
      steps: [
        s('Yours to review', 'Valuations on contracts that name you as the reviewing consultant, completion certificates and O&M documents wait for your signed review. Setjeka cannot sign it for you.'),
        s('Yours to keep', 'Defects, handover documents and the service connections your design needs. The civil engineer also keeps the final accounts of civil works.'),
      ],
    },
    qs: {
      title: 'Registers',
      steps: [
        s('Yours to keep', 'The area schedule, cash flow, contractual claims and final accounts. An agreed claim goes into that contractor\'s final account.'),
        s('Kept for you', 'Payment certificates fill in as your valuations go through; you do not enter them here.'),
      ],
    },
    all: { title: 'Registers', steps: [s('Project registers', 'Insurances, certificates, defects, handover documents and more. Each says who keeps it.')] },
  },
  'project.reports': {
    setjeka: { title: 'Reports', steps: [s('Report to the client', 'Produce the branded PowerPoint or PDF progress report, the Excel export and the close-out report.')] },
    all: { title: 'Reports', steps: [s('Reports', 'Reports produced for this project.')] },
  },
  'project.team': {
    setjeka: {
      title: 'Team',
      steps: [
        s('Add people', 'Add each consultant, contractor and the client with their role. Their role decides what they see.'),
        s('Give them a login', 'Tick "Invite as user" and share the set-password link with them.'),
      ],
    },
    all: { title: 'Team', steps: [s('Who is on the project', 'Everyone on this project and their role.')] },
  },
  'project.structure': { all: { title: 'Structure', steps: [s('How the project is broken down', 'Phases, blocks and work packages that records can be filed under.')] } },
  'project.schedule': {
    all: {
      title: 'Programme',
      steps: [
        s('The programme', 'Activities, dates and links as a Gantt chart.'),
        s('Progress', 'Update percentage complete on your activities so the programme stays true.'),
      ],
    },
  },
  portal: {
    client: {
      title: 'Your projects',
      steps: [
        s('Waiting for you', 'Documents, variations and stage changes waiting for your approval are at the top. You sign each decision.'),
        s('Ask Setjeka', 'Raise a request, and Setjeka takes it to the architect or contractor for you.'),
      ],
    },
  },
  'portal.project': {
    client: {
      title: 'Your project',
      steps: [
        s('Approve', 'Approve, approve with comments, or reject with comments. Your decision is signed and stamped onto the document.'),
        s('See progress', 'Drawings, models and site photos shared with you.'),
      ],
    },
  },
  'portal.opportunities': { client: { title: 'Your developments', steps: [s('Before the project', 'Developments being prepared for you, and the team proposed for them.')] } },
  'portal.rfqs': {
    vendor: {
      title: 'Requests for quotation',
      steps: [
        s('Quote', 'Open a request, price each item, attach your documents and submit before the closing date.'),
        s('Hear back', 'You are told when the request is awarded.'),
      ],
    },
  },
  opportunities: {
    setjeka: {
      title: 'Opportunities',
      steps: [
        s('Before there is a project', 'Each prospective development, its stage, authority approvals and business case.'),
        s('Convert', 'Once approved, convert it into a project. The client and site carry across.'),
      ],
    },
  },
  clients: { setjeka: { title: 'Clients', steps: [s('Your clients', 'Each client organisation, its contacts and portal logins.')] } },
  contractors: {
    setjeka: { title: 'Contractors and consultants', steps: [s('The company directory', 'Every vendor and consultant, with compliance documents, appointments, ratings and scorecards.')] },
  },
  'cost-database': { setjeka: { title: 'Cost database', steps: [s('Regional rates', 'Rates are updated from awarded RFQs, not typed in by hand.')] } },
  estimates: { setjeka: { title: 'Estimates', steps: [s('Estimates', 'Build an estimate from the cost database or from a model take-off, then finalise it.')] } },
  administration: {
    setjeka: {
      title: 'Administration',
      steps: [
        s('Users and permissions', 'Invite people, suspend accounts, and set what each role can do.'),
        s('Recycle bin', 'Deleted documents wait here. Restore them, or delete them for good.'),
      ],
    },
  },
  account: { all: { title: 'Your signature', steps: [s('Save it once', 'Draw, type or upload your signature. It is used whenever you approve or review.')] } },
};

export function screenGuide(key: string | null, persona: GuidePersona): ScreenGuide | null {
  if (!key) return null;
  const g = SCREENS[key] ?? SCREENS[key.split('.')[0]];
  return g?.[persona] ?? g?.all ?? null;
}

// ---------------------------------------------------------------------------
// The journey: the whole app in the order this person will use it.
// ---------------------------------------------------------------------------

export interface JourneyItem {
  /** Screen key, so a visited screen shows as done. */
  screen: string;
  label: string;
  what: string;
  /** A project tab, or a page. */
  tab?: string;
  path?: string;
  href?: string;
}
export interface JourneySection {
  title: string;
  items: JourneyItem[];
}

const tab = (t: string, label: string, what: string): JourneyItem => ({ screen: t === 'schedule' ? 'project.schedule' : `project.${t}`, label, what, ...(t === 'schedule' ? { path: '/schedule' } : { tab: t }) });
const page = (href: string, screen: string, label: string, what: string): JourneyItem => ({ screen, label, what, href });

const GETTING_STARTED = (extra: JourneyItem[] = []): JourneySection => ({
  title: 'Getting started',
  items: [page('/account/signature', 'account', 'Save your signature', 'Once, so every approval takes one click.'), page('/notifications', 'notifications', 'Choose your alerts', 'Mute what you do not need.'), ...extra],
});

export const JOURNEY: Record<GuidePersona, JourneySection[]> = {
  architect: [
    GETTING_STARTED([tab('procsa', 'Your PROCSA list', 'What is expected of you, by stage.')]),
    {
      title: 'Stage 2 - Concept',
      items: [
        tab('drawings', 'Plan and upload drawings', 'Documentation programme, then concept drawings for client approval.'),
        tab('registers', 'Area and finishes schedules', 'Space norms and intended finishes.'),
        tab('authorities', 'Site development plan', 'Record the SDP submission and each round.'),
        tab('documents', 'Send to the QS', 'Issue information on a transmittal.'),
        tab('meetings', 'Design meetings', 'Attend and pick up your actions.'),
      ],
    },
    {
      title: 'Stage 3 - Design development',
      items: [
        tab('models', 'Upload your model', 'IFC from Revit or ArchiCAD.'),
        tab('bim', 'Coordinate in the BIM hub', 'Clashes, smart views, requirements, BCF.'),
        tab('drawings', 'Co-ordination drawings', 'Issue for co-ordination and comment.'),
        tab('authorities', 'Building plans', 'Submit to the authority and track it.'),
      ],
    },
    {
      title: 'Stage 4 - Documentation',
      items: [
        tab('documents', 'Specification', 'Your specification and preambles.'),
        tab('drawings', 'Tender drawings and index check', 'Issue for procurement; check your index.'),
        tab('registers', 'Samples', 'Decide samples on the finishes schedule.'),
      ],
    },
    {
      title: 'Stage 5 - Construction',
      items: [
        tab('instructions', 'Contract instructions', 'Draft; Setjeka issues.'),
        tab('inspections', 'Site inspections', 'Checklists on your phone.'),
        tab('technical', 'RFIs and submittals', 'Answer and review.'),
        tab('registers', 'Payment valuations', 'Your signed review.'),
        tab('punch', 'Punch list', 'Pin, inspect, close.'),
      ],
    },
    {
      title: 'Stage 6 - Close-out',
      items: [
        tab('registers', 'Completion and handover', 'Review certificates, O&M manuals and warranties.'),
        tab('drawings', 'As-built drawings', 'Issue the as-built set.'),
      ],
    },
  ],
  engineer: [
    GETTING_STARTED([tab('procsa', 'Your PROCSA list', 'What is expected of you, by stage.')]),
    {
      title: 'Stage 2 - Concept',
      items: [
        tab('inception', 'Design criteria and investigations', 'Set your criteria; recommend surveys and tests.'),
        tab('drawings', 'Concept drawings', 'Plan them on the programme, then upload with a purpose.'),
        tab('authorities', 'Authority requirements', "Record each authority's requirements and your submissions."),
        tab('registers', 'Service connections', 'Access, utilities and connections your design needs.'),
        tab('meetings', 'Design meetings', 'Attend and pick up your actions.'),
      ],
    },
    {
      title: 'Stage 3 - Design development',
      items: [tab('models', 'Your model', 'Upload your IFC.'), tab('bim', 'Coordination', 'Clashes against the architecture.'), tab('drawings', 'Co-ordination drawings', 'Issue for co-ordination and comment.')],
    },
    {
      title: 'Stage 4 - Documentation',
      items: [tab('documents', 'Specification', 'Your specification and preambles.'), tab('drawings', 'Tender drawings', 'Issue for procurement to the QS.')],
    },
    {
      title: 'Stage 5 - Construction',
      items: [
        tab('instructions', 'Contract instructions', 'Draft; Setjeka issues.'),
        tab('inspections', 'Inspections and tests', 'Inspect the works; witness the tests.'),
        tab('technical', 'RFIs and submittals', 'Answer and review shop drawings.'),
        tab('registers', 'Valuations to review', 'For contracts that name you.'),
      ],
    },
    {
      title: 'Stage 6 - Close-out',
      items: [tab('punch', 'Defects', 'Issue the lists; verify each fix.'), tab('registers', 'Handover and final accounts', 'O&M manuals, as-builts, final accounts (civil).')],
    },
  ],
  qs: [
    GETTING_STARTED([tab('procsa', 'Your PROCSA list', 'What is expected of you, by stage.')]),
    {
      title: 'Stage 2 - Concept',
      items: [
        tab('documents', 'Information from the team', 'Drawings and data sent to you on transmittals.'),
        tab('commercial', 'Preliminary and elemental estimates', 'Under Bills & cost plans; issue them to Setjeka.'),
        tab('registers', 'Area schedule', 'Audit the space against the brief.'),
        tab('meetings', 'Design meetings', 'Attend and pick up your actions.'),
      ],
    },
    {
      title: 'Stage 3 - Design development',
      items: [tab('commercial', 'Detailed estimate', 'Re-issue the cost plan as the design develops.'), tab('drawings', 'Design drawings', 'Check them against the budget.')],
    },
    {
      title: 'Stage 4 - Documentation',
      items: [
        tab('commercial', 'Bill of quantities for tender', 'Pre-tender estimate, then the bill; go to tender on it.'),
        tab('procurement', 'Tenders', 'Prices come in against your bill; compare them under Bills & cost plans.'),
        tab('commercial', 'Contracts', 'Set up the contract from the awarded tender.'),
      ],
    },
    {
      title: 'Stage 5 - Construction',
      items: [
        tab('commercial', 'Valuations', 'Value the work each month and submit.'),
        tab('commercial', 'Variations', 'Assess each one before the client decides.'),
        tab('technical', 'RFIs with a cost', 'You are told when an RFI carries a cost.'),
        tab('registers', 'Cash flow and claims', 'Forecast the cash flow; assess claims.'),
      ],
    },
    {
      title: 'Stage 6 - Close-out',
      items: [tab('commercial', 'Final valuation', 'Release the retention.'), tab('commercial', 'Final account', 'Submit it; Setjeka records it agreed.')],
    },
  ],
  contractor: [
    GETTING_STARTED(),
    {
      title: 'On site',
      items: [
        tab('drawings', 'Construction drawings', 'Build from revisions issued for construction.'),
        tab('instructions', 'Instructions', 'Confirm receipt and reply.'),
        tab('inspections', 'Ask for inspections', 'Before you cover up work.'),
        tab('technical', 'RFIs and submittals', 'Ask questions; submit shop drawings.'),
        tab('photos', 'Site photos', 'Progress photos.'),
        tab('schedule', 'Programme', 'Update your progress.'),
      ],
    },
    { title: 'Handover', items: [tab('punch', 'Punch list', 'Fix and mark ready.'), tab('registers', 'Defects and handover documents', 'What is still owed.')] },
  ],
  client: [
    GETTING_STARTED(),
    {
      title: 'Your project',
      items: [
        page('/portal', 'portal', 'Your projects', 'What is waiting for you.'),
        page('/approvals', 'approvals', 'Approvals', 'Documents, variations and stages to decide.'),
        tab('instructions', 'Requests to Setjeka', 'Ask for a change or raise a concern.'),
        tab('drawings', 'Drawings', 'See the design.'),
        tab('photos', 'Site photos', 'Progress on site.'),
        tab('commercial', 'Budget and variations', 'Where the money is.'),
      ],
    },
  ],
  consultant: [
    GETTING_STARTED(),
    {
      title: 'Your work',
      items: [
        tab('procsa', 'Your responsibilities', 'What is expected of you.'),
        tab('meetings', 'Meetings', 'Attend and pick up actions.'),
        tab('documents', 'Documents', 'Files and transmittals.'),
        tab('inspections', 'Inspections', 'Quality and safety checks.'),
        tab('registers', 'Registers', 'The registers you keep.'),
      ],
    },
  ],
  vendor: [GETTING_STARTED(), { title: 'Quoting', items: [page('/portal/rfqs', 'portal.rfqs', 'Requests for quotation', 'Price and submit.')] }],
  setjeka: [
    GETTING_STARTED([page('/my-day', 'my-day', 'My Day', 'Your actions and what is due.')]),
    {
      title: 'Before the project',
      items: [
        page('/opportunities', 'opportunities', 'Opportunities', 'Prospective developments, then convert.'),
        page('/clients', 'clients', 'Clients', 'Client organisations and portal logins.'),
        page('/rough-estimates', 'rough-estimates', 'Rough estimate', 'A first cost.'),
      ],
    },
    {
      title: 'Stage 1 - Inception',
      items: [tab('team', 'Build the team', 'Add people and give them logins.'), tab('inception', 'The Stage 1 pack', 'Put each document to the client.'), tab('procsa', 'PROCSA tracker', 'Everyone, every stage.')],
    },
    {
      title: 'Design stages',
      items: [
        tab('meetings', 'Meetings', 'Design and consultants meetings.'),
        tab('drawings', 'Drawings', 'The architect’s register.'),
        tab('bim', 'BIM hub', 'Coordination and clashes.'),
        tab('authorities', 'Authorities', 'Approvals and their rounds.'),
        tab('commercial', 'Budget', 'Lock the approved budget.'),
        tab('procurement', 'Procurement', 'RFQs and orders.'),
      ],
    },
    {
      title: 'Construction',
      items: [
        tab('instructions', 'Issue instructions', 'Consultants draft, you issue.'),
        tab('inspections', 'Schedule inspections', 'Contractor requests.'),
        tab('registers', 'Valuations and certificates', 'Add them for the architect’s review.'),
        tab('schedule', 'Programme', 'Baseline and progress.'),
        tab('reports', 'Report to the client', 'PowerPoint, PDF and Excel.'),
      ],
    },
    { title: 'Close-out', items: [tab('punch', 'Punch list', 'Snags to closed.'), tab('reports', 'Close-out report', 'The final record.')] },
  ],
};
