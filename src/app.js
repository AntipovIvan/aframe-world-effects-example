import { initUrlParams } from "./lib/url-params.js";
import "./index.css";
import { tapPlaceComponent } from "./tap-place.js";
import { player4dsComponent } from "./lib/player4ds.js";
import { sceneLightingComponent } from "./lib/scene-lighting.js";
import { myHiderMaterialComponent } from "./lib/hider-material.js";

(async () => {
  const params = await initUrlParams();
  if (!params.vvdata) {
    showErrorOverlay(params);
    return;
  }

  initAnalytics(params);

  AFRAME.registerComponent("tap-place", tapPlaceComponent);
  AFRAME.registerComponent("player4ds-component", player4dsComponent());
  AFRAME.registerComponent("scene-lighting-component", sceneLightingComponent);
  AFRAME.registerComponent("my-hider-material", myHiderMaterialComponent);

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => applyMaxDurationOverride(params),
      { once: true },
    );
  } else {
    applyMaxDurationOverride(params);
  }
})();

// ─── Record feature (max-record-ms) ───────────────────────────────────────────
function applyMaxDurationOverride(params) {
  const captureConfigEl = document.querySelector("xrextras-capture-config");
  if (!captureConfigEl) {
    console.warn(
      "[app] <xrextras-capture-config> not found; max-duration-ms override skipped.",
    );
    return;
  }
  if (params.maxRecordMs > 0) {
    captureConfigEl.setAttribute("max-duration-ms", String(params.maxRecordMs));
  } else {
    console.log(
      "[app] no max-record-ms param — using default max-duration-ms:",
      captureConfigEl.getAttribute("max-duration-ms"),
    );
  }
}

// ─── Google Analytics (gaid / cr-gaid) ─────────────────────────────────────────
function initAnalytics(params) {
  const ids = [params.gaid, params.crGaid].filter(Boolean);
  if (ids.length === 0) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  ids.forEach((id) => gtag("config", id));
}

function showErrorOverlay(params) {
  const overlay = document.getElementById("error-overlay");
  if (!overlay) return;

  const detailEl = document.getElementById("error-detail-text");
  if (detailEl && params._fetchError) {
    const typeLabel =
      {
        http: "Server error",
        json: "Bad response format",
        cors_or_network: "Network / CORS error",
      }[params._fetchErrorType] ?? "Error";

    detailEl.textContent = `${typeLabel}: ${params._fetchError}`;
  }

  overlay.style.display = "flex";
  console.warn(
    "[app] Experience cannot start — vvdata is missing.",
    params._fetchError
      ? `Fetch error: ${params._fetchError}`
      : "(no paramsUrl provided)",
  );
}
