/**
 * app.js — Application entry point.
 *
 * Boots in this order:
 *  1. Resolve all URL / remote-JSON params (awaited).
 *  2. Boot Google Analytics.
 *  3. Register A-Frame components.
 *
 * No image-target pipeline — ground-tap placement handles positioning.
 */

import { initUrlParams, initGoogleAnalytics } from "./lib/url-params.js";
import "./index.css";

import { tapPlaceComponent } from "./tap-place.js";
import { player4dsComponent } from "./lib/player4ds.js";
import { sceneLightingComponent } from "./lib/scene-lighting.js";
import { myHiderMaterialComponent } from "./lib/hider-material.js";

(async () => {
  // 1. Resolve all parameters before any A-Frame schema is captured.
  await initUrlParams();

  // 2. Google Analytics (gaid / crGaid are now populated).
  initGoogleAnalytics();

  // 3. Register components.
  //    Schemas that read from config.js are correct because initUrlParams()
  //    has already applied offset overrides.
  AFRAME.registerComponent("tap-place", tapPlaceComponent);
  AFRAME.registerComponent("player4ds-component", player4dsComponent());
  AFRAME.registerComponent("scene-lighting-component", sceneLightingComponent);
  AFRAME.registerComponent("my-hider-material", myHiderMaterialComponent);
})();
