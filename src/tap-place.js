import { urlParams } from "./lib/url-params.js";
import { config } from "./lib/config.js";

// ─── State machine ────────────────────────────────────────────────────────────

const STATE = {
  IDLE: "idle", // waiting for first tap
  LOADING: "loading", // 4DS loading, no gestures yet
  PLACED: "placed", // model live, no active touch
  DRAGGING: "dragging", // 1-finger move
  PINCHING: "pinching", // 2-finger resize
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
    // Replaces the image-target physical size (metres). Tune until model looks right.
    detectionScale: {
      type: "number",
      default: config.model4D.tapDetectionScale ?? 1.0,
    },
  },

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init() {
    this.state = STATE.IDLE;
    this.currentScale = 1;
    this.dragTouchId = null;

    // Pinch state
    this.initialPinchDist = 0;
    this.initialPinchScale = 1;

    // Saved at tap time, reused in the player4ds-loaded callback
    this._placedCamPos = null;
    this._placedTouchPoint = null;
    this._placedScale = 1;

    // Reusable Three.js objects
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hitPoint = new THREE.Vector3();
    this._ndc = new THREE.Vector2();

    this.prompt = document.getElementById("promptText");
    this.hint = document.getElementById("hintText");

    // Bind handlers once
    this._onGroundClick = this._onGroundClick.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    // Ground is created by scene-lighting-component → wait for scene load
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

    // passive:false so touchmove can call preventDefault(), preventing
    // the browser from synthesising a second mouse-click after a drag.
    const opts = { passive: false };
    document.addEventListener("touchstart", this._onTouchStart, opts);
    document.addEventListener("touchmove", this._onTouchMove, opts);
    document.addEventListener("touchend", this._onTouchEnd, opts);
    document.addEventListener("touchcancel", this._onTouchEnd, opts);
  },

  // ─── Ground tap → spawn 4DS ───────────────────────────────────────────────

  _onGroundClick(event) {
    if (this.state !== STATE.IDLE) return;

    if (!urlParams.vvdata) {
      console.warn(
        "[tap-place] 'vvdata' URL param missing — cannot spawn 4DS.",
      );
      return;
    }

    this.state = STATE.LOADING;
    if (this.prompt) this.prompt.style.display = "none";

    // ── Compute placement transform ───────────────────────────────────────────

    const touchPoint = event.detail.intersection.point;
    const cam = this.el.sceneEl.camera.el;
    const camPos = new THREE.Vector3();
    cam.object3D.getWorldPosition(camPos);

    const front = new THREE.Vector3()
      .copy(camPos)
      .sub(touchPoint)
      .setY(0)
      .normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(front).normalize();

    const det = this.data.detectionScale;
    const scale = det * this.data.baseScale;
    this.currentScale = scale;

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

    // Save for use inside the async player4ds-loaded callback
    this._placedTouchPoint = touchPoint.clone();
    this._placedCamPos = camPos.clone();
    this._placedScale = scale;

    // ── Set up 4DS player ────────────────────────────────────────────────────

    const player = document.getElementById("player4ds-panel");
    if (!player) {
      console.error("[tap-place] #player4ds-panel not found in DOM.");
      this.state = STATE.IDLE;
      return;
    }

    // Step 1 — set url + transform (triggers load4ds() → new WEB4DS() → AudioContext created)
    player.setAttribute("player4ds-component", {
      url: urlParams.vvdata,
      isPlaying: false,
      isVisible: false,
      scale: scale,
      position: { x: modelPos.x, y: modelPos.y, z: modelPos.z },
      quaternion: {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      },
    });

    // Step 2 — unlock AudioContext while still inside the user-gesture window.
    // onUserAction calls audioCtx.resume() synchronously in update().
    // WEB4DS creates its AudioContext in its constructor (called in step 1 above),
    // so it exists here and can be resumed before the gesture window closes.
    player.setAttribute("player4ds-component", "onUserAction", true);

    // Step 3 — belt-and-suspenders: also resume directly in case the constructor
    // defers AudioContext creation.
    const comp = player.components?.["player4ds-component"];
    if (comp?.web4ds?.audioCtx?.state === "suspended") {
      comp.web4ds.audioCtx.resume().catch(() => {});
    }

    // ── Start playback + show hider wall once 4DS is ready ────────────────────

    player.addEventListener(
      "player4ds-loaded",
      () => {
        console.log("[tap-place] player4ds-loaded — starting playback.");

        // Make the 4DS visible and start animation
        player.setAttribute("player4ds-component", {
          isPlaying: true,
          isVisible: true,
        });

        // Resume audio one more time in case it was still suspended
        const c = player.components?.["player4ds-component"];
        if (c?.web4ds?.audioCtx?.state === "suspended") {
          c.web4ds.audioCtx.resume().catch(() => {});
        }

        // Hider wall — placed AFTER first play call so the depth mask never
        // occludes the model before any frames have been decoded.
        this._positionHiderWall(
          this._placedTouchPoint,
          this._placedCamPos,
          this._placedScale,
        );

        this.state = STATE.PLACED;
        if (this.hint) this.hint.style.display = "block";
      },
      { once: true },
    );
  },

  // ─── Hider wall helper ─────────────────────────────────────────────────────

  _positionHiderWall(touchPoint, camPos, scale) {
    // ── Toggle point ── flip config.hidewall.enabled in config.js to show/hide
    if (!config.hidewall?.enabled) return;

    const hider = document.getElementById("hidewall-panel");
    if (!hider) return;

    hider.setAttribute("visible", "true");
    // Apply the depth-mask material if not already applied
    if (!hider.getAttribute("my-hider-material")) {
      hider.setAttribute("my-hider-material", "");
    }
    hider.object3D.position.copy(touchPoint);
    hider.object3D.lookAt(camPos.x, touchPoint.y, camPos.z);
    hider.object3D.scale.setScalar(scale);
  },

  // ─── Touch state machine ──────────────────────────────────────────────────

  _onTouchStart(event) {
    if (this.state === STATE.IDLE || this.state === STATE.LOADING) return;

    const touches = event.touches;

    if (touches.length >= 2) {
      this.state = STATE.PINCHING;
      this.initialPinchDist = this._pinchDist(touches[0], touches[1]);
      this.initialPinchScale = this.currentScale;
      document.getElementById("player4ds-panel")?.removeAttribute("animation");
    } else if (touches.length === 1 && this.state === STATE.PLACED) {
      this.state = STATE.DRAGGING;
      this.dragTouchId = touches[0].identifier;
    }
  },

  _onTouchMove(event) {
    if (this.state === STATE.IDLE || this.state === STATE.LOADING) return;

    // Block synthetic mouse/click events from firing after a drag
    event.preventDefault();

    const touches = event.touches;
    const player = document.getElementById("player4ds-panel");
    if (!player) return;

    if (this.state === STATE.DRAGGING && touches.length === 1) {
      const pos = this._screenToGround(touches[0].clientX, touches[0].clientY);
      if (pos) {
        // Move entity container directly (no string parsing overhead)
        player.object3D.position.x = pos.x;
        player.object3D.position.z = pos.z;

        // Keep hider wall in sync
        const hider = document.getElementById("hidewall-panel");
        if (hider && hider.getAttribute("visible") !== "false") {
          const cam = this.el.sceneEl.camera.el;
          const camPos = new THREE.Vector3();
          cam.object3D.getWorldPosition(camPos);
          hider.object3D.position.x = pos.x;
          hider.object3D.position.z = pos.z;
          hider.object3D.lookAt(camPos.x, hider.object3D.position.y, camPos.z);
        }
      }
    } else if (this.state === STATE.PINCHING && touches.length >= 2) {
      const dist = this._pinchDist(touches[0], touches[1]);
      const ratio = dist / this.initialPinchDist;
      const min = config.model4D.tapScaleMin ?? 0.05;
      const max = config.model4D.tapScaleMax ?? 10;
      const clamped = Math.max(
        min,
        Math.min(max, this.initialPinchScale * ratio),
      );
      this.currentScale = clamped;

      // Via component so internal applyScale() keeps mesh in sync
      player.setAttribute("player4ds-component", "scale", clamped);

      const hider = document.getElementById("hidewall-panel");
      if (hider) hider.object3D.scale.setScalar(clamped);
    }
  },

  _onTouchEnd(event) {
    if (this.state === STATE.IDLE || this.state === STATE.LOADING) return;

    const count = event.touches.length;

    if (count === 0) {
      this.state = STATE.PLACED;
      this.dragTouchId = null;
    } else if (count === 1 && this.state === STATE.PINCHING) {
      // Don't auto-enter DRAGGING — avoids position jump when releasing a pinch
      this.state = STATE.PLACED;
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
