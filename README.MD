# AR Tap-to-Place Experience

A mobile WebAR experience built with **8th Wall**, **A-Frame**, and a **4DS (volumetric video)** player. Users open a link on their phone, point the camera at the ground, tap to place a life-size 4DS model, and interact with it via drag and pinch gestures.

---

## How It Works

```
User opens link → Camera activates → Tap the ground → 4DS model loads and plays
                                                          ↓
                                              Drag to move · Pinch to resize
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
    "vvData": "https://cdn.example.com/sequence.4ds",
    "gaid":   "G-XXXXXXXXXX",
    "cr-gaid": "G-YYYYYYYYYY"
  }
}

// Shape 2 — flat object
{
  "vvData": "https://cdn.example.com/sequence.4ds",
  "gaid":   "G-XXXXXXXXXX"
}
```

### Option B — Direct query parameters (useful for local testing)

```
https://yourdomain.com/index.html?vvData=https://cdn.example.com/sequence.4ds
```

### All Supported Parameters

| Parameter | Aliases | Description |
|-----------|---------|-------------|
| `vvData` | `vvdata` | **Required.** URL of the `.4ds` volumetric sequence |
| `guidanceImage` | `guidanceimage` | URL of an optional guidance image |
| `gaid` | `a` | Google Analytics measurement ID |
| `cr-gaid` | `c` | Secondary / Campaign Reporter GA ID |
| `offset_x` | `x` | Override `config.model4D.offset.side` (metres) |
| `offset_y` | `y` | Override `config.model4D.offset.height` (metres) |
| `offset_z` | `z` | Override `config.model4D.offset.front` (metres) |

---

## Configuration (`src/lib/config.js`)

All visual and placement defaults live here. Edit this file to tune the experience without touching component code.

```js
// src/lib/config.js (key sections)

config.hidewall.enabled         // true = show depth-mask wall behind model

config.model4D.offset.front     // metres toward camera at placement
config.model4D.offset.height    // metres up/down at placement
config.model4D.offset.side      // metres left/right at placement
config.model4D.offset.rotationY // Y-axis trim in degrees
config.model4D.offset.baseScale // multiplied with tapDetectionScale

config.model4D.tapDetectionScale // overall size of the model (increase = bigger)
config.model4D.tapScaleMin       // minimum scale when pinching
config.model4D.tapScaleMax       // maximum scale when pinching

config.lighting.directional.shadowMapSize   // 512 / 1024 / 2048
config.model4D.spotlight.enabled            // toggle shadow spotlight
```

---

## User-Facing States

| State | What the user sees |
|-------|--------------------|
| **No valid link** | Error overlay: "Experience Not Available" + developer hint |
| **Waiting to tap** | AR camera view + animated tap indicator + "Tap to place / Point camera at ground" |
| **Loading** | Frosted-glass spinner overlay: "Loading experience…" |
| **Placed & playing** | Full AR view + "Drag to move · Pinch to resize" pill |

---

## Project Structure

```
src/
├── app.js                   # Entry point — param resolution, error guard, component registration
├── index.html               # A-Frame scene + UI overlays
├── index.css                # All UI styles (overlays, HUD, animations)
├── tap-place.js             # Ground-tap placement + drag/pinch gesture state machine
└── lib/
    ├── config.js            # All tunable defaults
    ├── player4ds.js         # A-Frame component wrapping WEB4DS
    ├── enhanced_model4d.js  # Three.js mesh + texture + lighting helpers for 4DS
    ├── web4dvImporter.js    # WEB4DS decoder entry point
    ├── web4dvResource.js    # Web Worker codec loader (uses PUBLIC_PATH)
    ├── scene-lighting.js    # Ambient + directional light setup from config
    ├── hider-material.js    # Depth-mask material component
    ├── url-params.js        # URL / remote-JSON param resolver + Google Analytics
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

## Common Issues

### Model appears but is the wrong size
Adjust `config.model4D.tapDetectionScale` in `config.js`.  
Alternatively, pass `?offset_y=…` in the URL to shift height.

### "Experience Not Available" on a valid link
- Open DevTools → Network tab → check if the `paramsUrl` fetch succeeded.
- The most common cause is a **CORS header** missing on the params endpoint.  
  The endpoint must respond with `Access-Control-Allow-Origin: *` (or your domain).
- Check the `error-detail-text` element in the DOM for the exact error message.

### Audio doesn't play on iOS
iOS requires a user gesture to resume an `AudioContext`.  
The tap that places the model counts as a gesture — the component calls `audioCtx.resume()` synchronously inside `_onGroundClick`. If audio is still silent, check that the device is **not in silent mode**.

### CODEC files 404 in production
The web worker fetches `PUBLIC_PATH + "web4dv/CODEC.*"`.  
`PUBLIC_PATH` is injected at build time via `webpack.DefinePlugin` as `"/"`.  
Make sure `dist/web4dv/` is deployed alongside `dist/bundle.js`.

### Black screen / scene never loads
Verify your 8th Wall app key is configured and the `external/xr/xr.js` SDK file is present.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AR tracking | 8th Wall SLAM (world tracking) |
| 3D scene | A-Frame 1.5 + Three.js |
| Volumetric video | WEB4DS (4D Views Solutions) |
| Build | Webpack 5 + Babel |
| Fonts | Outfit, Noto Sans JP (Google Fonts) |