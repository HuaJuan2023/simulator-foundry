# Third-party notices and provenance

Simulator Foundry's original source and instructions are licensed under MIT.
The packages below are installed through npm, not relicensed as Simulator Foundry code.

| Package | Tested version | Copyright / upstream | License text |
| --- | --- | --- | --- |
| three | 0.180.0 | three.js authors — https://github.com/mrdoob/three.js | LICENSES/three-MIT.txt |
| vite | 7.3.7 | VoidZero Inc. and Vite contributors — https://github.com/vitejs/vite | LICENSES/vite-LICENSE.md |
| mediabunny | 1.65.0 | Vanilagy and contributors — https://github.com/Vanilagy/mediabunny | LICENSES/mediabunny-MPL-2.0.txt |

Three.js add-ons OrbitControls and BufferGeometryUtils are part of the three package.
Vite's distributed license includes its bundled third-party notices. The lockfile records additional npm dependencies, whose installed license files remain applicable.

The root LICENSE applies only to original work. Preserve relevant third-party notices when redistributing dependencies or generated bundles. No modified Mediabunny library source is vendored in this repository.

## Reference inspiration

Fazley's Ocean Lab demonstration: https://x.com/itsfazley/status/2116458255556006282

It inspired the visual direction and interaction concept. No original source repository or license for that demonstration was verified, and this repository does not contain its video or extracted frames. The included screenshots are generated from this independent implementation.

## Packaging references

OpenAI skills documentation: https://developers.openai.com/codex/skills
Agent Skills specification: https://agentskills.io/specification

These are workflow/format references. No upstream skill instruction files are redistributed. The skill and guides included here were authored for this project.

## Optional fonts

The starter stylesheet requests DM Sans and Space Grotesk from Google Fonts when available and otherwise uses system fonts. No font binaries are bundled. See https://fonts.google.com/specimen/DM+Sans and https://fonts.google.com/specimen/Space+Grotesk before vendoring those fonts.
