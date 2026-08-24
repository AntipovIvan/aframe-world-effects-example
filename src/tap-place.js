import { urlParams } from "./lib/url-params.js";
import { config } from "./lib/config.js";
import {
  showCaptureButtonUI,
  stopRecordingAndHideCaptureButton,
  isRecordEnabled,
} from "./lib/capture.js";

function resolveToggle(urlValue, configDefault) {
  return urlValue !== null && urlValue !== undefined ? urlValue : configDefault;
}

function resolveNumber(urlValue, configDefault) {
  return urlValue !== null && urlValue !== undefined ? urlValue : configDefault;
}

// ─── State machine ────────────────────────────────────────────────────────────

const STATE = {
  IDLE: "idle", // waiting for first tap
  LOADING: "loading", // 4DS loading, no gestures yet
  PLACED: "placed", // model live, no active touch
  DRAGGING: "dragging", // 1-finger move
  PINCHING: "pinching", // 2-finger gesture (scale and/or rotate)
};

// ─── Component ────────────────────────────────────────────────────────────────

export const tapPlaceComponent = {
  schema: {
    offsetFront: { type: "number", default: config.model4D.offset.front },
    offsetHeight: { type: "number", default: config.model4D.offset.height },
    offsetSide: { type: "number", default: config.model4D.offset.side },
    offsetRotationY: {
      type: "number",
      default: config.model4D.offset.rotationY,
    },
    baseScale: { type: "number", default: config.model4D.offset.baseScale },
    detectionScale: {
      type: "number",
      default: config.object.defaultScale ?? 1.0,
    },
  },

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init() {
    this.state = STATE.IDLE;
    this.currentScale = 1;
    this.dragTouchId = null;
    this._dragOffset = new THREE.Vector3();
    this.pinchTouchIds = null;
    this.initialPinchDist = 0;
    this.initialPinchScale = 1;
    this.initialPinchAngle = 0;
    this.initialQuaternion = null;

    this._placedCamPos = null;
    this._placedTouchPoint = null;
    this._placedScale = 1;

    this._enableAlwaysTapPlace = resolveToggle(
      urlParams.enableAlwaysTapPlace,
      config.object.enableAlwaysTapPlace,
    );
    this._enableRecord = isRecordEnabled();
    this._enablePinchScale = resolveToggle(
      urlParams.enablePinchScale,
      config.object.enablePinchScale,
    );
    this._enableSwipeRotation = resolveToggle(
      urlParams.enableSwipeRotation,
      config.object.enableSwipeRotation,
    );

    // Reusable Three.js objects
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hitPoint = new THREE.Vector3();
    this._ndc = new THREE.Vector2();

    // ── UI element references ────────────────────────────────────────────────
    this.tapPrompt = document.getElementById("tap-prompt");
    this.hint = document.getElementById("hintText");
    this.loadingOverlay = document.getElementById("loading-overlay");
    this.endOverlay = document.getElementById("end-overlay");

    // Bind handlers once
    this._onGroundClick = this._onGroundClick.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    const attachGround = () => {
      const ground = document.getElementById("ground");
      if (ground) {
        ground.addEventListener("click", this._onGroundClick);
      } else {
        console.error("[tap-place] #ground entity not found.");
      }
    };

    if (this.el.sceneEl.hasLoaded) {
      attachGround();
    } else {
      this.el.sceneEl.addEventListener("loaded", attachGround, { once: true });
    }

    // passive:false so touchmove can call preventDefault()
    const opts = { passive: false };
    document.addEventListener("touchstart", this._onTouchStart, opts);
    document.addEventListener("touchmove", this._onTouchMove, opts);
    document.addEventListener("touchend", this._onTouchEnd, opts);
    document.addEventListener("touchcancel", this._onTouchEnd, opts);
  },

  // ─── UI state helpers ────────────────────────────────────────────────────────

  _enterLoading() {
    this.state = STATE.LOADING;
    if (this.tapPrompt) this.tapPrompt.classList.add("hidden");
    if (this.loadingOverlay) this.loadingOverlay.style.display = "flex";
  },

  _enterPlaced() {
    this.state = STATE.PLACED;
    if (this.loadingOverlay) this.loadingOverlay.style.display = "none";
    if (this.hint) {
      // Don't tell the user to drag the model if enable-always-tap-place
      // has turned that off.
      this.hint.innerHTML = this._enableAlwaysTapPlace
        ? "ドラッグして移動 &nbsp;&middot;&nbsp; ピンチしてサイズ変更"
        : "ピンチしてサイズ変更";
      this.hint.style.display = "block";
    }
  },

  // ─── End-screen overlay (Link feature: enable-link / link-url / link-image) ──

  _showEndOverlay() {
    if (this.hint) this.hint.style.display = "none";

    const overlay = this.endOverlay;
    if (!overlay) return;

    const img = document.getElementById("end-cta-image");
    const link = document.getElementById("end-cta-link");
    const hintEl = document.getElementById("end-cta-hint");

    // Populate image
    if (img && urlParams.linkImage) {
      img.src = urlParams.linkImage;
      img.alt = urlParams.linkUrl ? "もっと見る" : "";
    }

    // Wire up (or disable) the link
    if (link) {
      if (urlParams.linkUrl) {
        link.href = urlParams.linkUrl;
        link.classList.remove("no-url");
      } else {
        link.removeAttribute("href");
        link.classList.add("no-url");
        // Hide the "tap to open" hint when there's no destination URL
        if (hintEl) hintEl.style.display = "none";
      }
    }

    overlay.style.display = "flex";
  },

  // ─── Placement transform ─────────────────────────────────────────────────────

  _computeTransform(touchPoint) {
    const cam = this.el.sceneEl.camera.el;
    const camPos = new THREE.Vector3();
    cam.object3D.getWorldPosition(camPos);

    const front = new THREE.Vector3()
      .copy(camPos)
      .sub(touchPoint)
      .setY(0)
      .normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(front).normalize();

    // default-scale (URL) overrides the detectionScale schema default.
    const det = resolveNumber(urlParams.defaultScale, this.data.detectionScale);
    const scale = det * this.data.baseScale;

    const modelPos = new THREE.Vector3()
      .copy(touchPoint)
      .addScaledVector(front, this.data.offsetFront * det)
      .addScaledVector(right, this.data.offsetSide * det)
      .addScaledVector(
        new THREE.Vector3(0, 1, 0),
        this.data.offsetHeight * det,
      );

    const lookMat = new THREE.Matrix4()
      .lookAt(
        new THREE.Vector3(),
        new THREE.Vector3().copy(front).multiplyScalar(-1),
        new THREE.Vector3(0, 1, 0),
      )
      .multiply(
        new THREE.Matrix4().makeRotationY(
          THREE.MathUtils.degToRad(this.data.offsetRotationY),
        ),
      );
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(lookMat);

    return { camPos, modelPos, quaternion, scale };
  },

  // ─── Ground tap → spawn 4DS, or (enable-always-tap-place) reposition ────────

  _onGroundClick(event) {
    // Re-tap to move: only once the object is already placed & idle.
    if (this.state === STATE.PLACED) {
      if (this._enableAlwaysTapPlace) {
        this._repositionAt(event.detail.intersection.point);
      }
      return;
    }

    if (this.state !== STATE.IDLE) return;

    if (!urlParams.vvdata) {
      console.warn(
        "[tap-place] 'vvdata' URL param missing — cannot spawn 4DS.",
      );
      return;
    }

    this._enterLoading();

    // ── Compute placement transform ───────────────────────────────────────────

    const touchPoint = event.detail.intersection.point;
    const { camPos, modelPos, quaternion, scale } =
      this._computeTransform(touchPoint);
    this.currentScale = scale;
    this._followLight(modelPos.x, modelPos.z);
    this._positionShadowGround(modelPos.y);
    this._placedTouchPoint = touchPoint.clone();
    this._placedCamPos = camPos.clone();
    this._placedScale = scale;

    // ── Set up 4DS player ────────────────────────────────────────────────────

    const player = document.getElementById("player4ds-panel");
    if (!player) {
      console.error("[tap-place] #player4ds-panel not found in DOM.");
      this.state = STATE.IDLE;
      if (this.tapPrompt) this.tapPrompt.classList.remove("hidden");
      if (this.loadingOverlay) this.loadingOverlay.style.display = "none";
      return;
    }

    // Link feature — show the end overlay only if enabled AND content given.
    const linkContentProvided = !!(urlParams.linkImage || urlParams.linkUrl);
    const enableLink = resolveToggle(urlParams.enableLink, linkContentProvided);
    const showLinkOverlay = enableLink && linkContentProvided;

    // Ground emerge/exit toggles — per-link URL param overrides config.js.
    const riseInEnabled = resolveToggle(
      urlParams.enableRiseIn,
      config.riseInOut.riseIn,
    );
    const sinkOutEnabled = resolveToggle(
      urlParams.enableSinkOut,
      config.riseInOut.sinkOut,
    );
    const playAfterRiseIn = resolveToggle(
      urlParams.playAfterRiseIn,
      config.riseInOut.playAfterRiseIn,
    );
    const riseInIntervalMs = resolveNumber(
      urlParams.riseInIntervalMs,
      config.riseInOut.riseInIntervalMs,
    );
    const riseInHeightM = resolveNumber(
      urlParams.riseInHeightM,
      config.riseInOut.riseInHeightM,
    );
    const sinkOutIntervalMs = resolveNumber(
      urlParams.sinkOutIntervalMs,
      config.riseInOut.sinkOutIntervalMs,
    );
    const sinkOutHeightM = resolveNumber(
      urlParams.sinkOutHeightM,
      config.riseInOut.sinkOutHeightM,
    );
    this._riseInEnabled = riseInEnabled;

    const playOnce = showLinkOverlay || sinkOutEnabled;

    // Step 1 — set url + transform + loop mode + rise/sink config (triggers load4ds())
    player.setAttribute("player4ds-component", {
      url: urlParams.vvdata,
      isPlaying: false,
      isVisible: false,
      isLoop: !playOnce,
      scale: scale,
      position: { x: modelPos.x, y: modelPos.y, z: modelPos.z },
      quaternion: {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      },
      sinkOutEnabled: sinkOutEnabled,
      riseInIntervalMs: riseInIntervalMs,
      riseInHeightM: riseInHeightM,
      sinkOutIntervalMs: sinkOutIntervalMs,
      sinkOutHeightM: sinkOutHeightM,
    });

    // Step 2 — unlock AudioContext while still inside the user-gesture window.
    player.setAttribute("player4ds-component", "onUserAction", true);

    // Step 3 — belt-and-suspenders: resume directly in case constructor defers.
    const comp = player.components?.["player4ds-component"];
    if (comp?.web4ds?.audioCtx?.state === "suspended") {
      comp.web4ds.audioCtx.resume().catch(() => {});
    }

    // ── Start playback + show hider wall once 4DS is ready ────────────────────

    player.addEventListener(
      "player4ds-loaded",
      () => {
        const comp = player.components?.["player4ds-component"];
        player.setAttribute("player4ds-component", "isVisible", true);

        const startPlayback = () => {
          player.setAttribute("player4ds-component", "isPlaying", true);

          // Resume audio one more time in case it was still suspended
          const c = player.components?.["player4ds-component"];
          if (c?.web4ds?.audioCtx?.state === "suspended") {
            c.web4ds.audioCtx.resume().catch(() => {});
          }
        };

        if (riseInEnabled && comp) {
          if (playAfterRiseIn) {
            comp.playRiseIn(() => startPlayback());
          } else {
            comp.playRiseIn();
            startPlayback();
          }
        } else {
          startPlayback();
        }
        if (this._enableRecord) showCaptureButtonUI();
        player.addEventListener(
          "player4ds-ended",
          () => stopRecordingAndHideCaptureButton(),
          { once: true },
        );

        this._positionHiderWall(
          this._placedTouchPoint,
          this._placedCamPos,
          this._placedScale,
        );
        if (showLinkOverlay) {
          player.addEventListener(
            "player4ds-ended",
            () => this._showEndOverlay(),
            { once: true },
          );
        }

        this._enterPlaced();
      },
      { once: true },
    );
  },

  // ─── Re-placement (enable-always-tap-place) ──────────────────────────────────
  _repositionAt(touchPoint) {
    const player = document.getElementById("player4ds-panel");
    if (!player) return;

    const { camPos, modelPos, quaternion, scale } =
      this._computeTransform(touchPoint);
    this.currentScale = scale;

    player.setAttribute("player4ds-component", {
      position: { x: modelPos.x, y: modelPos.y, z: modelPos.z },
      quaternion: {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      },
      scale: scale,
    });

    this._positionHiderWall(touchPoint, camPos, scale);
    this._followLight(modelPos.x, modelPos.z);
    this._positionShadowGround(modelPos.y);
  },

  // ─── Hider wall helper ─────────────────────────────────────────────────────

  _positionHiderWall(touchPoint, camPos, scale) {
    if (!config.hidewall?.enabled) return;

    const hider = document.getElementById("hidewall-panel");
    if (!hider) return;

    hider.setAttribute("visible", "true");
    if (!hider.getAttribute("my-hider-material")) {
      hider.setAttribute("my-hider-material", "");
    }
    hider.object3D.position.copy(touchPoint);
    hider.object3D.lookAt(camPos.x, touchPoint.y, camPos.z);
    hider.object3D.scale.setScalar(scale);
  },

  // ─── Shadow light helper ────────────────────────────────────────────────────
  _followLight(x, z) {
    const lightEl = document.querySelector("[scene-lighting-component]");
    lightEl?.components["scene-lighting-component"]?.followPosition(x, z);
  },

  // ─── Shadow receiver helper ──────────────────────────────────────────────
  _positionShadowGround(topY) {
    const ground = document.getElementById("ground");
    if (!ground || !ground.object3D) return;
    ground.object3D.position.y = topY - 1;
  },

  // ─── Touch state machine ──────────────────────────────────────────────────
  _beginDrag(touch) {
    this.state = STATE.DRAGGING;
    this.dragTouchId = touch.identifier;
    this._dragOffset.set(0, 0, 0);

    const player = document.getElementById("player4ds-panel");
    if (!player) return;

    const ground = this._screenToGround(touch.clientX, touch.clientY);
    if (ground) {
      this._dragOffset.set(
        player.object3D.position.x - ground.x,
        0,
        player.object3D.position.z - ground.z,
      );
    }
  },

  _onTouchStart(event) {
    if (this.state === STATE.IDLE || this.state === STATE.LOADING) return;

    const touches = event.touches;
    const twoFingerGestureEnabled =
      this._enablePinchScale || this._enableSwipeRotation;

    if (touches.length >= 2 && twoFingerGestureEnabled) {
      if (!this.pinchTouchIds) {
        this.pinchTouchIds = [touches[0].identifier, touches[1].identifier];
      }
      this._rebaselinePinch(touches);
    } else if (
      touches.length === 1 &&
      this.state === STATE.PLACED &&
      this._enableAlwaysTapPlace
    ) {
      this._beginDrag(touches[0]);
    }
  },

  _rebaselinePinch(touches) {
    const [t1, t2] = this._pinnedTouches(touches);
    if (!t1 || !t2) return;

    this.state = STATE.PINCHING;
    this.initialPinchDist = this._pinchDist(t1, t2);
    this.initialPinchScale = this.currentScale;
    this.initialPinchAngle = this._pinchAngle(t1, t2);

    const player = document.getElementById("player4ds-panel");
    this.initialQuaternion = player
      ? player.object3D.quaternion.clone()
      : new THREE.Quaternion();

    player?.removeAttribute("animation");
  },

  _pinnedTouches(touches) {
    if (!this.pinchTouchIds) return [null, null];
    const [idA, idB] = this.pinchTouchIds;
    let t1 = null;
    let t2 = null;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === idA) t1 = touches[i];
      else if (touches[i].identifier === idB) t2 = touches[i];
    }
    return [t1, t2];
  },

  _onTouchMove(event) {
    if (this.state === STATE.IDLE || this.state === STATE.LOADING) return;

    event.preventDefault();

    const touches = event.touches;
    const player = document.getElementById("player4ds-panel");
    if (!player) return;

    if (this.state === STATE.DRAGGING && touches.length === 1) {
      const pos = this._screenToGround(touches[0].clientX, touches[0].clientY);
      if (pos) {
        const x = pos.x + this._dragOffset.x;
        const z = pos.z + this._dragOffset.z;
        player.object3D.position.x = x;
        player.object3D.position.z = z;

        const hider = document.getElementById("hidewall-panel");
        if (hider && hider.getAttribute("visible") !== "false") {
          const cam = this.el.sceneEl.camera.el;
          const camPos = new THREE.Vector3();
          cam.object3D.getWorldPosition(camPos);
          hider.object3D.position.x = x;
          hider.object3D.position.z = z;
          hider.object3D.lookAt(camPos.x, hider.object3D.position.y, camPos.z);
        }

        this._followLight(x, z);
      }
    } else if (this.state === STATE.PINCHING && touches.length >= 2) {
      let [t1, t2] = this._pinnedTouches(touches);
      if (!t1 || !t2) {
        this.pinchTouchIds = [touches[0].identifier, touches[1].identifier];
        this._rebaselinePinch(touches);
        [t1, t2] = this._pinnedTouches(touches);
        if (!t1 || !t2) return;
      }

      // Pinch → scale (enable-pinch-scale)
      if (this._enablePinchScale) {
        const dist = this._pinchDist(t1, t2);
        const ratio = dist / this.initialPinchDist;
        const min = config.model4D.tapScaleMin ?? 0.05;
        const max = config.model4D.tapScaleMax ?? 10;
        const clamped = Math.max(
          min,
          Math.min(max, this.initialPinchScale * ratio),
        );
        this.currentScale = clamped;

        player.setAttribute("player4ds-component", "scale", clamped);

        const hider = document.getElementById("hidewall-panel");
        if (hider) hider.object3D.scale.setScalar(clamped);
      }

      // Two-finger twist → rotate (enable-swipe-rotation)
      if (this._enableSwipeRotation) {
        const angle = this._pinchAngle(t1, t2);
        const deltaRad = -(angle - this.initialPinchAngle); // natural twist direction
        const twist = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          deltaRad,
        );
        const q = this.initialQuaternion.clone().multiply(twist);
        player.object3D.quaternion.copy(q);
      }
    }
  },

  _onTouchEnd(event) {
    if (this.state === STATE.IDLE || this.state === STATE.LOADING) return;

    const touches = event.touches;
    const count = touches.length;
    const player = document.getElementById("player4ds-panel");

    if (count === 0) {
      if (player && this.state === STATE.DRAGGING) {
        const p = player.object3D.position;
        player.setAttribute("player4ds-component", "position", {
          x: p.x,
          y: p.y,
          z: p.z,
        });
      }
      if (
        player &&
        this.state === STATE.PINCHING &&
        this._enableSwipeRotation
      ) {
        const q = player.object3D.quaternion;
        player.setAttribute("player4ds-component", "quaternion", {
          x: q.x,
          y: q.y,
          z: q.z,
          w: q.w,
        });
      }

      this.state = STATE.PLACED;
      this.dragTouchId = null;
      this.pinchTouchIds = null;
    } else if (count === 1 && this.state === STATE.PINCHING) {
      if (player && this._enableSwipeRotation) {
        const q = player.object3D.quaternion;
        player.setAttribute("player4ds-component", "quaternion", {
          x: q.x,
          y: q.y,
          z: q.z,
          w: q.w,
        });
      }

      this.pinchTouchIds = null;

      if (this._enableAlwaysTapPlace) {
        this._beginDrag(touches[0]);
      } else {
        this.state = STATE.PLACED;
        this.dragTouchId = null;
      }
    } else if (count >= 2 && this.state === STATE.PINCHING) {
      const [t1, t2] = this._pinnedTouches(touches);
      if (!t1 || !t2) {
        this.pinchTouchIds = [touches[0].identifier, touches[1].identifier];
        this._rebaselinePinch(touches);
      }
    }
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _screenToGround(clientX, clientY) {
    const camera = this.el.sceneEl.camera;
    const canvas = this.el.sceneEl.canvas;
    const rect = canvas.getBoundingClientRect();

    this._ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      ((clientY - rect.top) / rect.height) * -2 + 1,
    );

    this._raycaster.setFromCamera(this._ndc, camera);
    const hit = this._raycaster.ray.intersectPlane(
      this._groundPlane,
      this._hitPoint,
    );
    return hit ? this._hitPoint.clone() : null;
  },

  _pinchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  _pinchAngle(t1, t2) {
    return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
  },

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  remove() {
    const ground = document.getElementById("ground");
    if (ground) ground.removeEventListener("click", this._onGroundClick);

    document.removeEventListener("touchstart", this._onTouchStart);
    document.removeEventListener("touchmove", this._onTouchMove);
    document.removeEventListener("touchend", this._onTouchEnd);
    document.removeEventListener("touchcancel", this._onTouchEnd);
  },
};
