export const config = {
  // ─── Hider wall (depth-mask panel behind the 4DS model) ──────────────────
  // Set enabled: false to remove the wall entirely — useful when debugging
  // model placement or testing on devices where the depth mask causes issues.
  hidewall: {
    enabled: false, // toggle this to show/hide the wall
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
      shadowMapSize: 512, // 512 / 1024 / 2048 — higher = sharper but slower
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
      baseScale: 1, // multiplied with detectionScale to get final scale
    },

    // ── Ground-tap specific ───────────────────────────────────────────────────
    // tapDetectionScale replaces the physical image-target size (metres) that
    // popout-AR derived from image-target detection.  Increase if the model
    // appears too small, decrease if too large.
    tapDetectionScale: 1.0,

    // Pinch-to-resize limits (in final scene units).
    tapScaleMin: 0.05,
    tapScaleMax: 10.0,
  },
};

export default config;
