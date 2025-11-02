# Mobile/Desktop Responsive Enablement

This patch adds **automatic device detection** and **responsive layout** across the site.

## What was added
- `responsive.css`: mobile-first media queries that:
  - Stack grids and cards on phones
  - Make images/videos fluid
  - Adjust paddings/typography
  - Provide a hamburger nav pattern on small screens
- `responsive.js`: sets `body.is-mobile` / `body.is-desktop` classes using `matchMedia` and pointer detection. Also auto-injects a hamburger toggle into the first `<nav>` it finds.
- Injected into **every HTML page**:
  - `<meta name="viewport" content="width=device-width, initial-scale=1" />`
  - `<link rel="stylesheet" href="(relative)/responsive.css" />`
  - `<script src="(relative)/responsive.js" defer></script>`

## How it works
- On small screens (≤768px) or touch devices, the site gets `body.is-mobile` and the layout stacks into 1 column.
- On wider screens, `body.is-desktop` is set and multi-column grids return as space allows.
- Add `.mobile-only` or `.desktop-only` classes to any element to control visibility per device (optional).

## Notes
- If your nav already has a hamburger, remove the auto one by deleting the `setupNav(...)` calls in `responsive.js`.
- You can tune breakpoints inside `responsive.css`.
