/**
 * url-params.js — URL / remote-JSON parameter resolver.
 *
 * Reads a JSON blob from ?paramsUrl=… (or direct query params as fallback).
 * Expected JSON shape:
 *   { "params": { "vvData": "…", "guidanceImage": "…", "gaid": "…", "cr-gaid": "…" } }
 */

import { config } from "./config.js";

/** Shared object populated by initUrlParams(). Import this anywhere. */
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
    guidanceimage: resolveString(
      ["guidanceImage", "guidanceimage"],
      json,
      search,
    ),

    // Analytics
    gaid: resolveString(["gaid", "a"], json, search),
    crGaid: resolveString(["cr-gaid", "c"], json, search),

    // Model offset overrides (optional)
    offsetX: resolveFloat(["offset_x", "x"], json, search),
    offsetY: resolveFloat(["offset_y", "y"], json, search),
    offsetZ: resolveFloat(["offset_z", "z"], json, search),

    // Meta
    _usedParamsUrl: !!paramsUrl,
    _paramsUrl: paramsUrl ?? null,
  });

  // Apply offset overrides to config so tap-place schema defaults pick them up.
  if (urlParams.offsetX !== null)
    config.model4D.offset.side = urlParams.offsetX;
  if (urlParams.offsetY !== null)
    config.model4D.offset.height = urlParams.offsetY;
  if (urlParams.offsetZ !== null)
    config.model4D.offset.front = urlParams.offsetZ;

  console.log("[url-params] Resolved:", {
    vvdata: urlParams.vvdata,
    guidanceimage: urlParams.guidanceimage,
  });

  return urlParams;
}

// ─── Google Analytics ─────────────────────────────────────────────────────────

export function initGoogleAnalytics() {
  const isValid = (id) =>
    !!id && id.trim() !== "" && id.trim() !== "-" && id.trim() !== "null";

  const ids = [urlParams.gaid, urlParams.crGaid].filter(isValid);
  if (ids.length === 0) return;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ids[0]}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  ids.forEach((id) => window.gtag("config", id));
}
