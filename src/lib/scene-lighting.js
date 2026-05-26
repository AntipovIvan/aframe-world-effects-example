import { config } from "./config.js";

export const sceneLightingComponent = {
  init() {
    const l = config.lighting;
    const ext = l.directional.shadowCameraExtent;

    // ── Ambient ──────────────────────────────────────────────────────────────
    const ambient = document.createElement("a-entity");
    ambient.setAttribute(
      "light",
      [
        `type: ambient`,
        `color: ${l.ambient.color}`,
        `intensity: ${l.ambient.intensity}`,
      ].join("; "),
    );
    this.el.appendChild(ambient);

    // ── Directional (shadow-caster) ───────────────────────────────────────────
    const dir = document.createElement("a-entity");
    const p = l.directional.position;
    dir.setAttribute("position", `${p.x} ${p.y} ${p.z}`);
    dir.setAttribute(
      "light",
      [
        `type: directional`,
        `color: ${l.directional.color}`,
        `intensity: ${l.directional.intensity}`,
        `castShadow: ${l.directional.castShadow}`,
        `shadowMapWidth: ${l.directional.shadowMapSize}`,
        `shadowMapHeight: ${l.directional.shadowMapSize}`,
        `shadowCameraTop: ${ext}`,
        `shadowCameraBottom: ${-ext}`,
        `shadowCameraLeft: ${-ext}`,
        `shadowCameraRight: ${ext}`,
        `shadowBias: ${l.directional.shadowBias}`,
        `shadowRadius: ${l.directional.shadowRadius}`,
      ].join("; "),
    );
    this.el.appendChild(dir);
  },
};
