# AR Tap-to-Place Experience

A mobile WebAR experience built with **8th Wall**, **A-Frame**, and a **4DS (volumetric video)** player. Users open a link on their phone, point the camera at the ground, tap to place a life-size 4DS model, and interact with it via drag and pinch gestures.

---

## How It Works

```
User opens link → Camera activates → Tap the ground → 4DS model loads
                                                          ↓ (if riseIn set)
                                              Model grows up out of the ground
                                                          ↓
                                              Drag to move · Pinch to resize
                                                          ↓ (if endImage / ctaUrl / sinkOut set)
                                              Sequence ends
                                                          ↓ (if sinkOut set)
                                              Model shrinks back into the ground
                                                          ↓ (if endImage / ctaUrl set)
                                              End-screen image pops up
                                                          ↓ (if ctaUrl set)
                                              Tap image → Opens URL in new tab
```

The experience **requires a special link** containing a signed token that points to the 4DS content. Opening the bare URL without parameters shows a friendly error screen.

---

## Quick Start (Development)

### Prerequisites

- Node.js 18+
- An [8th Wall](https://www.8thwall.com/) account and app key
- The `external/` folder populated with the 8th Wall SDK files (these are not committed; copy from your 8th Wall project)

### Install & Run

```bash
npm install
npm run serve       # webpack-dev-server with hot reload
```

The dev server starts at `http://localhost:8080`.  
Use **ngrok** (or a similar tunnel) to expose it over HTTPS for mobile testing:

```bash
npx ngrok http 8080
```

Then open the HTTPS ngrok URL on your phone.

### Build for Production

```bash
npm run build       # outputs to dist/
```

Copy the `dist/` folder to your hosting provider (S3, Cloudflare Pages, etc.).

---

## URL Parameters

The experience is driven by a URL that includes either:

### Option A — `paramsUrl` (recommended for production)

A URL pointing to a JSON endpoint that returns all parameters.  
This keeps tokens out of browser history and allows server-side control.

```
https://yourdomain.com/index.html?paramsUrl=https://api.example.com/params?token=YOUR_TOKEN
```

The endpoint must return JSON in one of these shapes:

```jsonc
// Shape 1 — nested under "params" key
{
  "params": {
    "vvData":   "https://cdn.example.com/sequence.4ds",
    "endImage": "https://cdn.example.com/banner.jpg",
    "ctaUrl":   "https://example.com/product"
  }
}

// Shape 2 — flat object
{
  "vvData":   "https://cdn.example.com/sequence.4ds",
  "endImage": "https://cdn.example.com/banner.jpg",
  "ctaUrl":   "https://example.com/product"
}
```

### Option B — Direct query parameters (useful for local testing)

```
https://yourdomain.com/index.html?vvData=https://cdn.example.com/sequence.4ds
```

With end-screen:

```
https://yourdomain.com/index.html?vvData=https://cdn.example.com/sequence.4ds&image=https://cdn.example.com/banner.jpg&url=https://example.com/product
```

With ground emerge/exit:

```
https://yourdomain.com/index.html?vvData=https://cdn.example.com/sequence.4ds&riseIn=true&sinkOut=true
```

### Supported Parameters

| Parameter | Aliases | Required | Description |
|-----------|---------|----------|-------------|
| `vvData` | `vvdata` | ✅ | URL of the `.4ds` volumetric sequence |
| `endImage` | `image` | — | URL of an image shown after the sequence ends. When set, the 4DS plays once (no loop) |
| `ctaUrl` | `url` | — | URL opened in a new tab when the user taps the end-screen image. Requires `endImage` to be set |
| `riseIn` | — | — | `true`/`false`. Model grows up out of the ground on placement instead of appearing instantly. Overrides `config.riseInOut.riseIn` for this link |
| `sinkOut` | — | — | `true`/`false`. Model shrinks back into the ground when the sequence ends, instead of just stopping. Overrides `config.riseInOut.sinkOut` for this link. Forces the sequence to play once (no loop), same as setting `endImage`/`ctaUrl` |

> **End-screen behaviour:** if `endImage`, `ctaUrl`, or `sinkOut` is set, the 4DS plays **once** from start to finish (no looping). When the sequence ends, it sinks into the ground first if `sinkOut` is enabled, then — if `endImage` or `ctaUrl` is set — a full-screen overlay appears showing the image. If `ctaUrl` is also set, tapping the image opens that URL in a new tab and a "タップして開く" hint is shown below the image. Without `ctaUrl` the image is display-only.
>
> **Rise/sink behaviour:** `riseIn` and `sinkOut` are independent — enable either or both. Both default to `false` (`config.riseInOut`), so a bare link with neither param behaves exactly like standard WebAR: the model just appears and disappears normally. The grow/shrink animation is a scale + local-height tween (no ground clipping), tuned via `config.riseInOut.duration` and `config.riseInOut.sinkDepth`.

---

## Configuration (`src/lib/config.js`)

All visual and placement defaults live here. Edit this file to tune the experience without touching component code.

```js
// src/lib/config.js (key sections)

config.hidewall.enabled          // true = show depth-mask wall behind model

config.model4D.offset.front      // metres toward camera at placement
config.model4D.offset.height     // metres up/down at placement
config.model4D.offset.side       // metres left/right at placement
config.model4D.offset.rotationY  // Y-axis trim in degrees
config.model4D.offset.baseScale  // multiplied with tapDetectionScale

config.model4D.tapDetectionScale // overall size of the model (increase = bigger)
config.model4D.tapScaleMin       // minimum scale when pinching
config.model4D.tapScaleMax       // maximum scale when pinching

config.lighting.directional.shadowMapSize   // 512 / 1024 / 2048
config.model4D.spotlight.enabled            // toggle shadow spotlight

config.riseInOut.riseIn     // default for the grow-out-of-ground effect (URL riseIn= overrides per link)
config.riseInOut.sinkOut    // default for the shrink-into-ground effect (URL sinkOut= overrides per link)
config.riseInOut.duration   // seconds, applies to both rise and sink
config.riseInOut.sinkDepth  // local metres the model drops while sinking (in addition to scaling to 0)
```

---

## User-Facing States

| State | What the user sees |
|-------|--------------------|
| **No valid link** | Error overlay: "Experience Not Available" + developer hint |
| **Waiting to tap** | AR camera view + animated tap indicator + "タップして配置 / カメラを地面に向けて、タップしてください" |
| **Loading** | Frosted-glass spinner overlay: "Loading experience…" |
| **Placed & playing** | Full AR view + "ドラッグして移動 · ピンチしてサイズ変更" pill (model grows up from the ground first if `riseIn` is set) |
| **Sequence ends** | Model shrinks back into the ground if `sinkOut` is set, otherwise just stops |
| **End screen** | Full-screen image overlay (play-once mode only). Tappable if `ctaUrl` is set |

---

## Project Structure

```
src/
├── app.js                   # Entry point — param resolution, error guard, component registration
├── index.html               # A-Frame scene + UI overlays (error, loading, end-screen, HUD)
├── index.css                # All UI styles (overlays, HUD, animations)
├── tap-place.js             # Ground-tap placement + drag/pinch gestures + end-screen trigger
└── lib/
    ├── config.js            # All tunable defaults
    ├── player4ds.js         # A-Frame component wrapping WEB4DS
    ├── enhanced_model4d.js  # Three.js mesh + texture + lighting helpers for 4DS
    ├── web4dvImporter.js    # WEB4DS decoder entry point
    ├── web4dvResource.js    # Web Worker codec loader (uses PUBLIC_PATH)
    ├── scene-lighting.js    # Ambient + directional light setup from config
    ├── hider-material.js    # Depth-mask material component
    ├── url-params.js        # URL / remote-JSON param resolver
    └── deviceUtils.js       # Device/WebGL detection helpers

config/
└── webpack.config.js        # Build config (Babel, CopyPlugin, DefinePlugin for PUBLIC_PATH)

external/                    # 8th Wall SDK files (not committed — copy from your project)
├── scripts/8frame-1.5.0.min.js
├── xrextras/xrextras.js
├── landing-page/landing-page.js
└── xr/xr.js
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AR tracking | 8th Wall SLAM (world tracking) |
| 3D scene | A-Frame 1.5 + Three.js |
| Volumetric video | WEB4DS (4D Views Solutions) |
| Build | Webpack 5 + Babel |
| Fonts | Outfit, Noto Sans JP (Google Fonts) |