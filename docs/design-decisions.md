# Phase 1 interface decisions

Reading: a planning workspace for network engineers with compact tables and address-focused typography. Dials: ENERGY 1 / RHYTHM 1 / MOTION 1. The brief supplies the navigation and workspace layout; visual styling is an implementation choice for this phase.

- Color: neutral work surfaces keep dense tables readable; one teal accent identifies actions and the calculated capacity. Error text has a separate semantic color.
- Themes: a working light/dark toggle supports engineers using the workspace in different lighting conditions.
- Layout: navigation on the left, calculations in the center, and field context or the active subnet editor on the right follow the specified workspace arrangement.
- Typography: system sans-serif keeps controls native and avoids network font requests; monospace is restricted to addresses and numerical comparisons.
- Identity: repeated network/prefix notation, numbered requirement rows, and aligned address tables express the network-planning task without decorative technical imagery.
- Spacing: tight rows make allocations comparable, while section gaps distinguish parent input, draft requirements, applied subnets, and free space.
- Containers: bordered panels group related form transactions; their boundaries separate draft input from committed results. There are no decorative feature cards.
- Imagery: none is needed for subnet calculations. The name is a text wordmark, with no invented logo or profile image.
- Motion: only hover feedback; networking forms do not need entrance animations.
- Narrow screens: navigation becomes a compact row, the inspector follows the content, and wide subnet tables scroll inside a labeled keyboard-focusable region.
- States: empty, invalid, pending-edit, successful, and partial-allocation states use explicit text. Calculations are synchronous, so there is no fabricated loading state.

The delivery checks and their evidence are recorded in `verification.md` after the browser run.

## Hardware inventory

Reading this as an inventory workspace for network engineers using the existing compact engineering tables. Dials: ENERGY 1 / RHYTHM 1 / MOTION 1.

- Hierarchy: stock balances come first because the primary decision is whether available units cover the plan; allocation details and port checks explain the demand below.
- Color and themes: existing neutrals and teal preserve continuity with the planner; shortage text uses the existing error color and an explicit quantity.
- Typography: system sans-serif keeps dense model names and actions readable; tabular numerals align quantities and costs without oversized monospace.
- Layout and containers: separate bordered sections distinguish stock, assignment transactions, and capacity checks. There are no decorative charts or metric cards.
- Spacing: compact rows support comparison; larger section gaps separate the three tasks. Costs remain a short definition list below the stock table.
- Forms: an inline editor precedes the tables, so it has enough width for model details and enters the keyboard sequence before the records being edited.
- Mobile: form fields stack below 600px; the existing shell reflows below 768px. Tables keep comparative columns inside named, keyboard-focusable scrolling regions.
- Focus: editors focus the first field; save, Cancel, and Escape return focus to the opener. Deletion moves focus to the relevant add action.
- States: empty stock and device lists explain what to add. Schema errors leave committed data unchanged. Transactions are synchronous and do not need an artificial loading state.
- Assets and motion: this work needs no imagery, icons, or new visual assets. Feedback is immediate; motion remains limited to direct control states.
- Copy: short labels name actual actions. Costs explicitly share one currency, and capacity help states that speed, media, and capabilities are not compared.

Inventory evidence and the full delivery gate are recorded in `inventory-verification.md`.

## Notes, checklist, and interface integration

Reading this as a network implementation workspace with project-linked writing and task states, using the existing engineering forms and lists. Dials: ENERGY 1 / RHYTHM 1 / MOTION 1.

- Hierarchy: filters precede notes and the checklist so users can collect the implementation work for one device or subnet. Project completion remains a plain count of real tasks.
- Layout: notes use readable full-width paragraphs with preserved line breaks; task rows place the text, status, and actions together. Status fields stack below 600px, use a second column at intermediate widths, and align with actions on wide screens.
- Color and typography: existing theme variables and system typography retain continuity and verified contrast. Status uses explicit words instead of color-only marks.
- Spacing and containers: bordered panels separate discovery, writing, and tracking; row borders separate entries without making each note a decorative card.
- Editors: inline forms focus the content field, restore focus after closing, and keep committed records intact when validation fails. Task changes that leave a filtered list return focus to the status filter.
- Attachments: readable entity names include device scope or subnet CIDR to distinguish similar names. Missing/deleted targets are named explicitly. A deletion preserves the user's writing.
- Imagery and motion: no new visual asset is needed. Controls give direct feedback without looping effects or entrance animation.
- Physical interfaces: the device inspector owns creation because it provides the port context. Its summary names kind, address, port, and VLAN; virtual interfaces clear physical-port ownership.
- Logical graph: every record remains visible without an assignment. Nodes name the actual device, gateway, or VLAN; edges represent real membership rather than artificial self-loops.
- VLAN color: a narrow top border maps VLAN number to a consistent hue for membership identity. Text stays on opaque theme surfaces and retains ordinary contrast; color carries no unique information.
- Graph dimensions: declared and measured dimensions match the fixed node containers so Fit view includes nodes before viewport culling mounts them. Node geometry stays out of the document.
- Graph interaction: ordinary inspector buttons provide keyboard access; dragging and arrow keys store logical positions independently of Physical. Membership edges are static, matching MOTION 1.

The Phase 3 verification report records browser flows, computed contrast, and the full delivery gate.

## Browser files and print report

Reading this as a project-file workspace and printable network plan in the established engineering language. Dials: ENERGY 1 / RHYTHM 1 / MOTION 1.

- Hierarchy: browser-save health comes first, followed by portable JSON transactions and a report preview, because users need to know which copy is safe before replacing it.
- Copy: messages distinguish committed changes, temporary drafts, paused saving, storage failures, and other-tab conflicts. Confirmations name the project being replaced.
- Typography: JSON uses monospace to preserve machine-readable indentation; report prose uses the existing system font, while diagram labels remain selectable text.
- Forms: opening a file fills an editable draft rather than replacing the plan. Validation and a concrete preview precede import confirmation.
- Color: existing theme tokens retain contrast in the application; the report uses a white paper surface in either app theme so the preview predicts printed output.
- Containers and spacing: panels group save recovery, JSON editing, and print options. Report sections follow the network plan rather than a dashboard template.
- Diagrams: SVG geometry derives from the existing physical/logical graphs and saved positions, avoiding screenshot clipping and preserving text in PDF. Full entity labels remain in schedules when a node label is shortened.
- Print layout: the application shell is removed and the report uses the page width. Each main report section starts on a new page; table headings repeat and long writing wraps naturally.
- Diagram size: fit-to-page is the default; a two-by-two tile option enlarges each diagram without changing saved positions or source data.
- Responsive layout: file controls wrap and the JSON editor fills the available width. Preview tables wrap cells on small screens; print layout is independent of the screen sidebar.
- State: file reads announce loading, import errors leave committed data intact, and all storage failures retain an editable in-memory project with an export route.
- Assets and motion: no new raster asset, illustration, icon library, or decorative animation is needed. SVG diagrams are representations of the user's project data.

Phase 4 evidence and the full delivery gate are recorded in `phase-4-verification.md`.
