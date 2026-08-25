export const config = {
  hidewall: {
    enabled: false,
  },

  lighting: {
    ambient: {
      color: "#ffffff",
      intensity: 0.5,
    },
    directional: {
      color: "#ffffff",
      intensity: 0.8,
      position: { x: 0, y: 4, z: 0 },
      castShadow: true,
      shadowMapSize: 1024, // 512 / 1024 / 2048 — higher = sharper but slower
      shadowCameraExtent: 5,
      shadowBias: -0.0001,
      shadowRadius: 3, // blur softness
    },
    shadowGround: {
      opacity: 0.35,
    },
  },

  model4D: {
    spotlight: {
      enabled: true,
      color: 0xffffff,
      intensity: 0.3,
      distance: 20,
      angle: Math.PI / 3,
      penumbra: 0.3,
      decay: 2,
      offset: { x: 0, y: 4, z: 0 },
      castShadow: false,
      shadowMapSize: [1024, 1024],
      shadowCameraNear: 1,
      shadowCameraFar: 50,
      shadowCameraFov: 40,
      shadowBias: -0.0001,
      shadowNormalBias: 0.05,
    },

    shadowOpacity: 0.35,

    offset: {
      front: 0.0, // metres toward camera  (neg = away from camera)
      height: -0.58, // metres up/down        (neg = lower)
      side: -0.05, // metres left/right     (neg = left)
      rotationY: 3, // degrees Y-axis trim
      baseScale: 1, // multiplied with config.object.defaultScale to get final scale
    },

    // Pinch-to-resize limits (in final scene units). Not spec params —
    // internal safety clamp applied regardless of enable-pinch-scale.
    tapScaleMin: 0.05,
    tapScaleMax: 10.0,
  },

  // ── RiseIn / SinkOut ──────────────────────────────────────────────────────
  riseInOut: {
    riseIn: false, // enable-risein default
    sinkOut: false, // enable-sinkout default

    riseInIntervalMs: 1000, // risein-interval-ms default — time the RiseIn animation takes
    riseInHeightM: -2.0, // risein-height-m default — object's height before RiseIn starts
    playAfterRiseIn: true, // play-after-risein default — play only after RiseIn completes

    sinkOutIntervalMs: 1000, // sinkout-interval-ms default — time the SinkOut animation takes
    sinkOutHeightM: -2.0, // sinkout-height-m default — object's height once fully sunk
  },

  // ── Object (tap-place / gesture) ─────────────────────────────────────────
  object: {
    enableAlwaysTapPlace: true, // enable-always-tap-place default
    enablePinchScale: true, // enable-pinch-scale default
    enableSwipeRotation: true, // enable-swipe-rotation default
    defaultScale: 1.0, // default-scale default
  },

  // ── Record ────────────────────────────────────────────────────────────────
  record: {
    enableRecord: true, // enable-record default — show the capture button
    maxDurationMs: 60000, // fallback; index.html's max-duration-ms must match
  },

  // ── Repeat / Replay ───────────────────────────────────────────────────────
  repeat: {
    enableRepeat: false, // enable-repeat default — force looping
    replayAfterSinkOut: false, // replay-after-sinkout default — cyclic replay
    replayDelayMs: 1000, // replay-delay-ms default — pause before replaying
  },
};

export default config;
