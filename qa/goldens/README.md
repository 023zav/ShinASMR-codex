# Visual goldens

Low-res (360px-wide) reference screenshots for `npm run qa:visual -- --compare`.

These are captured on a developer machine. A **pixel** comparison is only
reliable when the rendering engine is pinned identically across machines —
font hinting, anti-aliasing, and GPU rasterization (SwiftShader) differ between
a local checkout and the GitHub Actions runner, which pushes identical renders
past the 2% threshold.

Because of that, CI runs the compare as **advisory**: it writes diffs to
`qa/screenshots/diffs/` and uploads them as artifacts for review, but does not
fail the build on drift. The hard visual gate in CI is `npm run qa:visual`,
which fails on captured browser errors (runtime exceptions, failed asset loads).

To make the pixel comparison a strict CI gate, generate and commit the goldens
from a containerized renderer that CI also uses, then drop `continue-on-error`
from the compare step in `.github/workflows/ci.yml`.

Refresh after an intentional visual change:

```bash
npm run qa:visual -- --update-goldens
```
