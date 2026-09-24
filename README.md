# Fishing Simulator 2028

A cartoony 3D boat-fishing upgrade game in the spirit of 2000s Flash games. Sail six realms, dive for hundreds of creatures, fight bosses and the Kraken, and upgrade everything.

**[▶ Play in your browser](https://damos1212.github.io/fishing-simulator-2028/)**

It needs a desktop browser with WebGPU, such as current Chrome, Edge or Safari.

## Controls

| Input | Action |
| --- | --- |
| WASD | Sail, or steer the lure |
| Mouse, trackpad swipe or arrow keys | Look around (click to capture the mouse) |
| Hold click / Space | Charge and cast, then reel in |
| Hold Shift / right click | Dive |
| A / D during a fight | Counter the fish's pull |
| 1 - 6 | Use supplies |
| E | Shop at docks and outposts |
| M / H / F / Esc | Map / horn / photo mode / pause |

## Development

```bash
npm install
npm run dev    # http://127.0.0.1:5190
```

- `npm test` runs the unit tests.
- `npm run build` typechecks and builds `dist/`.
- `npm run models` regenerates `public/models` with Blender.

The engine is custom WebGPU with raw WGSL, and there are no runtime dependencies. Every push to `main` deploys the game to GitHub Pages.
