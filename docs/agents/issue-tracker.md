# Issue tracker: GitHub Issues

GitHub Issues is the canonical tracker for implementation work. Feature specs may remain as markdown files in `.scratch/`.

## Conventions

- One feature spec per directory: `.scratch/<feature-slug>/spec.md`.
- Create new implementation tickets in GitHub Issues, not under `.scratch/<feature-slug>/issues/`.
- Preserve `Status:`, `Type:`, dependencies, acceptance criteria and implementation history in the GitHub issue body.
- Use the triage role strings in `triage-labels.md` when labels are available; otherwise keep the role in the issue body.
- Files already under `.scratch/<feature-slug>/issues/` are migration archives. Their `GitHub-Issue:` line points to the canonical ticket; do not append new progress there.

## When a skill says "publish to the issue tracker"

Create a GitHub Issue in `hyunbeomlee1227-dev/mapleStarRecommend`. Link the relevant local spec when one exists, and never publish credentials or secrets.

## When a skill says "fetch the relevant ticket"

Open the referenced GitHub issue by number or URL. When given a legacy local issue path, follow its `GitHub-Issue:` value and treat GitHub as canonical.

## Wayfinding operations

Used by `/wayfinder`. The **map** may remain local, but child tickets are GitHub Issues.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: a GitHub Issue linked from the map. Record its type (`research`/`prototype`/`grilling`/`task`) and status in the issue body or labels.
- **Blocking**: record `Blocked by #N, #N` in the issue. A ticket is unblocked when every referenced issue is closed.
- **Frontier**: scan open GitHub Issues for tickets that are unblocked and unclaimed; lowest issue number wins.
- **Claim**: assign the issue or record `Status: claimed` before any work.
- **Resolve**: append the answer or completion evidence to the GitHub Issue, close it, then append a context pointer to the map's Decisions-so-far.
