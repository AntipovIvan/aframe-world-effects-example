import WEB4DS from "./web4dvImporter.js";
import { config } from "./config.js";

const TIME_EMIT_INTERVAL_MS = 200;

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function riseSinkEase(t, from, to) {
  return from + (to - from) * easeInOutCubic(t);
}

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
    sinkOutEnabled: { type: "bool", default: false },

    riseInIntervalMs: {
      type: "number",
      default: config.riseInOut.riseInIntervalMs,
    },
    riseInHeightM: { type: "number", default: config.riseInOut.riseInHeightM },

    sinkOutIntervalMs: {
      type: "number",
      default: config.riseInOut.sinkOutIntervalMs,
    },
    sinkOutHeightM: {
      type: "number",
      default: config.riseInOut.sinkOutHeightM,
    },

    playAfterRiseIn: {
      type: "bool",
      default: config.riseInOut.playAfterRiseIn,
    },

    replayAfterSinkOut: { type: "bool", default: false },
    replayDelayMs: { type: "number", default: 1000 },
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
    this._ended = false;
    this._replayTimeoutId = null;
    this._lastEmitMs = 0;
    this._mediaRecorderAudioConfigured = false;
    this._settingUp = false;
    this.updatedTimeEventName = "updated4dsTimeEvent";
    this.endedEventName = "player4ds-ended";

    // ── Rise/sink (ground emerge-exit) state ──────────────────────────────────
    this.riseSinkProgress = 1;
    this._riseSinkAnim = null;
    this._activeHeightM = 0; // set by playRiseIn/playSinkOut from data.riseInHeightM / sinkOutHeightM
    this._groundClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._clipApplied = false;

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

    if (!this.renderer.localClippingEnabled) {
      this.renderer.localClippingEnabled = true;
    }

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
      this.data.isPlaying ? this.startPlayback() : this.stopPlayback();
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
      this.startPlayback();
      this.stopPlayback();
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
        setTimeout(() => this.startPlayback(), 100);
      }
    });
  },

  // ─── Playback controls ───────────────────────────────────────────────────────
  startPlayback() {
    if (!this.web4ds) return;

    // New playback session — re-arm the play-once end detection.
    this._ended = false;

    if (this.web4ds.audioCtx?.state === "suspended") {
      this.web4ds.audioCtx.resume();
    }

    if (this.isReadyForPlayback) {
      this.web4ds.play(false);
      this.el.emit("player4ds-playback-started");
    }
  },

  stopPlayback() {
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
      const yOffset = -this._activeHeightM * (1 - this.riseSinkProgress);
      mesh.position.set(0, yOffset, 0);
    }

    this.applyGroundClip();
  },

  applyGroundClip() {
    const material = this.web4ds?.model4D?.material;
    if (!material) return;

    const shouldClip = this.riseSinkProgress < 1 || !!this._riseSinkAnim;

    if (shouldClip) {
      this._groundClipPlane.constant = -this.el.object3D.position.y;
      if (!this._clipApplied) {
        material.clippingPlanes = [this._groundClipPlane];
        material.clipShadows = true; // don't cast a shadow from the hidden portion
        this._clipApplied = true;
      }
    } else if (this._clipApplied) {
      material.clippingPlanes = null;
      this._clipApplied = false;
    }
  },

  // ─── Rise / sink (ground emerge-exit) ────────────────────────────────────────
  playRiseIn(onComplete) {
    const duration = Math.max(
      0.01,
      (this.data.riseInIntervalMs ?? 1000) / 1000,
    );
    this._activeHeightM = Math.abs(this.data.riseInHeightM ?? 2.0);
    this.riseSinkProgress = 0;
    this.applyScale();
    this.applyPosition();
    this._riseSinkAnim = {
      from: 0,
      to: 1,
      elapsed: 0,
      duration,
      onComplete: onComplete ?? null,
    };
  },

  playSinkOut(onComplete) {
    const duration = Math.max(
      0.01,
      (this.data.sinkOutIntervalMs ?? 1000) / 1000,
    );
    this._activeHeightM = Math.abs(this.data.sinkOutHeightM ?? 2.0);
    this._riseSinkAnim = {
      from: this.riseSinkProgress,
      to: 0,
      elapsed: 0,
      duration,
      onComplete: onComplete ?? null,
    };
  },

  // ─── Replay (replay-after-sinkout) ───────────────────────────────────────────
  scheduleReplay() {
    if (!this.data.replayAfterSinkOut) return;
    this.cancelReplay();
    const delayMs = Math.max(0, this.data.replayDelayMs ?? 1000);
    this._replayTimeoutId = setTimeout(() => {
      this._replayTimeoutId = null;
      if (!this.web4ds || !this.isReadyForPlayback) return;

      this.web4ds.currentFrame = 0;
      this.web4ds.frameOffset = 0;

      if (this.data.playAfterRiseIn) {
        this.playRiseIn(() => this.startPlayback());
      } else {
        this.playRiseIn();
        this.startPlayback();
      }
    }, delayMs);
  },

  cancelReplay() {
    if (this._replayTimeoutId !== null) {
      clearTimeout(this._replayTimeoutId);
      this._replayTimeoutId = null;
    }
  },

  _tickRiseSink(deltaSec) {
    const anim = this._riseSinkAnim;
    if (!anim) return;

    anim.elapsed += deltaSec;
    const t = Math.min(1, anim.elapsed / anim.duration);
    this.riseSinkProgress = riseSinkEase(t, anim.from, anim.to);
    this.applyScale();
    this.applyPosition();

    if (t >= 1) {
      this._riseSinkAnim = null;
      anim.onComplete?.();
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

  tick(time /* ms since scene start */, deltaTime) {
    if (!this.web4ds) return;

    if (
      !this._mediaRecorderAudioConfigured &&
      this.web4ds.gainNode &&
      window.XR8?.MediaRecorder
    ) {
      this._mediaRecorderAudioConfigured = true;
      try {
        window.XR8.MediaRecorder.configure({
          audioContext: this.web4ds.audioCtx,
          requestMic: window.XR8.MediaRecorder.RequestMicOptions.MANUAL,
          configureAudioOutput: () => {
            if (this.web4ds?.audioCtx?.state === "suspended") {
              this.web4ds.audioCtx.resume();
            }
            return this.web4ds.gainNode;
          },
        });
      } catch (err) {
        console.warn(
          "[player4ds] Could not route 4DS audio into MediaRecorder:",
          err,
        );
      }
    }

    if (!this.meshInitialized && this.web4ds.model4D?.mesh) {
      this.applyScale();
      this.applyPosition();
      this.applyRotation();
      this.meshInitialized = true;
    }

    if (this._riseSinkAnim) {
      this._tickRiseSink((deltaTime ?? 0) / 1000);
    }

    if (!this.isLoaded) return;

    if (this.web4ds.isPlaying) {
      this.web4ds.update();
    }

    if (!this.data.isLoop && this.data.isPlaying && !this._ended) {
      if (!this.isLastFrameCheckSecValid) {
        this.lastFrameCheckSec = this.web4ds.sequenceTotalLength * 0.95;
        this.isLastFrameCheckSecValid = true;
      }

      const reachedEnd =
        this.web4ds.currentFrame >= this.web4ds.sequenceTotalLength - 1;
      const wrappedAround =
        this.isLastFrameChecked && this.web4ds.currentFrame < 2;

      if (!this.isLastFrameChecked) {
        if (this.web4ds.currentFrame > this.lastFrameCheckSec) {
          this.isLastFrameChecked = true;
        }
      } else if (reachedEnd || wrappedAround) {
        this._ended = true;
        this.stopPlayback();
        this.isLastFrameChecked = false;
        this.isLastFrameCheckSecValid = false;

        if (this.data.sinkOutEnabled) {
          this.playSinkOut(() => {
            this.el.dispatchEvent(new Event(this.endedEventName));
            this.scheduleReplay();
          });
        } else {
          this.el.dispatchEvent(new Event(this.endedEventName));
          this.scheduleReplay();
        }
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
    this.cancelReplay();
    if (this.web4ds) {
      this.web4ds.destroy();
      this.web4ds = null;
    }
    this.isLoaded = false;
    this.isReadyForPlayback = false;
    this.meshInitialized = false;
    this.riseSinkProgress = 1;
    this._riseSinkAnim = null;
    this._activeHeightM = 0;
    this._clipApplied = false;
    this.isLastFrameChecked = false;
    this.isLastFrameCheckSecValid = false;
    this._ended = false;
    this._replayTimeoutId = null;
    this._lastEmitMs = 0;
    this._mediaRecorderAudioConfigured = false;
  },
});

export { player4dsComponent };
