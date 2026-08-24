import { config } from "./config.js";
import { urlParams } from "./url-params.js";

// ─── Capture button visibility ────────────────────────────────────────────────
let desiredCaptureButtonVisible = false;
let recorderObserverInstalled = false;

function applyRecorderVisibility() {
  const recorder = document.getElementById("recorder");
  const previewContainer = document.getElementById("previewContainer");

  if (recorder) {
    const wantDisplay = desiredCaptureButtonVisible ? "" : "none";
    if (
      recorder.style.display !== wantDisplay ||
      recorder.style.zIndex !== "10500001"
    ) {
      recorder.style.zIndex = "10500001"; // above #captureButtonWrap's 10500000
      recorder.style.display = wantDisplay;
      recorder.style.pointerEvents = desiredCaptureButtonVisible ? "" : "none";
    }
  }

  if (previewContainer) {
    if (previewContainer.style.zIndex !== "10500001") {
      previewContainer.style.zIndex = "10500001";
    }
  }
}

function installRecorderObserver() {
  if (recorderObserverInstalled) return;
  recorderObserverInstalled = true;
  applyRecorderVisibility(); // in case #recorder already exists

  const observer = new MutationObserver(applyRecorderVisibility);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
}

installRecorderObserver();
applyRecorderVisibility();

export function showCaptureButtonUI() {
  const wrap = document.getElementById("captureButtonWrap");
  if (wrap) wrap.removeAttribute("hidden");
  desiredCaptureButtonVisible = true;
  installRecorderObserver();
  applyRecorderVisibility();
}

export function hideCaptureButtonUI() {
  const wrap = document.getElementById("captureButtonWrap");
  if (wrap) wrap.setAttribute("hidden", "");
  desiredCaptureButtonVisible = false;
  installRecorderObserver();
  applyRecorderVisibility();
}

// ─── Record lifecycle ─────────────────────────────────────────────────────────
let captureAutoStopPending = false;
let captureRecordSettled = true;
let capturePreviewSettled = true;

function settleCaptureAutoStop() {
  if (!captureAutoStopPending) return;
  if (!captureRecordSettled || !capturePreviewSettled) return;
  captureAutoStopPending = false;
  hideCaptureButtonUI();
}

window.addEventListener("mediarecorder-recordstart", () => {
  captureRecordSettled = false;
  capturePreviewSettled = false;
});
window.addEventListener("mediarecorder-recordcomplete", () => {
  captureRecordSettled = true;
  settleCaptureAutoStop();
});
window.addEventListener("mediarecorder-recorderror", () => {
  // Don't leave the button stuck waiting forever if something failed.
  captureRecordSettled = true;
  capturePreviewSettled = true;
  settleCaptureAutoStop();
});
window.addEventListener("mediarecorder-previewopened", () => {
  capturePreviewSettled = false;
});
window.addEventListener("mediarecorder-previewclosed", () => {
  capturePreviewSettled = true;
  settleCaptureAutoStop();
});

function forceStopActiveRecording() {
  const recorder = document.getElementById("recorder");
  const button = document.getElementById("recorder-button");
  if (!recorder || !button) return false;
  if (!recorder.classList.contains("recording")) return false;

  button.dispatchEvent(
    new Event("mousedown", { bubbles: true, cancelable: true }),
  );
  // xrextras resets its internal isDown flag on a window-level mouseup.
  window.dispatchEvent(new Event("mouseup"));
  return true;
}

export function stopRecordingAndHideCaptureButton() {
  forceStopActiveRecording();

  if (!captureRecordSettled || !capturePreviewSettled) {
    captureAutoStopPending = true;
    return;
  }

  hideCaptureButtonUI();
}

export function isRecordEnabled() {
  return urlParams.enableRecord !== null && urlParams.enableRecord !== undefined
    ? urlParams.enableRecord
    : config.record.enableRecord;
}
