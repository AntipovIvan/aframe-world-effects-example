import { config } from "./config.js";

export const urlParams = {};

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
    // Core content
    vvdata: resolveString(["vvData", "vvdata"], json, search),

    endImage: resolveString(["endImage", "image"], json, search),
    ctaUrl: resolveString(["ctaUrl", "url"], json, search),

    // null = not specified by this link; caller falls back to config default.
    riseIn: resolveBool(["riseIn"], json, search),
    sinkOut: resolveBool(["sinkOut"], json, search),

    _usedParamsUrl: !!paramsUrl,
    _paramsUrl: paramsUrl ?? null,
  });
  console.log("[url-params] Resolved:", {
    vvdata: urlParams.vvdata,
    endImage: urlParams.endImage,
    ctaUrl: urlParams.ctaUrl,
    riseIn: urlParams.riseIn,
    sinkOut: urlParams.sinkOut,
  });

  return urlParams;
}
