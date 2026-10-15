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
