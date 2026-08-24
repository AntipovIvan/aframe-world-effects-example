# AR Tap-to-Place Experience

A mobile WebAR experience built with **8th Wall**, **A-Frame**, and a **4DS (volumetric video)** player. Users open a link on their phone, point the camera at the ground, tap to place a life-size 4DS model, and interact with it via drag, pinch, and twist gestures.

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
    "vvdata":     "https://cdn.example.com/sequence.4ds",
    "link-image": "https://cdn.example.com/banner.jpg",
    "link-url":   "https://example.com/product"
  }
}

// Shape 2 — flat object
{
  "vvdata":     "https://cdn.example.com/sequence.4ds",
  "link-image": "https://cdn.example.com/banner.jpg",
  "link-url":   "https://example.com/product"
}
```

### Option B — Direct query parameters (useful for local testing)

```
https://yourdomain.com/index.html?vvdata=https://cdn.example.com/sequence.4ds
```

With the Link end-screen:

```
https://yourdomain.com/index.html?vvdata=https://cdn.example.com/sequence.4ds&enable-link=true&link-image=https://cdn.example.com/banner.jpg&link-url=https://example.com/product
```

With ground emerge/exit:

```
https://yourdomain.com/index.html?vvdata=https://cdn.example.com/sequence.4ds&enable-risein=true&enable-sinkout=true
```

With video recording:

```
https://yourdomain.com/index.html?vvdata=https://cdn.example.com/sequence.4ds&enable-record=true&max-record-ms=15000
```

### Supported Parameters

#### Basic

| Parameter | Required | Default | Description |
|-----------|:---:|---------|--------------|
| `vvdata` | ✓ | — | URL of the `.4ds` volumetric sequence to play |
| `gaid` | — | — | Google Analytics ID used for client-side tracking |
| `cr-gaid` | — | — | Crescent-side Google Analytics ID (internal usage tracking) |

#### Record

| Parameter | Default | Description |
|-----------|---------|--------------|
| `enable-record` | `false` | `true`: show the video-capture button while the 4DS plays. The user can record the camera feed + model; when the sequence ends, any in-progress recording is force-stopped and the button hides |
| `max-record-ms` | `60000` | Overrides the recording length in milliseconds (applied onto `<xrextras-capture-config max-duration-ms>` in `src/index.html`) |

Recordings are produced by 8th Wall's xrextras capture pipeline (`<xrextras-capture-button>` / `<xrextras-capture-preview>` in `src/index.html`). The capture button's visibility/z-index and record lifecycle handling live in `src/lib/capture.js`. The 4DS audio graph is routed into the recording via `XR8.MediaRecorder.configure()` (see `src/lib/player4ds.js`).

> **Loop-mode note:** the auto stop-and-hide is driven by `player4ds-ended`, which only fires in play-once mode. If the sequence loops (no `link-image`/`link-url`/`enable-sinkout`), the capture button stays visible until the page is closed — the user simply stops their own recordings manually.

#### RiseIn

| Parameter | Default | Description |
|-----------|---------|--------------|
| `enable-risein` | `false` | `true`: model rises up out of the ground on placement. `false`: model appears instantly at the tapped position |
| `risein-interval-ms` | `1000` | How long the RiseIn animation takes, in milliseconds |
| `risein-height-m` | `-2.0` | The object's height (relative, metres) before RiseIn starts |
| `play-after-risein` | `true` | `true`: playback starts only after RiseIn finishes. `false`: the 4DS plays while it rises |

#### SinkOut

| Parameter | Default | Description |
|-----------|---------|--------------|
| `enable-sinkout` | `false` | `true`: model sinks back into the ground once playback ends. `false`: model is hidden immediately when playback ends |
| `sinkout-interval-ms` | `1000` | How long the SinkOut animation takes, in milliseconds |
| `sinkout-height-m` | `-2.0` | The object's height (relative, metres) once fully sunk |

#### Link

| Parameter | Default | Description |
|-----------|---------|--------------|
| `enable-link` | *(auto)* | `true`: show the end-screen image/link after playback. `false`: show nothing. If omitted, defaults to `true` whenever `link-image` or `link-url` is set |
| `link-url` | — | URL opened in a new tab when the user taps the end-screen image |
| `link-image` | — | Image shown on the full-screen overlay after the sequence ends |

> Setting `link-image`, `link-url`, or `enable-sinkout` forces the 4DS to play **once** (no loop).

#### Object

| Parameter | Default | Description |
|-----------|---------|--------------|
| `enable-always-tap-place` | `true` | `true`: tapping the ground always moves the placed object. `false`: ground-tap placement only works for the first tap |
| `enable-pinch-scale` | `true` | Enables/disables two-finger pinch-to-resize |
| `enable-swipe-rotation` | `true` | Enables/disables two-finger twist-to-rotate |
| `default-scale` | `1.0` | Overall size multiplier applied to the placed object |

---

## Configuration (`src/lib/config.js`)

All visual and placement defaults live here — grouped to match the URL parameter categories above. Edit this file to tune the experience without touching component code.

```js
// src/lib/config.js (key sections)

config.hidewall.enabled              // true = show depth-mask wall behind model

config.model4D.offset.front          // metres toward camera at placement
config.model4D.offset.height         // metres up/down at placement
config.model4D.offset.side           // metres left/right at placement
config.model4D.offset.rotationY      // Y-axis trim in degrees
config.model4D.offset.baseScale      // multiplied with config.object.defaultScale
config.model4D.tapScaleMin           // minimum scale when pinching
config.model4D.tapScaleMax           // maximum scale when pinching

config.lighting.directional.shadowMapSize   // 512 / 1024 / 2048
config.model4D.spotlight.enabled            // toggle shadow spotlight

// RiseIn / SinkOut — defaults for the matching URL params
config.riseInOut.riseIn               // enable-risein default
config.riseInOut.sinkOut              // enable-sinkout default
config.riseInOut.riseInIntervalMs     // risein-interval-ms default
config.riseInOut.riseInHeightM        // risein-height-m default
config.riseInOut.playAfterRiseIn      // play-after-risein default
config.riseInOut.sinkOutIntervalMs    // sinkout-interval-ms default
config.riseInOut.sinkOutHeightM       // sinkout-height-m default

// Object — defaults for the matching URL params
config.object.enableAlwaysTapPlace    // enable-always-tap-place default
config.object.enablePinchScale        // enable-pinch-scale default
config.object.enableSwipeRotation     // enable-swipe-rotation default
config.object.defaultScale            // default-scale default

// Record — defaults for the matching URL params
config.record.enableRecord            // enable-record default
config.record.maxDurationMs           // fallback max length in ms;
                                      // must match <xrextras-capture-config
                                      // max-duration-ms> in src/index.html
```

---

## User-Facing States

| State | What the user sees |
|-------|--------------------|
| **No valid link** | Error overlay: "Experience Not Available" + developer hint |
| **Waiting to tap** | AR camera view + animated tap indicator + "タップして配置 / カメラを地面に向けて、タップしてください" |
| **Loading** | Frosted-glass spinner overlay: "Loading experience…" |
| **Placed & playing** | Full AR view + "ドラッグして移動 · ピンチしてサイズ変更" pill (model grows up from the ground first if `enable-risein` is set). With `enable-record=true`, a video-capture button also appears |
| **Re-placing** | If `enable-always-tap-place` is on (default), tapping the ground again moves the object to the new spot |
| **Recording** *(with `enable-record`)* | Tap the capture button to record the camera feed + model (capped at `max-record-ms`). A full-screen preview opens when the recording finishes; saving/sharing is handled by xrextras |
| **Sequence ends** | Model shrinks back into the ground if `enable-sinkout` is set, otherwise just stops. Any in-progress recording is force-stopped and the capture button hides |
| **End screen** | Full-screen image overlay (play-once mode only). Tappable if `link-url` is set |

---