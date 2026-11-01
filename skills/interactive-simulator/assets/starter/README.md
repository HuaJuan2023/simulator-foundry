# Blue Passage / Ocean Lab starter

A procedural Three.js ocean simulator from [Simulator Foundry](https://github.com/HuaJuan2023/simulator-foundry), the runnable reference for the interactive-simulator skill.

## Run

Requires Node.js 20.19+ or 22.12+, npm and WebGL 2.

```sh
npm ci
npm test
npm run dev
```

Use the URL printed by Vite. Cargo is the default scene; use /?scene=cargo or /?scene=ocean. Build with npm run build and preview with npm run preview. On Windows, the included launcher can start the development server.

## Controls

- Drag empty water to orbit, right-drag to pan, and use the wheel to zoom.
- Enable object dragging to move the ship, buoys or barrels. Camera presets provide a starting view; free input remains available afterward.
- Set target speed/heading, weather, wave amplitude, wind, choppiness, clock time, sunrise and sunset in the control panel.
- Change the subject name and apply it to update model labels, interface and export captions. Names persist per scene in browser local storage.
- Space pauses/resumes, H hides panels, and the Screenshot button saves a PNG.
- Record opens manual capture or a 45/90-second automatic demonstration, with 720p/1080p and optional synthesized audio.

Automatic recording advances and encodes every frame at 30fps; generation may take longer than playback. Manual capture follows the live renderer and browser scheduling. Keep the page visible. WebCodecs and supported H.264/AAC encoders are needed for automatic MP4 export.

## Model and verification

The ship and fittings are generated from geometry. The ocean uses eight directional Gerstner waves, per-pixel normals, reflections and crest foam. Wake geometry stores world-space history; a floating-point ripple field is used when available. The vessel uses approximate surface sampling, not validated full hydrodynamics. Daylight is idealized; sound is synthesized rather than recorded or spatially positioned.

The baseline has 13 tests covering celestial/camera behavior, wake history, naming, codec negotiation, demonstration restoration and fixed-frame timing. Browser validation remains necessary for shader compilation and playback. The parent skill package includes reference screenshots and recorded 45-second/1350-frame export results; large QA videos are not part of this starter.

## Upstreams and license

Uses Three.js 0.180.0 (MIT), Vite 7.3.7 (MIT), and Mediabunny 1.65.0 (MPL-2.0). See LICENSE, THIRD_PARTY_NOTICES.md and LICENSES for attribution and license texts. The lockfile preserves tested dependency resolution.

Visual inspiration: [Fazley's Ocean Lab demonstration](https://x.com/itsfazley/status/2116458255556006282). This implementation is independent; no original source repository or source-code license for that demonstration was verified. No reference video or extracted frames are bundled.
