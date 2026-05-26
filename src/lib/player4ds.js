import WEB4DS from "./web4dvImporter.js";

const TIME_EMIT_INTERVAL_MS = 200;

const player4dsComponent = () => ({
  schema: {
    url: { type: "string", default: "" },
    isPlaying: { type: "bool", default: false },
    isMute: { type: "bool", default: false },
    isVisible: { type: "bool", default: true },
    isLoop: { type: "bool", default: true },
    scale: { type: "number", default: 1 },
    position: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    quaternion: { type: "vec4", default: { x: 0, y: 0, z: 0, w: 1 } },
    onUserAction: { type: "bool", default: false },
    currentTimeSec: { type: "number", default: 0 },
    totalTimeSec: { type: "number", default: 0 },
  },

  // ─── Initialisation ──────────────────────────────────────────────────────────

  init() {
    this.web4ds = null;
    this.isLoaded = false;
    this.isReadyForPlayback = false;
    this.meshInitialized = false;
    this.lastFrameCheckSec = 0;
    this.isLastFrameChecked = false;
    this.isLastFrameCheckSecValid = false;
    this._lastEmitMs = 0;
    this._settingUp = false;
    this.updatedTimeEventName = "updated4dsTimeEvent";
    this.endedEventName = "player4ds-ended";

    const sceneEl = this.el.sceneEl;
    if (sceneEl.hasLoaded) {
      this.setupPlayer();
    } else {
      sceneEl.addEventListener("loaded", () => this.setupPlayer());
    }
  },

  // ─── Renderer setup ──────────────────────────────────────────────────────────

  setupPlayer() {
    if (this._settingUp) return;
    this._settingUp = true;

    const { sceneEl } = this.el;
    const cameraEl = document.querySelector("#camera");

    if (!cameraEl) {
      console.error("[player4ds] Camera element #camera not found.");
      this._settingUp = false;
      return;
    }

    const renderer = sceneEl.renderer;

    if (!renderer) {
      this._settingUp = false;
      sceneEl.addEventListener("renderstart", () => this.setupPlayer(), {
        once: true,
      });
      setTimeout(() => {
        if (!this.renderer) this.setupPlayer();
      }, 1000);
      return;
    }

    this.renderer = renderer;
    this.scene = sceneEl.object3D;
    this.camera = cameraEl.object3D;

    if (this.data.url) {
      this.load4ds();
    }
  },

  // ─── Schema updates ──────────────────────────────────────────────────────────

  update(oldData) {
    if (oldData.url !== this.data.url) {
      if (this.data.url) {
        this.load4ds();
      }
    }

    if (oldData.isPlaying !== this.data.isPlaying) {
      this.data.isPlaying ? this.play() : this.pause();
    }

    if (oldData.isVisible !== this.data.isVisible) {
      this.applyVisibility();
    }

    if (oldData.isMute !== this.data.isMute) {
      this.data.isMute ? this.mute() : this.unmute();
    }

    if (oldData.scale !== this.data.scale) {
      this.applyScale();
    }

    // A-Frame always provides freshly-created objects for vec3/vec4 schema
    // types, so !== always returns true even when the values are identical.
    // Compare individual numeric components to detect real changes.
    const posChanged =
      oldData.position?.x !== this.data.position.x ||
      oldData.position?.y !== this.data.position.y ||
      oldData.position?.z !== this.data.position.z;
    if (posChanged) {
      this.applyPosition();
    }

    const quatChanged =
      oldData.quaternion?.x !== this.data.quaternion.x ||
      oldData.quaternion?.y !== this.data.quaternion.y ||
      oldData.quaternion?.z !== this.data.quaternion.z ||
      oldData.quaternion?.w !== this.data.quaternion.w;
    if (quatChanged) {
      this.applyRotation();
    }

    if (this.data.onUserAction) {
      if (this.web4ds?.audioCtx && this.web4ds.audioCtx.state === "suspended") {
        this.web4ds.audioCtx.resume();
      }
      this.play();
      this.pause();
      this.el.setAttribute("player4ds-component", "onUserAction", false);
    }
  },

  // ─── Loading ─────────────────────────────────────────────────────────────────

  load4ds() {
    if (this.web4ds) {
      this.destroy();
    }

    if (!this.renderer) {
      this.renderer = this.el.sceneEl.renderer;
    }

    if (!this.renderer) {
      return;
    }

    this.web4ds = new WEB4DS(
      "sequence-4ds",
      this.data.url,
      [0, 0, 0],
      this.renderer,
      this.el.object3D,
      this.camera,
    );

    this.web4ds.load(false, false, () => {
      this.isLoaded = true;
      this.isReadyForPlayback = true;

      this.applyScale();
      this.applyPosition();
      this.applyRotation();
      this.applyVisibility();

      this.el.emit("player4ds-loaded");

      if (this.data.isPlaying) {
        setTimeout(() => this.play(), 100);
      }
    });
  },

  // ─── Playback controls ───────────────────────────────────────────────────────

  play() {
    if (!this.web4ds) return;

    if (this.web4ds.audioCtx?.state === "suspended") {
      this.web4ds.audioCtx.resume();
    }

    if (this.isReadyForPlayback) {
      this.web4ds.play(false);
    }
  },

  pause() {
    this.web4ds?.pause();
  },

  mute() {
    this.web4ds?.mute();
  },

  unmute() {
    this.web4ds?.unmute();
  },

  // ─── Transform helpers ───────────────────────────────────────────────────────

  applyScale() {
    const mesh = this.web4ds?.model4D?.mesh;
    if (!mesh) return;

    const s = this.data.isVisible ? this.data.scale : 0;
    mesh.scale.set(s, s, s);
  },

  applyPosition() {
    this.el.object3D.position.set(
      this.data.position.x,
      this.data.position.y,
      this.data.position.z,
    );

    const mesh = this.web4ds?.model4D?.mesh;
    if (mesh) {
      mesh.position.set(0, 0, 0);
    }
  },

  applyRotation() {
    this.el.object3D.quaternion.set(
      this.data.quaternion.x,
      this.data.quaternion.y,
      this.data.quaternion.z,
      this.data.quaternion.w,
    );

    const mesh = this.web4ds?.model4D?.mesh;
    if (mesh) {
      const baseRot = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2,
      );
      mesh.quaternion.copy(baseRot);
    }
  },

  applyVisibility() {
    this.applyScale();
  },

  // ─── Per-frame update ────────────────────────────────────────────────────────

  tick(time /* ms since scene start */, _deltaTime) {
    if (!this.web4ds) return;

    if (!this.meshInitialized && this.web4ds.model4D?.mesh) {
      this.applyScale();
      this.applyPosition();
      this.applyRotation();
      this.meshInitialized = true;
    }

    if (!this.isLoaded) return;

    if (this.web4ds.isPlaying) {
      this.web4ds.update();
    }

    if (!this.data.isLoop && this.data.isPlaying) {
      if (!this.isLastFrameCheckSecValid) {
        this.lastFrameCheckSec = this.web4ds.sequenceTotalLength * 0.9;
        this.isLastFrameCheckSecValid = true;
      }

      if (!this.isLastFrameChecked) {
        if (this.web4ds.currentFrame > this.lastFrameCheckSec) {
          this.isLastFrameChecked = true;
        }
      } else if (this.web4ds.currentFrame < 5) {
        this.pause();
        this.el.dispatchEvent(new Event(this.endedEventName));
        this.isLastFrameChecked = false;
        this.isLastFrameCheckSecValid = false;
      }
    }

    if (
      this.web4ds.sequenceTotalLength > 0 &&
      time - this._lastEmitMs >= TIME_EMIT_INTERVAL_MS
    ) {
      this._lastEmitMs = time;
      this.el.emit(this.updatedTimeEventName, {
        totalTimeSec: this.web4ds.sequenceTotalLength,
        currentTimeSec: this.web4ds.currentFrame,
      });
    }
  },

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  remove() {
    this.destroy();
  },

  destroy() {
    if (this.web4ds) {
      this.web4ds.destroy();
      this.web4ds = null;
    }
    this.isLoaded = false;
    this.isReadyForPlayback = false;
    this.meshInitialized = false;
    this.isLastFrameChecked = false;
    this.isLastFrameCheckSecValid = false;
    this._lastEmitMs = 0;
  },
});

export { player4dsComponent };
