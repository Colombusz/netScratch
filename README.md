# netScratch

A browser-based network planning workspace with IPv4 calculations, subnet planning, physical and logical topology, VLANs, inventory, notes, browser saving, JSON project files, print/PDF reports, and project issues. All six implementation phases are included. Optional Supabase accounts add private cloud project copies. Local work needs no account, backend, API key, or environment file.

## Run

Use Node.js 22.12+ (Node 24 is used for development).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. To build and preview the production app:

```sh
npm run build
npm run preview
```

## Test

```sh
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

Vitest covers networking math, VLSM allocation, project transactions, undo/redo, graph derivation, schemas, issue rules, JSON validation, and persistence/recovery. Database tests execute the SQL migration in PGlite (Postgres), testing two-user isolation, anonymous denial, ownership and revision protection, and stale updates/deletes. Playwright checks every workspace, reload restoration, files, conflicts, real PDFs, and the real Supabase SDK against controlled HTTP responses. Live email delivery and hosted Supabase configuration are separate deployment checks. Browser tests also check keyboard navigation, responsive layouts, both themes, and axe accessibility. Their Vite server runs on port 4173; artifacts are written to `test-results/`.

## Included

- IPv4 calculator: prefix or contiguous dotted-decimal mask, network, broadcast, usable endpoints and capacity.
- VLSM allocation: largest-first ordering, lowest aligned free block, reserved ranges, partial allocation with explicit insufficient-space errors.
- Planner: editable parent and routing scope, requirement rows, generated subnet table, fixed manual edits, optional gateways, reservations, deletion, and a CIDR list of unused space.
- Versioned Zod document with stable IDs, all planned entity types, independent physical/logical positions, `createEmptyProject()`, and `migrateProject()`.
- A Zustand store holding the project document. Pure core functions validate changes before committing them.
- Physical topology: device palette, named ports, bulk port creation, cables, site grouping, saved positions, and an inspector.
- Logical topology: VLANs, subnet assignments, physical/subinterface/SVI/loopback interfaces, and a derived graph.
- Hardware inventory: editable models, categories, stock quantities, unit costs, port capacity, capabilities, and allocations to devices or sites.
- Inventory checks: stock shortages, allocated costs, and port demand versus the sum of each device's allocated hardware capacity. Referenced hardware cannot be deleted until its allocations are removed.
- Notes and implementation checklist: plain text, attachments to project entities, search and attachment/status filters, inline status changes, editing, and deletion.
- Interface editing in the physical device inspector: physical, subinterface, SVI, and loopback records, with optional IPv4 host addresses and VLAN assignments.
- Logical integration: single/range VLAN creation, unassigned subnet/interface visibility, matching membership handles, node inspection, and saved mouse/keyboard positions independent of Physical.
- Project files: committed changes saved in this browser, previous-save backup and unreadable-save recovery, validated JSON import/export, and explicit conflict resolution when another tab changes the save.
- Print report: seven ordered sections, selectable SVG diagrams from project data and positions, repeated table headings, and optional diagrams enlarged across four pages each.
- Issues: live severity/category/search filters, stable findings and affected-item links, with the same checks in the print report.
- Address spaces: create, rename, switch, and delete routing scopes in Planner; attached writing survives deletion.
- Port configuration: access, trunk, routed, and unused modes with access/trunk VLAN selection.
- Undo/redo: up to 50 committed document transactions, including cascading deletions, in the current session.
- Optional cloud: Supabase email accounts and password recovery; private project list, explicit save, open, independent copy, deletion, and revision conflicts.

## Issues and repair

Open **08 Issues** to review errors and warnings. Search by message, rule code, or entity name; filter severity or category. Each affected-item button opens its editor. Findings update when changes are applied and the print report uses the same `collectIssues()` function.

Checks cover subnet invariants and overlaps, duplicate interface IPv4 addresses within a routing scope, host addresses/prefixes, reserved ranges, VLAN numbers and assignments, port modes, interface/port consistency, cable occupancy/media/speeds/VLANs, stock, port capacity, and explicit hardware compatibility declarations. A subnet gateway may be assigned to its router interface without being treated as a duplicate reservation. Device scope matches address-space scope exactly and is the routing domain for IP uniqueness. Separate scopes can reuse addresses.

Hardware capability tags such as `role:switch`, `media:copper`, `mode:trunk`, and `speed:1gbps` declare supported values. Values within a tag group are alternatives; device allocations and an assigned model contribute their declarations. Free text remains descriptive. Missing groups mean unknown support. Recognized speed differences are warnings because negotiation depends on actual equipment. Checks do not simulate routing or guarantee deployment correctness.

## Undo and redo

Use the sidebar **Undo** and **Redo** buttons, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y. Text inputs retain their browser-native undo behavior. History covers committed document actions, including plan generation, layout moves, and cascaded deletion. A new edit clears redo. Opening/importing/recovering a different document resets history; reloading also starts a new session. History is not included in exported JSON or cloud documents. Undo/redo commits save through the usual browser-saving path and reset unapplied form drafts.

## Optional cloud accounts and projects

Open **09 Cloud** and configure your Supabase project URL and public publishable/legacy anon key. Public connection details and SDK authentication sessions are stored in this browser. Secret/service-role keys are rejected. No env-file edits are needed. Apply [the database migration and setup instructions](supabase/README.md) to your own Supabase project first; this repository does not provision or deploy an external service.

Create an email account, confirm it if your provider requires confirmation, and sign in. Password reset links return to this app using PKCE. Cloud projects belong to the authenticated user and are protected by database row-level security. List operations fetch metadata; opening validates the full document before replacing the browser project, with confirmation.

**Save project to cloud** creates a record or conditionally updates the revision opened/saved during this session. A changed or removed remote revision causes a conflict and preserves local work. Refresh the list and open the current cloud version, or **Save as new cloud copy** to preserve an independent version. Unknown existing IDs are never silently upserted. Reopening the app keeps your SDK session but requires opening an existing cloud document before updating it. Deletion also checks the listed revision and keeps the open browser project.

Cloud saving is explicit; local committed changes continue to autosave in the browser. There is no background synchronization or collaboration merge. Service failures leave local edits and JSON export available. Signing out/disconnecting keeps the open document and browser backups; clear local site data on a shared device when finished. Cloud documents are limited to 20 MiB and project names to 1,000 characters. Database tests use Postgres with an emulated Supabase auth schema; browser tests use controlled service responses. Production email, redirect allowlists, and a hosted migration require the actual Supabase project.

## Browser saving and project files

Applied changes save automatically to local storage for the current browser profile and site address. Form drafts remain temporary. Reload restores the full project and the planner opens the saved address space; imported projects with multiple address spaces can choose which space to edit.

Open **07 Files** to download the current project as JSON, edit project JSON, or open a `.json` file up to 20 MiB. Opening a file only fills the editor. Validate it, review the preview, and confirm **Import project** to replace the current plan. Validation checks schema/version, unique IDs, references, circular attachments, and address-plan invariants. Planned hardware shortages remain valid. Invalid imports leave the current plan intact. Starting a new empty project also requires confirmation.

One previous committed save is retained as a backup. **Review previous save** opens that backup in the JSON editor so it can be reviewed before import. If the primary save is unreadable, a valid backup opens with autosave paused. Download the unreadable copy, then explicitly keep the open project and resume saving; an additional recovery copy is retained without replacing the valid backup. A corrupt backup or unsupported schema is reported instead of silently discarded.

Storage may be unavailable or full. In that case the app keeps the project open, reports that changes are only in memory, and offers JSON download and saving retry. Another tab changing or clearing the browser save pauses automatic writes in this tab; choose whether to load the saved project or keep the open project. Detection uses browser storage events and a check before writing, rather than a cross-tab transaction lock.

Browser saving is local and is not a portable backup. Clearing site data removes saved copies, and using a different site address, port, browser, or profile uses different storage. Download JSON for a durable copy outside that browser profile.

## Print and PDF report

In **07 Files**, review the report preview and choose **Print / save PDF**. Use the browser print dialog's Save as PDF destination. The report has these sections in order:

1. Overview, assumptions, and unresolved checks.
2. Physical topology and device inventory.
3. Logical topology.
4. Addressing and VLAN plan.
5. Hardware and allocations.
6. Port, interface, and cable schedules.
7. Notes and implementation checklist.

Diagrams are SVG with selectable text, using saved positions or the existing default layout. Full labels and details appear in the tables. A large plan can enable **Enlarge diagrams across four pages each** for a two-by-two tile layout per diagram. The report uses a light paper surface in either app theme. Printed tables repeat their headings and long writing wraps across pages. The unresolved list uses the same errors and warnings as Issues.

## Notes and checklist behavior

Open **06 Notes** to record network decisions or create tasks. Attach either to the whole project, a subnet, a device, or any other existing project entity. The task states are To do, Doing, and Done. Search matches content and attachment labels; the status filter applies only to tasks. The completed count always describes all project tasks.

An active attachment filter becomes the default target for a new entry. Editing an entry preserves its ID. Unattached entries appear with project content. Deleting an attachment target, including a subnet removed by plan generation, preserves related notes/tasks and clears the attachment. Circular links between notes and tasks are rejected. Notes are plain text, with line breaks preserved; HTML is displayed as text.

## Interfaces and logical topology

Select a device in **03 Physical**, then use **Add interface**. A physical interface requires a named port on that device, and a port can have only one physical interface. Changing to a virtual kind clears the physical-port assignment. IP addresses use host CIDR notation, such as `192.168.10.1/24`, and may be left blank.

Create VLANs or VLAN ranges in **04 Logical**, then assign subnets through its inspector or interfaces through either inspector. Every subnet and interface appears even without a VLAN or assigned subnet. Membership lines connect existing VLAN/subnet/interface nodes; an interface names its device. Drag headers or focus a node and use arrow keys to save logical positions. This view describes planned relationships and does not simulate routing.

## Inventory behavior

Open **05 Inventory**, add a model, then allocate units to a device or site. Device choices come from the Physical workspace. Site allocations reserve stock but do not contribute to an individual device's port capacity.

Allocations may exceed available stock so a plan can include purchases. The balance and hardware issues identify the missing quantity. Allocated cost includes these planned units. All costs use the entered prices in one user-chosen currency; the project does not store or convert currencies.

Port demand counts a device's named physical ports. Supply sums `quantity × ports per unit` for all allocations to that device. Devices without allocations are marked unassigned. The Inventory table compares counts; Issues also checks declared media, speed, role, and mode compatibility.

Edits preserve entity IDs. Deleting a device also removes its device allocations; site allocations remain. Hardware and allocations share the same in-memory project as the planner and topology views.

## Planning assumptions and limits

- The planner initializes from the first saved address space and can create, rename, select, and delete other spaces. Subnet overlap checks apply across address spaces sharing a routing scope.
- One usable address selects /32, two select /31, and larger requests select the smallest block after excluding network and broadcast addresses. Requirements include the gateway. /31 is intended for point-to-point links.
- The calculator accepts a host address and normalizes the network. Planner inputs must already be aligned; invalid input produces the correct network suggestion.
- The initial Staff/Admin/Guests requirements are the example from the build brief. They are editable drafts until Generate subnets is pressed.
- Generate subnets replaces automatic allocations using the current requirement rows. Reserved and manually edited blocks remain fixed. A manual edit keeps the entity's ID and locks its requirement row. Delete that subnet and add a requirement to allocate it automatically again.
- If only part of a request fits, successful allocations are applied and each failure is shown. Invalid input and invalid manual or parent edits leave the applied document unchanged.
- Free space counts raw addresses. Its usable capacity depends on the eventual subdivision.
- Project names commit on Enter or blur. Network proposals commit through their explicit Apply or Generate action.
- Applied project changes persist in browser storage when writes succeed. Unapplied form drafts remain temporary. The current save status and recovery controls identify when saving is paused or unavailable.
- Schema version 1 is the first released format. The migration entry point validates and clones version 1, rejects missing/invalid versions, and rejects newer versions with an update message. There is no invented legacy format to migrate yet; add sequential migrations when version 2 is introduced.
- Schemas validate document shape. Planning transactions reject invalid address allocations. Broader issues remain visible and repairable without blocking incomplete plans or planned purchases.

## Structure

```text
src/
  core/
    cidr.ts                  IPv4 parsing, masks, capacities, ranges
    vlsm.ts                  Allocation and free-space calculation
    schema.ts                Zod schemas, inferred types, empty project
    migrations.ts            Version-aware document validation
    document.ts              JSON round-tripping, references, and import errors
    issues.ts                Shared structured network findings and entity targets
    report.ts                Report issue formatting and assumptions
    planning.ts              Atomic subnet edits and generation
    topology.ts              Device, port, and cable transactions
    logical.ts               VLAN and interface transactions
    hardware.ts              Inventory, allocations, costs, and shortages
    notes.ts                 Notes, checklist, attachment validation and cleanup
    *.test.ts                Core regression and invariant tests
  state/projectStore.ts      Project document and editing actions
  state/persistenceStore.ts  Browser save status and startup subscription
  storage/                   Local save, backup/recovery, and downloads
  cloud/                     Optional Supabase client, project repository, SQL tests
  features/
    calculator/Calculator.tsx
    planner/Planner.tsx
    planner/SubnetEditor.tsx
    topology/                Physical and logical canvases and inspectors
    inventory/               Hardware, allocations, and capacity checks
    notes/                   Notes, implementation checklist, and filters
    files/                   Project JSON, print report, and SVG diagrams
    issues/                  Search/filter findings and open affected editors
    cloud/                   Account, password recovery, and cloud project controls
  App.tsx                    Workspace shell and navigation
  main.tsx
  styles.css                 Tailwind and shared UI rules
tests/                       Workspace, file/recovery, and print acceptance tests
supabase/                    Database migration and deployment instructions
vite.config.ts
playwright.config.ts
```

`src/core` imports only Zod and other core modules. It never imports React, Zustand, storage, or cloud code. All IPv4 operations use exact arithmetic within JavaScript's safe integer range, avoiding signed 32-bit bitwise conversions. Free space is represented as aligned CIDR blocks; allocation never enumerates individual IP addresses.

`src/storage` handles local browser storage. Optional Supabase code is loaded in a separate cloud chunk. Cloud code never enters the pure networking core. The SQL migration uses per-owner policies, restricted column grants, an owner/date index, and server-maintained revisions.

## Dependency references

Installed the current stable npm releases and recorded their exact resolution in `package-lock.json`. Setup was checked against [Vite's React template](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-react/vite.config.js), [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite), [Zod's schema API](https://zod.dev/api), [Vitest configuration](https://vitest.dev/config/), and [Playwright configuration](https://playwright.dev/docs/test-configuration).

Inventory forms use controlled inputs and entity keys following [React's state-reset guidance](https://react.dev/learn/preserving-and-resetting-state). Allocation schemas share their device-or-site rule through [Zod's safeExtend](https://zod.dev/api#safeextend).

Logical canvas repairs follow the [React Flow custom-node types](https://reactflow.dev/api-reference/types/node-props), [handle identifiers](https://reactflow.dev/learn/customization/handles), and [node-change API](https://reactflow.dev/api-reference/types/node-change). Node dimensions and handles remain view data; the document stores only positions.

Cloud implementation follows [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and the installed SDK's conditional-update API. Migration tests use [PGlite's Postgres API](https://pglite.dev/docs/api).

## Manual acceptance checks

- Calculate `192.168.10.0/25`: network `.0`, broadcast `.127`, first host `.1`, last host `.126`, 126 usable addresses.
- Generate the default office example: Staff `.0/25`, Admin `.128/26`, Guests `.192/27`, and `.224/27` free.
- Change requirements to 100, 100, 50: two /25 blocks fit and the third segment gets an insufficient-space message.
- Reserve a /27 before generating; confirm allocations skip it and free space changes.
- Attempt an overlapping CIDR, gateway at network/broadcast, or too-small parent; confirm the previous plan remains intact.
- Edit a subnet, generate again, and confirm the manual block stays fixed.
- Switch calculator/planner and light/dark themes, navigate with Tab and Enter, and inspect the layout at 320px and enlarged text.
- For real mobile devices, focus the last inspector input and confirm it remains scrollable above the on-screen keyboard.

### PDF manual checks

Chromium PDF generation, selectable-text extraction, section order, small/large plans, tiled diagrams, and print-width checks are exercised during Phase 4 verification. Remaining manual checks include:

- Confirm all seven report sections exist in the specified order, including assumptions and unresolved issues.
- Confirm text is selectable and SVG diagrams derive from document data and saved positions.
- Print both a small office and a large topology; check page fitting and optional enlarged/tiled diagrams.
- Use long, unbroken notes and several pages of port/interface rows; check wrapping, repeated table headers, and no clipped rows.
- Check subnet/VLAN, hardware/allocation, cable, and IP details against the editable document.
- Save a PDF in Chromium and Firefox and inspect page breaks, margins, and diagram labels at normal print size.
