# Mockups — desktop audit v2.61

Static HTML for the structural proposals in [`../../ux-audit-v2.61.md`](../../ux-audit-v2.61.md) (epic #1614). Open any file in a browser; nothing is built, nothing is fetched. They use the same tokens the app does — Inter, the indigo accent, hairline borders, 12 px radii — so a reader compares like with like, but they are sketches of *layout and hierarchy*, not pixel specs: the component that ships should come from PrimeNG and the design system, not from this CSS.

| File | Proposal | Issue |
|---|---|---|
| [`today.html`](./today.html) | A **Today** screen as the app's first screen: tonight's classes, the alerts, what to teach, system state | the "Budojo has no home" proposal |
| [`academy-edit.html`](./academy-edit.html) | The academy form in five sections with a sticky action bar and deliberate field widths | ACADE-1, ACADE-2 |
| [`athlete-header.html`](./athlete-header.html) | The athlete header with contacts and actions, and a tab strip that holds only sections | DET-1, DET-2 |
| [`roster-empty.html`](./roster-empty.html) | The two empty states of the roster, side by side | ATH-1 |
| [`programme.html`](./programme.html) | The programme page with a search field and the row as the "in season" toggle | SYL-1, SYL-2, SYL-3 |

Each file is one screen at 1280 wide. Where a mockup shows a state the app already has, it is drawn from the audit's screenshot of it; where it shows something new, the new part is the only thing that differs from the shipped screen, so the diff is the proposal.
