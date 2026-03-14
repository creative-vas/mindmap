# Mindmap

A browser-based, interactive mind map tool. No backend required — runs entirely as a static HTML file.

## Features

- **Radial tree layout** — nodes expand outward from the center
- **Add / edit / delete nodes** — right-click any node for options, double-click to edit
- **Color coding** — pick from a palette of 16 colors per node
- **Links** — attach URLs or local file paths to any node
- **Save / Load** — export your mind map as JSON and re-import it later
- **Zoom & pan** — scroll to zoom, drag to pan
- **Fully client-side** — no server, no database, no sign-up

## Usage

Open `index.html` in any modern browser. The map starts with a minimal template (Ideas, Tasks, Notes) that you can edit to make your own.

### Controls

| Action | How |
|---|---|
| Expand / collapse | Click a node |
| Edit a node | Double-click |
| Add child / edit / delete | Right-click |
| Pan | Drag the canvas |
| Zoom | Scroll wheel |

### Save & Load

Use the **Save** button (top-right) to download your map as a `.json` file. Use **Load** to restore a previously saved map.

## Deploy on Netlify

This is a static site — just point Netlify at this repo:

1. Connect your GitHub repo on [Netlify](https://app.netlify.com)
2. **Build command:** _(leave blank)_
3. **Publish directory:** `.`
4. Deploy

No build step needed.

## License

MIT
