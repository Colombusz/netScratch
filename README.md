# NetPlan

Phase 1 of the network planning workspace: a browser-based IPv4 calculator and subnet planner. No account, backend, API key, or environment file is needed.

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

Vitest covers networking math, VLSM allocation, planning transactions, schemas, and the migration boundary. Playwright checks complete calculator and planner flows, invalid edits, reservation/deletion, offline calculations after page load, keyboard navigation, responsive layouts, both themes, and axe accessibility checks. Browser tests start and stop their own Vite server on port 4173. Screenshots and failure traces are written to `test-results/`.

## Included in Phase 1

- IPv4 calculator: prefix or contiguous dotted-decimal mask, network, broadcast, usable endpoints and capacity.
- VLSM allocation: largest-first ordering, lowest aligned free block, reserved ranges, partial allocation with explicit insufficient-space errors.
- Planner: editable parent and routing scope, requirement rows, generated subnet table, fixed manual edits, optional gateways, reservations, deletion, and a CIDR list of unused space.
- Versioned Zod document with stable IDs, all planned entity types, independent physical/logical positions, `createEmptyProject()`, and `migrateProject()`.
- A Zustand store holding the project document. Pure core functions validate changes before committing them.

## Phase 1 assumptions and limits

- The UI edits one address space; the schema and scope-aware overlap checks support multiple address spaces.
- One usable address selects /32, two select /31, and larger requests select the smallest block after excluding network and broadcast addresses. Requirements include the gateway. /31 is intended for point-to-point links.
- The calculator accepts a host address and normalizes the network. Planner inputs must already be aligned; invalid input produces the correct network suggestion.
- The initial Staff/Admin/Guests requirements are the example from the build brief. They are editable drafts until Generate subnets is pressed.
- Generate subnets replaces automatic allocations using the current requirement rows. Reserved and manually edited blocks remain fixed. A manual edit keeps the entity's ID and locks its requirement row. Delete that subnet and add a requirement to allocate it automatically again.
- If only part of a request fits, successful allocations are applied and each failure is shown. Invalid input and invalid manual or parent edits leave the applied document unchanged.
- Free space counts raw addresses. Its usable capacity depends on the eventual subdivision.
- Project names commit on Enter or blur. Network proposals commit through their explicit Apply or Generate action.
- Projects stay in memory. Reloading loses the plan. Persistence and editable JSON import/export are Phase 4; there is no autosave claim or inactive export control.
- Schema version 1 is the first released format. The migration entry point validates and clones version 1, rejects missing/invalid versions, and rejects newer versions with an update message. There is no invented legacy format to migrate yet; add sequential migrations when version 2 is introduced.
- Schemas validate document shape. Phase 1 planning checks cover CIDRs, capacities, gateways, parent containment, and subnet overlaps within a routing scope. Full topology, IP, VLAN, and hardware validation comes in Phase 5.

## Structure

```text
src/
  core/
    cidr.ts                  IPv4 parsing, masks, capacities, ranges
    vlsm.ts                  Allocation and free-space calculation
    schema.ts                Zod schemas, inferred types, empty project
    migrations.ts            Version-aware document validation
    planning.ts              Atomic subnet edits and generation
    *.test.ts                Core regression and invariant tests
  state/projectStore.ts      Project document and editing actions
  features/
    calculator/Calculator.tsx
    planner/Planner.tsx
    planner/SubnetEditor.tsx
  App.tsx                    Workspace shell and navigation
  main.tsx
  styles.css                 Tailwind and shared UI rules
tests/workspace.spec.ts       Browser acceptance tests
vite.config.ts
playwright.config.ts
```

`src/core` imports only Zod and other core modules. It never imports React, Zustand, storage, or cloud code. All IPv4 operations use exact arithmetic within JavaScript's safe integer range, avoiding signed 32-bit bitwise conversions. Free space is represented as aligned CIDR blocks; allocation never enumerates individual IP addresses.

`src/storage`, topology features, cloud code, and SQL migrations will be added in their assigned phases. No Supabase dependency is installed in Phase 1.

## Dependency references

Installed the current stable npm releases and recorded their exact resolution in `package-lock.json`. Setup was checked against [Vite's React template](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-react/vite.config.js), [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite), [Zod's schema API](https://zod.dev/api), [Vitest configuration](https://vitest.dev/config/), and [Playwright configuration](https://playwright.dev/docs/test-configuration).

## Next phase

Phase 2 adds the React Flow physical topology editor: device palette, named port handles, bulk ports, labeled cables, visual grouping, and an inspector. Device deletion will remove its ports and links after confirmation. Every edit will update this same project document. Phase 2 starts only after you say `continue`.

## Manual acceptance checks

- Calculate `192.168.10.0/25`: network `.0`, broadcast `.127`, first host `.1`, last host `.126`, 126 usable addresses.
- Generate the default office example: Staff `.0/25`, Admin `.128/26`, Guests `.192/27`, and `.224/27` free.
- Change requirements to 100, 100, 50: two /25 blocks fit and the third segment gets an insufficient-space message.
- Reserve a /27 before generating; confirm allocations skip it and free space changes.
- Attempt an overlapping CIDR, gateway at network/broadcast, or too-small parent; confirm the previous plan remains intact.
- Edit a subnet, generate again, and confirm the manual block stays fixed.
- Switch calculator/planner and light/dark themes, navigate with Tab and Enter, and inspect the layout at 320px and enlarged text.
- For real mobile devices, focus the last inspector input and confirm it remains scrollable above the on-screen keyboard.

### PDF checks to run in Phase 4

PDF export is not implemented in Phase 1. When the dedicated print view is built:

- Confirm all seven report sections exist in the specified order, including assumptions and unresolved issues.
- Confirm text is selectable and SVG diagrams derive from document data and saved positions.
- Print both a small office and a large topology; check page fitting and optional enlarged/tiled diagrams.
- Use long, unbroken notes and several pages of port/interface rows; check wrapping, repeated table headers, and no clipped rows.
- Check subnet/VLAN, hardware/allocation, cable, and IP details against the editable document.
- Save a PDF in Chromium and Firefox and inspect page breaks, margins, and diagram labels at normal print size.
