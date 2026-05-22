// tap-place.js
// Places a single object on first tap, then supports:
//   - 1-finger drag  → move the object along the ground plane
//   - 2-finger pinch → resize the object
// Touch modes are mutually exclusive via a state machine.

const STATE = {
  IDLE: "idle", // no object placed yet
  PLACED: "placed", // object placed, no active touch
  DRAGGING: "dragging", // 1-finger move
  PINCHING: "pinching", // 2-finger resize
};

export const tapPlaceComponent = {
  schema: {
    minScale: { default: 1 },
    maxScale: { default: 50 },
    spawnScaleMin: { default: 6 },
    spawnScaleMax: { default: 10 },
  },

  init() {
    this.state = STATE.IDLE;
    this.placedEntity = null;
    this.currentScale = 1;
    this.dragTouchId = null;

    // Pinch tracking
    this.initialPinchDist = 0;
    this.initialPinchScale = 1;

    // Reusable Three.js objects (avoid per-frame allocation)
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hitPoint = new THREE.Vector3();
    this._ndc = new THREE.Vector2();

    this.prompt = document.getElementById("promptText");
    this._hint = document.getElementById("hintText");

    // Bind all handlers once
    this._onGroundClick = this._onGroundClick.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    const ground = document.getElementById("ground");
    ground.addEventListener("click", this._onGroundClick);

    // passive:false lets us call preventDefault() in touchmove
    // (critical: prevents synthetic mouse-click events during drags)
    const opts = { passive: false, capture: false };
    document.addEventListener("touchstart", this._onTouchStart, opts);
    document.addEventListener("touchmove", this._onTouchMove, opts);
    document.addEventListener("touchend", this._onTouchEnd, opts);
    document.addEventListener("touchcancel", this._onTouchEnd, opts);
  },

  // ─── Placement ──────────────────────────────────────────────────────────────

  _onGroundClick(event) {
    // Only place once; ignore if a drag/pinch gesture was in progress
    if (this.state !== STATE.IDLE) return;

    this.prompt.style.display = "none";
    if (this._hint) this._hint.style.display = "block";

    const entity = document.createElement("a-entity");
    const pt = event.detail.intersection.point;
    entity.setAttribute("position", pt);
    entity.setAttribute("rotation", `0 ${Math.random() * 360} 0`);
    entity.setAttribute("visible", "false");
    entity.setAttribute("scale", "0.0001 0.0001 0.0001");
    entity.setAttribute("shadow", { receive: false });
    entity.setAttribute("gltf-model", "#cactusModel");

    const spawnScale = this._randomBetween(
      this.data.spawnScaleMin,
      this.data.spawnScaleMax,
    );
    this.currentScale = spawnScale;

    this.el.sceneEl.appendChild(entity);
    this.placedEntity = entity;

    entity.addEventListener("model-loaded", () => {
      entity.setAttribute("visible", "true");
      entity.setAttribute("animation", {
        property: "scale",
        to: `${spawnScale} ${spawnScale} ${spawnScale}`,
        easing: "easeOutElastic",
        dur: 800,
      });
      // Transition to PLACED only after model is ready to interact with
      this.state = STATE.PLACED;
    });
  },

  // ─── Touch state machine ─────────────────────────────────────────────────────

  _onTouchStart(event) {
    if (this.state === STATE.IDLE) return; // nothing to interact with yet

    const touches = event.touches;

    if (touches.length === 2) {
      // Always win: two fingers → enter pinch regardless of previous 1-finger drag
      this.state = STATE.PINCHING;
      this.initialPinchDist = this._pinchDist(touches[0], touches[1]);
      this.initialPinchScale = this.currentScale;
      // Cancel any animation the entity might be running
      this.placedEntity.removeAttribute("animation");
    } else if (touches.length === 1 && this.state === STATE.PLACED) {
      // Fresh single touch after being in PLACED → start drag
      this.state = STATE.DRAGGING;
      this.dragTouchId = touches[0].identifier;
    }
    // Note: going from PINCHING back to 1 finger is handled in _onTouchEnd
  },

  _onTouchMove(event) {
    if (this.state === STATE.IDLE || !this.placedEntity) return;

    // Prevent default on every touchmove so the browser never fires
    // synthetic click / mousedown events that would interfere with A-Frame.
    event.preventDefault();

    const touches = event.touches;

    if (this.state === STATE.DRAGGING && touches.length === 1) {
      const t = touches[0];
      const pos = this._screenToGround(t.clientX, t.clientY);
      if (pos) {
        // Use object3D directly — avoids string parsing overhead of setAttribute
        this.placedEntity.object3D.position.copy(pos);
      }
    } else if (this.state === STATE.PINCHING && touches.length >= 2) {
      const dist = this._pinchDist(touches[0], touches[1]);
      const ratio = dist / this.initialPinchDist;
      const scaled = this.initialPinchScale * ratio;
      const clamped = Math.max(
        this.data.minScale,
        Math.min(this.data.maxScale, scaled),
      );
      this.currentScale = clamped;
      this.placedEntity.object3D.scale.setScalar(clamped);
    }
  },

  _onTouchEnd(event) {
    if (this.state === STATE.IDLE) return;

    const count = event.touches.length;

    if (count === 0) {
      // All fingers up → idle placement state, ready for new gesture
      this.state = STATE.PLACED;
      this.dragTouchId = null;
    } else if (count === 1 && this.state === STATE.PINCHING) {
      // One finger released during pinch → do NOT auto-enter drag.
      // Return to PLACED so the user must consciously start a new drag gesture.
      // This prevents the object from snapping/jumping when releasing a pinch.
      this.state = STATE.PLACED;
    }
  },

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Cast a ray from the camera through (clientX, clientY) and intersect with
   * the tracking ground plane (y = 0). Returns a THREE.Vector3 or null.
   */
  _screenToGround(clientX, clientY) {
    const camera = this.el.sceneEl.camera;
    const canvas = this.el.sceneEl.canvas;
    const rect = canvas.getBoundingClientRect();

    // Normalised device coordinates
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

  _randomBetween(min, max) {
    return Math.floor(
      Math.random() * (Math.floor(max) - Math.ceil(min)) + Math.ceil(min),
    );
  },

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  remove() {
    document.removeEventListener("touchstart", this._onTouchStart);
    document.removeEventListener("touchmove", this._onTouchMove);
    document.removeEventListener("touchend", this._onTouchEnd);
    document.removeEventListener("touchcancel", this._onTouchEnd);

    const ground = document.getElementById("ground");
    if (ground) ground.removeEventListener("click", this._onGroundClick);
  },
};
