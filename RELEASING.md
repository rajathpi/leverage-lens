# Releasing a new version

People install Leverage Lens from GitHub and the add-on stores, so `main` always matches what they have.

## How work flows

- New work goes on the `dev` branch. `main` only changes when a version is released.
- Every change that users would notice gets a line under **Not released yet** in `CHANGELOG.md`, written for users, not developers.
- Release in batches, about every one or two weeks. The exception is a bug that breaks the card for people: that gets a quick fix release.
- Don't upload a new version to a store while that store is still reviewing the previous one. A new upload restarts the review.

## Version numbers

- `0.1.3`: bug fixes only.
- `0.2.0`: new features.
- `1.0.0`: when it has been stable for a while.

## Checklist

1. **Test** in Chrome and Firefox, logged in and logged out:
   - a mini future, including Plan a trade (MU and SEK)
   - a BULL/BEAR certificate, during and after trading hours
   - a stock page with every filter and sort button
   - an index page (Guld)
   - the buy and sell order page
2. **Version:** set `"version"` in `manifest.json`.
3. **Changelog:** rename **Not released yet** to the version and today's date, and start an empty **Not released yet** above it.
4. **Merge** `dev` into `main` and push.
5. **Zips:**
   - `dist/leverage-lens.zip` with a `leverage-lens/` folder inside, for GitHub
   - `dist/store/leverage-lens-store.zip` with `manifest.json` at the top, for the stores
6. **GitHub Release:** tag `vX.Y.Z`, paste that version's changelog entry, and attach `leverage-lens.zip`.
7. **Stores:** upload `leverage-lens-store.zip` to Firefox, Edge, Opera and Chrome, and paste the same notes into each store's "What's new" field.
