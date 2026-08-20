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

    tapDetectionScale: 1.0,

    // Pinch-to-resize limits (in final scene units).
    tapScaleMin: 0.05,
    tapScaleMax: 10.0,
  },

  riseInOut: {
    riseIn: false, // model slides up out of the ground on placement
    sinkOut: false, // model slides back down into the ground when playback ends
    duration: 2.0, // seconds, applies to both rise and sink (per user request: ~2s)
    // How far below the clip plane (ground level) the model sits when fully
    // sunk, as a multiple of the model's own local-space height. 1.0 means
    // "drop it exactly its own height" — guaranteed to clear the ground
    // clip plane regardless of the model's real-world scale, since it's
    // measured in the model's own local units (pre-scale), same as the
    // bounding box used to compute it.
    sinkDepthMultiplier: 1.15,

    // Fallback local-space height (metres) used only if the model's bounding
    // box can't be measured yet when the first RiseIn/SinkOut kicks off.
    sinkDepthFallback: 2.0,
  },
};

export default config;
