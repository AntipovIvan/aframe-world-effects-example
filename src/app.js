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

  AFRAME.registerComponent("tap-place", tapPlaceComponent);
  AFRAME.registerComponent("player4ds-component", player4dsComponent());
  AFRAME.registerComponent("scene-lighting-component", sceneLightingComponent);
  AFRAME.registerComponent("my-hider-material", myHiderMaterialComponent);
})();

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
