# netScratch

A browser-based network planning workspace with IPv4 calculations, subnet planning, physical and logical topology, VLANs, inventory, notes, browser saving, JSON project files, and print/PDF reports. Phase 4 is implemented. No account, backend, API key, or environment file is needed.

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

Vitest covers networking math, VLSM allocation, project transactions, graph derivation, schemas, JSON validation, migration, and persistence/recovery behavior. Playwright checks the complete workspaces plus reload restoration, downloads, file imports, corrupt-save recovery, failed storage, two-tab conflicts, and real PDF output. It also checks keyboard navigation, responsive layouts, both themes, and axe accessibility. Browser tests start and stop their own Vite server on port 4173. Screenshots, JSON downloads, and report PDFs are written to `test-results/`.

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

Diagrams are SVG with selectable text, using saved positions or the existing default layout. Full labels and details appear in the tables. A large plan can enable **Enlarge diagrams across four pages each** for a two-by-two tile layout per diagram. The report uses a light paper surface in either app theme. Printed tables repeat their headings and long writing wraps across pages. The unresolved list aggregates current address, reference, logical, and hardware checks; it is not the comprehensive Phase 5 validator.

## Notes and checklist behavior

Open **06 Notes** to record network decisions or create tasks. Attach either to the whole project, a subnet, a device, or any other existing project entity. The task states are To do, Doing, and Done. Search matches content and attachment labels; the status filter applies only to tasks. The completed count always describes all project tasks.

An active attachment filter becomes the default target for a new entry. Editing an entry preserves its ID. Unattached entries appear with project content. Deleting an attachment target, including a subnet removed by plan generation, preserves related notes/tasks and clears the attachment. Circular links between notes and tasks are rejected. Notes are plain text, with line breaks preserved; HTML is displayed as text.

## Interfaces and logical topology

Select a device in **03 Physical**, then use **Add interface**. A physical interface requires a named port on that device, and a port can have only one physical interface. Changing to a virtual kind clears the physical-port assignment. IP addresses use host CIDR notation, such as `192.168.10.1/24`, and may be left blank.

Create VLANs or VLAN ranges in **04 Logical**, then assign subnets through its inspector or interfaces through either inspector. Every subnet and interface appears even without a VLAN or assigned subnet. Membership lines connect existing VLAN/subnet/interface nodes; an interface names its device. Drag headers or focus a node and use arrow keys to save logical positions. This view describes planned relationships and does not simulate routing.

## Inventory behavior

Open **05 Inventory**, add a model, then allocate units to a device or site. Device choices come from the Physical workspace. Site allocations reserve stock but do not contribute to an individual device's port capacity.

Allocations may exceed available stock so a plan can include purchases. The balance and hardware issues identify the missing quantity. Allocated cost includes these planned units. All costs use the entered prices in one user-chosen currency; the project does not store or convert currencies.

Port demand counts a device's named physical ports. Supply sums `quantity × ports per unit` for all allocations to that device. Devices without allocations are marked unassigned. These checks compare counts only; media, speed, and capability compatibility are not checked.

Edits preserve entity IDs. Deleting a device also removes its device allocations; site allocations remain. Hardware and allocations share the same in-memory project as the planner and topology views.

## Phase 1 assumptions and limits

- The planner initializes from the first saved address space and can select other imported address spaces. Scope-aware overlap checks support multiple address spaces; new-space creation beyond the initial planner space remains outside this phase.
- One usable address selects /32, two select /31, and larger requests select the smallest block after excluding network and broadcast addresses. Requirements include the gateway. /31 is intended for point-to-point links.
- The calculator accepts a host address and normalizes the network. Planner inputs must already be aligned; invalid input produces the correct network suggestion.
- The initial Staff/Admin/Guests requirements are the example from the build brief. They are editable drafts until Generate subnets is pressed.
- Generate subnets replaces automatic allocations using the current requirement rows. Reserved and manually edited blocks remain fixed. A manual edit keeps the entity's ID and locks its requirement row. Delete that subnet and add a requirement to allocate it automatically again.
- If only part of a request fits, successful allocations are applied and each failure is shown. Invalid input and invalid manual or parent edits leave the applied document unchanged.
- Free space counts raw addresses. Its usable capacity depends on the eventual subdivision.
- Project names commit on Enter or blur. Network proposals commit through their explicit Apply or Generate action.
- Applied project changes persist in browser storage when writes succeed. Unapplied form drafts remain temporary. The current save status and recovery controls identify when saving is paused or unavailable.
- Schema version 1 is the first released format. The migration entry point validates and clones version 1, rejects missing/invalid versions, and rejects newer versions with an update message. There is no invented legacy format to migrate yet; add sequential migrations when version 2 is introduced.
- Schemas validate document shape. Planning checks cover CIDRs, capacities, gateways, parent containment, and subnet overlaps within a routing scope. Hardware checks report stock and port shortages. A unified issues view and additional topology, IP, VLAN, and compatibility checks remain for Phase 5.

## Structure

```text
src/
  core/
    cidr.ts                  IPv4 parsing, masks, capacities, ranges
    vlsm.ts                  Allocation and free-space calculation
    schema.ts                Zod schemas, inferred types, empty project
    migrations.ts            Version-aware document validation
    document.ts              JSON round-tripping, references, and import errors
    report.ts                Available report checks and assumptions
    planning.ts              Atomic subnet edits and generation
    topology.ts              Device, port, and cable transactions
    logical.ts               VLAN and interface transactions
    hardware.ts              Inventory, allocations, costs, and shortages
    notes.ts                 Notes, checklist, attachment validation and cleanup
    *.test.ts                Core regression and invariant tests
  state/projectStore.ts      Project document and editing actions
  state/persistenceStore.ts  Browser save status and startup subscription
  storage/                   Local save, backup/recovery, and downloads
  features/
    calculator/Calculator.tsx
    planner/Planner.tsx
    planner/SubnetEditor.tsx
    topology/                Physical and logical canvases and inspectors
    inventory/               Hardware, allocations, and capacity checks
    notes/                   Notes, implementation checklist, and filters
    files/                   Project JSON, print report, and SVG diagrams
  App.tsx                    Workspace shell and navigation
  main.tsx
  styles.css                 Tailwind and shared UI rules
tests/                       Workspace, file/recovery, and print acceptance tests
vite.config.ts
playwright.config.ts
```

`src/core` imports only Zod and other core modules. It never imports React, Zustand, storage, or cloud code. All IPv4 operations use exact arithmetic within JavaScript's safe integer range, avoiding signed 32-bit bitwise conversions. Free space is represented as aligned CIDR blocks; allocation never enumerates individual IP addresses.

`src/storage` handles local browser storage. Cloud code and SQL migrations remain later work; no Supabase dependency is installed.

## Dependency references

Installed the current stable npm releases and recorded their exact resolution in `package-lock.json`. Setup was checked against [Vite's React template](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-react/vite.config.js), [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite), [Zod's schema API](https://zod.dev/api), [Vitest configuration](https://vitest.dev/config/), and [Playwright configuration](https://playwright.dev/docs/test-configuration).

Inventory forms use controlled inputs and entity keys following [React's state-reset guidance](https://react.dev/learn/preserving-and-resetting-state). Allocation schemas share their device-or-site rule through [Zod's safeExtend](https://zod.dev/api#safeextend).

Logical canvas repairs follow the [React Flow custom-node types](https://reactflow.dev/api-reference/types/node-props), [handle identifiers](https://reactflow.dev/learn/customization/handles), and [node-change API](https://reactflow.dev/api-reference/types/node-change). Node dimensions and handles remain view data; the document stores only positions.

## Next work

Phase 5 adds a unified issues workspace with entity links and broader topology, address, VLAN, and hardware validation. The Phase 4 report already exposes the existing check results; additional network rules and repair/navigation flows should build on those core checks.

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
