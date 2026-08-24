export const urlParams = {};

// ─── Parameter key map ────────────────────────────────────────────────────────
const KEYS = {
  // Basic
  vvdata: ["vvdata"],
  gaid: ["gaid"],
  crGaid: ["cr-gaid"],

  // RiseIn
  enableRiseIn: ["enable-risein"],
  riseInIntervalMs: ["risein-interval-ms"],
  riseInHeightM: ["risein-height-m"],
  playAfterRiseIn: ["play-after-risein"],

  // SinkOut
  enableSinkOut: ["enable-sinkout"],
  sinkOutIntervalMs: ["sinkout-interval-ms"],
  sinkOutHeightM: ["sinkout-height-m"],

  // Link
  enableLink: ["enable-link"],
  linkUrl: ["link-url"],
  linkImage: ["link-image"],

  // Object
  enableAlwaysTapPlace: ["enable-always-tap-place"],
  enablePinchScale: ["enable-pinch-scale"],
  enableSwipeRotation: ["enable-swipe-rotation"],
  defaultScale: ["default-scale"],

  // Record
  enableRecord: ["enable-record"],
  maxRecordMs: ["max-record-ms"],

  // Repeat / Replay
  enableRepeat: ["enable-repeat"],
  replayAfterSinkOut: ["replay-after-sinkout"],
  replayDelayMs: ["replay-delay-ms"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveString(keys, json, search) {
  for (const k of keys) {
    const v = json?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  for (const k of keys) {
    const v = search.get(k);
    if (v !== null && v !== "") return v;
  }
  return null;
}

function resolveFloat(keys, json, search) {
  for (const k of keys) {
    const v = json?.[k];
    if (v !== undefined && v !== null) {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
  }
  for (const k of keys) {
    const v = search.get(k);
    if (v !== null && v !== "") {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function resolveBool(keys, json, search) {
  const parse = (v) => {
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
    return null;
  };
  for (const k of keys) {
    const v = json?.[k];
    if (v !== undefined && v !== null) {
      const b = parse(v);
      if (b !== null) return b;
    }
  }
  for (const k of keys) {
    const v = search.get(k);
    if (v !== null && v !== "") {
      const b = parse(v);
      if (b !== null) return b;
    }
  }
  return null;
}

// ─── Main initialiser ─────────────────────────────────────────────────────────

export async function initUrlParams() {
  const search = new URLSearchParams(window.location.search);
  let json = null;

  const paramsUrl = search.get("paramsUrl");
  if (paramsUrl) {
    try {
      const res = await fetch(paramsUrl);
      if (!res.ok) {
        const msg = `HTTP ${res.status} ${res.statusText}`;
        console.error("[url-params] paramsUrl fetch failed:", msg);
        urlParams._fetchError = msg;
        urlParams._fetchErrorType = "http";
      } else {
        const payload = await res.json();
        json = payload?.params ?? payload ?? null;
        if (!json || typeof json !== "object") {
          const msg =
            "Unexpected JSON shape: " + JSON.stringify(payload).slice(0, 200);
          console.error("[url-params]", msg);
          urlParams._fetchError = msg;
          urlParams._fetchErrorType = "json";
          json = null;
        }
      }
    } catch (err) {
      const msg = err.message || String(err);
      console.error("[url-params] Fetch error (possibly CORS):", err);
      urlParams._fetchError = msg;
      urlParams._fetchErrorType = "cors_or_network";
      urlParams._fetchErrorUrl = paramsUrl;
    }
  }

  Object.assign(urlParams, {
    // ── Basic ──────────────────────────────────────────────────────────────
    vvdata: resolveString(KEYS.vvdata, json, search),
    gaid: resolveString(KEYS.gaid, json, search),
    crGaid: resolveString(KEYS.crGaid, json, search),

    // ── RiseIn ─────────────────────────────────────────────────────────────
    // null = not specified by this link; caller falls back to config default.
    enableRiseIn: resolveBool(KEYS.enableRiseIn, json, search),
    riseInIntervalMs: resolveFloat(KEYS.riseInIntervalMs, json, search),
    riseInHeightM: resolveFloat(KEYS.riseInHeightM, json, search),
    playAfterRiseIn: resolveBool(KEYS.playAfterRiseIn, json, search),

    // ── SinkOut ────────────────────────────────────────────────────────────
    enableSinkOut: resolveBool(KEYS.enableSinkOut, json, search),
    sinkOutIntervalMs: resolveFloat(KEYS.sinkOutIntervalMs, json, search),
    sinkOutHeightM: resolveFloat(KEYS.sinkOutHeightM, json, search),

    // ── Link ───────────────────────────────────────────────────────────────
    enableLink: resolveBool(KEYS.enableLink, json, search),
    linkUrl: resolveString(KEYS.linkUrl, json, search),
    linkImage: resolveString(KEYS.linkImage, json, search),

    // ── Object ─────────────────────────────────────────────────────────────
    enableAlwaysTapPlace: resolveBool(KEYS.enableAlwaysTapPlace, json, search),
    enablePinchScale: resolveBool(KEYS.enablePinchScale, json, search),
    enableSwipeRotation: resolveBool(KEYS.enableSwipeRotation, json, search),
    defaultScale: resolveFloat(KEYS.defaultScale, json, search),

    // ── Record ─────────────────────────────────────────────────────────────
    enableRecord: resolveBool(KEYS.enableRecord, json, search),
    maxRecordMs: resolveFloat(KEYS.maxRecordMs, json, search),

    // ── Repeat / Replay ────────────────────────────────────────────────────
    enableRepeat: resolveBool(KEYS.enableRepeat, json, search),
    replayAfterSinkOut: resolveBool(KEYS.replayAfterSinkOut, json, search),
    replayDelayMs: resolveFloat(KEYS.replayDelayMs, json, search),

    _usedParamsUrl: !!paramsUrl,
    _paramsUrl: paramsUrl ?? null,
  });

  return urlParams;
}
