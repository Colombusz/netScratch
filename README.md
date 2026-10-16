# netScratch

netScratch is a browser-based workspace for planning small and mid-sized IPv4 networks. It keeps address plans, physical and logical diagrams, equipment, implementation notes, and project files together so a network can be reviewed as one plan.

Use it when you need to sketch an office or branch network, divide an address block into subnets, compare a proposed build with available hardware, record implementation work, or prepare a project handoff. It is a planning tool: it does not configure devices, monitor a live network, or simulate routing.

## Try the app

The quickest way to see a populated project is to start the app, open **07 Files**, and select **Load sample project**. After confirming, explore the physical and logical diagrams, address plan, inventory, notes, and issue list. The fictional office and branch project includes an intentional access point stock shortage so the Issues workspace has a repair example. Equipment names and costs are illustrative. Loading the sample replaces the open project, so download a JSON copy first if you want to keep your current work.

## Features

The app is organized into eight workspaces:

| Workspace | What it is for |
| --- | --- |
| **01 Calculator** | Calculate the network, broadcast, usable host range, and capacity from an IPv4 address and prefix or subnet mask. |
| **02 Planner** | Define address spaces and routing scopes, enter host requirements, allocate subnets with VLSM, reserve ranges, and review unused space. Manual subnet edits stay fixed when the plan is generated again. |
| **03 Physical** | Draw sites with devices, named ports, and cable connections. Inspect and edit device and port details. |
| **04 Logical** | Map VLANs to subnets and interfaces. Physical interfaces, subinterfaces, SVIs, and loopbacks can be represented, including records that are not yet assigned to a VLAN. |
| **05 Inventory** | Maintain hardware models, stock, unit costs, capabilities, and allocations to devices or sites. See planned shortages and compare device port demand with allocated capacity. |
| **06 Notes** | Keep project notes and an implementation checklist. Attach entries to project entities, search them, and track tasks as To do, Doing, or Done. |
| **07 Files** | Save and import validated project JSON, recover a previous browser save, start an empty project, load the sample, and print a report or save it as PDF. |
| **08 Issues** | Find address, VLAN, interface, cable, hardware, and capacity issues. Open an affected item from a finding and repair it in its workspace. |

Changes to the project can be undone and redone during the current session, up to 50 committed edits. The app also has light and dark themes and supports keyboard navigation.

## Common workflows

### Plan an address block

Use Calculator to check CIDR details, then open Planner to set the parent network and add host requirements. Generate subnets to allocate the largest requests first into the lowest aligned free ranges. Add reservations or edit a subnet manually when a range needs to stay fixed. Planner reports requests that do not fit and shows remaining CIDR blocks.

### Document a proposed network

Add devices and ports in Physical, then connect them with cables and group them by site. Create VLANs and interfaces in Logical and associate them with subnets. Add hardware models and allocate units in Inventory. Use Notes for decisions and implementation steps, then check Issues for unresolved findings.

### Review or hand off a plan

Resolve or document findings in Issues, then open Files to review the report. The report includes the overview and findings, diagrams, address and VLAN plans, inventory, connection schedules, notes, and checklist. Choose **Print / save PDF** and select Save as PDF in the browser's print dialog. For a large diagram, enable the four-page enlargement option.

## Project data and saving

Applied changes save automatically to browser storage for the current browser profile and site address. Form drafts are temporary. Browser storage is useful while working in that browser, but it is not a portable backup: clearing site data removes the saved project, and another browser, profile, host, or port has separate storage. Use **Download project JSON** in Files to keep a copy outside the browser.

JSON imports are validated and previewed before they replace the open project. Invalid files leave the current project untouched. Files up to 20 MiB are supported. Files also provides a previous-save backup and recovery controls if browser storage fails or contains unreadable data. The current app has no account or cloud sync.

## Planning assumptions and limits

- VLSM allocation places larger host requirements first and uses the lowest aligned available block. The requested host count includes the gateway. A request for one usable address uses /32; two use /31, intended for point-to-point links; larger requests reserve network and broadcast addresses.
- Subnet overlap checks apply to address spaces with the same routing scope. Separate scopes can reuse addresses. Interface IP uniqueness also follows the device's routing scope.
- Issues checks consistency and declared constraints. It does not model routing behavior, validate a vendor configuration, or guarantee that a proposed design will work when deployed. Hardware capability tags are planning data, not device discovery.
- Hardware shortages are allowed in a plan so future purchases can be recorded. Site allocations reserve stock but do not count toward an individual device's port capacity.
- Costs use the prices entered by the project owner. Projects do not store a currency or convert between currencies.
- Project documents use schema version 1. Imports reject unsupported newer versions rather than silently rewriting them.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite, usually `http://127.0.0.1:5173`. To build and serve the production bundle locally:

```sh
npm run build
npm run preview
```

## Development checks

```sh
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

The unit suite covers network calculations, allocation, project transactions, document validation, issues, and browser persistence. Playwright covers workspace flows, sample loading, save and recovery behavior, reports, keyboard use, responsive layouts, themes, and accessibility. End-to-end tests start a Vite server on port 4173 and write artifacts to `test-results/`.

## Project structure

```text
src/
  core/       IPv4, planning, topology, inventory, issues, reports, and document rules
  state/      Project editing and browser save state
  storage/    Local browser persistence, backups, recovery, and downloads
  features/   The eight user-facing workspaces
  App.tsx     Navigation, project name, themes, and session history
tests/        Browser acceptance tests
supabase/     Retained migration and setup notes from an earlier cloud implementation
```

The Cloud workspace has been removed from the app. The retained Supabase files are inactive and are not needed to run netScratch.
