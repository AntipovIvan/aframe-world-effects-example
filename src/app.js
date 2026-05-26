import { initUrlParams, initGoogleAnalytics } from "./lib/url-params.js";
import "./index.css";
import { tapPlaceComponent } from "./tap-place.js";
import { player4dsComponent } from "./lib/player4ds.js";
import { sceneLightingComponent } from "./lib/scene-lighting.js";
import { myHiderMaterialComponent } from "./lib/hider-material.js";

(async () => {
  // 1. Resolve all parameters before any A-Frame schema is captured.
  const params = await initUrlParams();

  // 2. Guard: if we have no content URL, show the error overlay and bail out.
  //    The A-Frame scene is still present in the DOM (camera permission prompt
  //    may already be showing), so we overlay without tearing down the scene.
  if (!params.vvdata) {
    showErrorOverlay(params);
    return; // ← skip component registration; AR experience won't start
  }

  // 3. Google Analytics (gaid / crGaid are now populated).
  initGoogleAnalytics();

  // 4. Register components.
  //    Schemas that read from config.js are correct because initUrlParams()
  //    has already applied offset overrides.
  AFRAME.registerComponent("tap-place", tapPlaceComponent);
  AFRAME.registerComponent("player4ds-component", player4dsComponent());
  AFRAME.registerComponent("scene-lighting-component", sceneLightingComponent);
  AFRAME.registerComponent("my-hider-material", myHiderMaterialComponent);
})();

// ─── Error overlay helper ─────────────────────────────────────────────────────

/**
 * Reveal #error-overlay and optionally populate a developer-facing detail line.
 *
 * @param {object} params  The urlParams object returned by initUrlParams().
 */
function showErrorOverlay(params) {
  const overlay = document.getElementById("error-overlay");
  if (!overlay) return;

  // Optional detail line for developers — shown only when there is a fetch error.
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
