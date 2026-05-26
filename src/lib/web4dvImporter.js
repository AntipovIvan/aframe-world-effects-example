import { ResourceManagerXHR } from "./web4dvResource.js";
import { DeviceUtils } from "./deviceUtils.js";
import EnhancedModel4D from "./enhanced_model4d.js";

export default class WEB4DS {
  constructor(id, url, position, renderer, scene, camera) {
    this.id = id;
    this.url = url;
    this.position = position;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.resourceManager = new ResourceManagerXHR();
    this.decoder4D = this.resourceManager.decoder4D;

    this.model4D = new EnhancedModel4D();
    this.sequenceTotalLength = 0;
    this.sequenceDecodedFrames = 0;

    this.showPlaceholder = false;
    this.playOnload = true;

    this.isLoaded = false;
    this.isPlaying = false;
    this.isAudioloaded = false;
    this.isAudioplaying = false;
    this.wasPlaying = true;
    this.isDecoding = false;
    this.isMuted = false;
    this.playbackRate = 1.0;
    this.isReadyForPlayback = false;

    this.currentMesh = null;
    this.currentFrame = null;
    this.isSeeking = false;
    this.lastFrameTime = 0;
    this.accumulatedTime = 0;
    this.audioListener = null;
    this.audioSound = null;
    this.audioLoader = null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContext();
    this.gainNode = null;
    this.audioStartOffset = 0;
    this.audioStartTime = 0;
    this.audioPassedTime = 0;
    this.audioTrack = null;
    this.audioLevel = null;

    this.playbackLoop = null;
    this.decodeLoop = null;
    this.frameOffset = 0;
    this.lastVisibleTime = Date.now();
    this.setupVisibilityHandling();
  }

  setupVisibilityHandling() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.lastVisibleTime = Date.now();
        if (this.isPlaying) {
          this.wasPlayingBeforeHidden = true;
        }
      } else {
        if (this.isPlaying) {
          this.resetTiming();
        }
      }
    });
  }

  resetTiming() {
    this.lastFrameTime = Date.now();
    this.accumulatedTime = 0;

    if (this.currentFrame !== null) {
      this.frameOffset = this.currentFrame;
      this.timeOffset =
        this.currentFrame / this.resourceManager._sequenceInfo.FrameRate;
      this.startDate = Date.now() / 1000;
    }

    if (this.isAudioplaying && this.audioCtx) {
      this.audioStartTime = this.audioCtx.currentTime;
      this.audioStartOffset =
        this.currentFrame / this.resourceManager._sequenceInfo.FrameRate;
    }
  }

  initSequence(
    nbFrames,
    nbBlocs,
    framerate,
    maxVertices,
    maxTriangles,
    textureEncoding,
    textureSizeX,
    textureSizeY,
    modelPosition,
  ) {
    const vertices = new Float32Array(maxVertices * 3);
    const uvs = new Float32Array(maxVertices * 2);
    const indices = new Uint32Array(maxTriangles * 3);
    const normals = new Float32Array(maxVertices * 3);

    this.model4D.initMesh(
      vertices,
      uvs,
      indices,
      normals,
      textureEncoding,
      textureSizeX,
      textureSizeY,
      modelPosition,
    );

    this.scene.add(this.model4D.mesh);
    this.scene.add(this.model4D.surface);
    this.scene.add(this.model4D.light);
    this.scene.add(this.model4D.light.target);

    this.renderer.shadowMap.enabled = true;
  }

  load(showPlaceholder, playOnload, callback) {
    if (!this.isLoaded) {
      this.showPlaceholder = showPlaceholder;
      this.playOnload = playOnload;

      const isMobile = DeviceUtils.isMobile;
      this.resourceManager.set4DSFile(this.url);
      // ASTC (164) for mobile GPUs, DXT1 (100) for desktop GPUs
      this.decoder4D.SetInputTextureEncoding(isMobile ? 164 : 100);

      this.resourceManager.Open(() => {
        const si = this.resourceManager._sequenceInfo;

        this.initSequence(
          si.NbFrames,
          si.NbBlocs,
          si.FrameRate,
          si.MaxVertices,
          si.MaxTriangles,
          si.TextureEncoding,
          si.TextureSizeX,
          si.TextureSizeY,
          this.position,
        );

        this.waitForWorkerReady(() => {
          this.Decode();
          this.waitForEmbeddedAudio(() => this.loadAudio(""));

          const waiter = setInterval(() => {
            if (
              this.decoder4D._meshesCache.length >= this.decoder4D._maxCacheSize
            ) {
              clearInterval(waiter);

              this.isReadyForPlayback = true;

              if (showPlaceholder === true) {
                this.currentMesh = this.decoder4D._meshesCache.shift();
                this.currentFrame = this.currentMesh.frame;
                this.updateSequenceMesh(this.currentMesh);
              } else {
                if (this.playOnload === true || this.playOnload == null) {
                  this.play();
                }
                if (callback) {
                  callback();
                }
              }
            }
          }, 100);

          this.isLoaded = true;
          this.sequenceTotalLength = si.NbFrames;
        });
      });
    } else {
      console.warn("A sequence is already loaded. One sequence at a time.");
    }
  }

  waitForWorkerReady(callback) {
    const checkWorkerReady = () => {
      if (this.decoder4D._workerReady) {
        callback();
      } else {
        setTimeout(checkWorkerReady, 100);
      }
    };

    checkWorkerReady();

    setTimeout(() => {
      if (!this.decoder4D._workerReady) {
        console.warn(
          "WebAssembly worker failed to initialize within timeout. Proceeding anyway...",
        );
        callback();
      }
    }, 10000);
  }

  updateSequenceMesh(mesh) {
    if (mesh && this.model4D) {
      this.model4D.updateMesh(
        mesh.vertices,
        mesh.faces,
        mesh.uvs,
        mesh.normals,
        mesh.texture,
        mesh.nbVertices,
        mesh.nbFaces,
      );
    }
  }

  Decode() {
    if (this.isDecoding) {
      return;
    }

    const isMobile = DeviceUtils.isMobile;
    const baseDt =
      1000.0 /
      (this.resourceManager._sequenceInfo.FrameRate * 6 * this.playbackRate);
    const dt = isMobile ? Math.max(baseDt, 50) : baseDt;

    this.isDecoding = true;
    const maxCache =
      this.resourceManager._sequenceInfo.NbFrames * 2 < 300
        ? this.resourceManager._sequenceInfo.NbFrames * 2
        : 300;

    if (
      this.decoder4D._chunks4D.length < maxCache ||
      (this.decoder4D._keepChunksInCache === true &&
        this.decoder4D._chunks4D.length <
          this.resourceManager._sequenceInfo.NbFrames * 2)
    ) {
      this.resourceManager._internalCacheSize = 6000000;
      this.resourceManager.getBunchOfChunks();
    }

    this.decodeLoop = setInterval(() => {
      if (this.decoder4D._meshesCache.length >= this.decoder4D._maxCacheSize) {
        this.stopDecoding();
        return;
      }

      if (
        this.decoder4D._chunks4D.length < maxCache ||
        (this.decoder4D._keepChunksInCache === true &&
          this.decoder4D._chunks4D.length <
            this.resourceManager._sequenceInfo.NbFrames * 2)
      ) {
        this.resourceManager._internalCacheSize = 6000000;
        this.resourceManager.getBunchOfChunks();
      }

      const chunksToDecode = isMobile ? 4 : 6;
      if (this.decoder4D._chunks4D.length > 0) {
        for (let i = 0; i < chunksToDecode; i++) {
          if (this.decoder4D._chunks4D.length > 0) {
            this.decoder4D.DecodeChunk();
          }
        }
      }

      this.sequenceDecodedFrames = this.decoder4D._meshesCache.length;
    }, dt);
  }

  stopDecoding() {
    clearInterval(this.decodeLoop);
    this.isDecoding = false;
  }

  pause() {
    clearInterval(this.playbackLoop);
    this.isPlaying = false;

    if (this.decoder4D._meshesCache >= this.decoder4D._maxCacheSize) {
      this.stopDecoding();
    }
    this.pauseAudio();
    this.frameOffset = this.currentFrame || 0;
  }

  play(autoUpdate = true) {
    if (this.isPlaying) {
      return;
    }

    if (!this.isReadyForPlayback) {
      console.warn("Sequence is not ready for playback yet");
      return;
    }

    this.showPlaceholder = false;
    if (this.isDecoding) {
      this.stopDecoding();
    }

    this.Decode();
    this.playAudio();
    this.isPlaying = true;
    this.lastFrameTime = Date.now();
    this.accumulatedTime = 0;
    this.startDate = Date.now() / 1000;
    this.seqDuration =
      this.resourceManager._sequenceInfo.NbFrames /
      this.resourceManager._sequenceInfo.FrameRate;
    this.timeOffset =
      (this.currentFrame || 0) / this.resourceManager._sequenceInfo.FrameRate;

    if (autoUpdate) {
      const dt =
        1000.0 /
        (this.resourceManager._sequenceInfo.FrameRate * this.playbackRate);
      this.playbackLoop = setInterval(() => {
        this.update();
      }, dt);
    }
  }

  update() {
    if (this.isSeeking) {
      return;
    }

    const isMobile = DeviceUtils.isMobile;
    const currentTime = Date.now();
    if (
      isMobile &&
      this.lastFrameTime &&
      currentTime - this.lastFrameTime < 30
    ) {
      return;
    }
    this.lastFrameTime = currentTime;
    const minCacheSize = isMobile ? 4 : 6;
    if (this.isPlaying && this.decoder4D._meshesCache.length < minCacheSize) {
      if (!this.isDecoding) {
        this.Decode();
      }
    }

    if (this.isPlaying && this.decoder4D._meshesCache.length === 0) {
      if (this.isAudioplaying) {
        this.pauseAudio();
      }
      if (
        isMobile &&
        this.lastCacheCheck &&
        currentTime - this.lastCacheCheck < 200
      ) {
        return;
      }
      this.lastCacheCheck = currentTime;
      return;
    }

    if (this.decoder4D._meshesCache.length > minCacheSize) {
      this.lastCacheCheck = null;
    }

    if (!this.isPlaying) {
      return;
    }

    let frameToDisplay = 0;
    if (this.isAudioloaded && this.isAudioplaying) {
      this.audioPassedTime = this.audioCtx.currentTime - this.audioStartTime;

      if (this.audioStartOffset + this.audioPassedTime > this.seqDuration) {
        this.audioStartTime += this.seqDuration - this.audioStartOffset;
        this.audioPassedTime -= this.seqDuration - this.audioStartOffset;
        this.audioStartOffset = 0;
        this.currentFrame = -1;
      }

      frameToDisplay =
        (this.audioStartOffset + this.audioPassedTime) *
        this.resourceManager._sequenceInfo.FrameRate;
    } else {
      const currentTime = Date.now() / 1000;
      let passedTime = (currentTime - this.startDate) * this.playbackRate;
      if (this.timeOffset + passedTime > this.seqDuration) {
        this.startDate +=
          (this.seqDuration - this.timeOffset) / this.playbackRate;
        passedTime -= this.seqDuration - this.timeOffset;
        this.timeOffset = 0;
        this.currentFrame = -1;
      }

      frameToDisplay =
        (this.timeOffset + passedTime) *
        this.resourceManager._sequenceInfo.FrameRate;
    }
    frameToDisplay = Math.max(
      0,
      Math.min(frameToDisplay, this.sequenceTotalLength - 1),
    );
    if (this.currentMesh == null && this.decoder4D._meshesCache.length > 0) {
      this.currentMesh = this.decoder4D._meshesCache.shift();
      if (this.currentMesh) this.currentFrame = this.currentMesh.frame;
    }
    while (
      this.currentMesh &&
      this.currentFrame != Math.floor(frameToDisplay) &&
      this.decoder4D._meshesCache.length > 0
    ) {
      this.currentMesh = this.decoder4D._meshesCache.shift();
      this.currentFrame = this.currentMesh.frame;
    }
    if (this.currentFrame === -1) {
      this.pauseAudio();
    } else if (this.isAudioloaded && !this.isAudioplaying && !this.isMuted) {
      this.playAudio();
    }
    if (this.currentMesh) {
      this.updateSequenceMesh(this.currentMesh);
    }
  }
  waitForEmbeddedAudio(callback) {
    const check = () => {
      const track = this.resourceManager._audioTrack;
      if (track instanceof ArrayBuffer && track.byteLength > 0) {
        callback();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }

  loadAudio(audioFile) {
    if (typeof this.camera !== "undefined") {
      this.model4D.initAudio(this.audioCtx);
      this.camera.add(this.model4D.audioListener);
      this.gainNode = this.audioCtx.createGain();

      if (audioFile !== "") {
        this.model4D.audioLoader = new window.THREE.AudioLoader();
        this.model4D.audioLoader.load(
          audioFile,
          (buffer) => {
            this.model4D.setAudioBuffer(buffer);
            this.gainNode.gain.value = 1.0;
            this.isAudioloaded = true;
          },
          undefined,
          (err) => {
            console.warn(
              `External audio file failed to load (${audioFile}): ${err?.message || err}. Falling back to embedded audio.`,
            );
            this.waitForEmbeddedAudio(() => this.loadAudio(""));
          },
        );
      } else {
        const track = this.resourceManager._audioTrack;
        if (track instanceof ArrayBuffer && track.byteLength > 0) {
          this.audioCtx.decodeAudioData(track, (buffer) => {
            this.model4D.setAudioBuffer(buffer);
            this.gainNode.gain.value = 1.0;
            this.isAudioloaded = true;
          });
        }
      }
    } else {
      console.warn(
        "Please add a camera to your scene. AudioListener not attached.",
      );
    }
  }

  playAudio() {
    if (this.isAudioloaded && !this.isAudioplaying) {
      this.audioTrack = this.audioCtx.createBufferSource();
      this.audioTrack.loop = true;
      this.audioTrack.buffer = this.model4D.audioSound.buffer;
      this.audioTrack.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      if (this.isMuted) {
        this.gainNode.gain.value = 0;
      }

      this.audioTrack.playbackRate.value = this.playbackRate;
      this.audioStartOffset =
        (this.currentFrame || 0) / this.resourceManager._sequenceInfo.FrameRate;
      this.audioTrack.start(this.audioCtx.currentTime, this.audioStartOffset);

      this.isAudioplaying = true;
      this.audioStartTime = this.audioCtx.currentTime;
    }
  }

  pauseAudio() {
    if (this.isAudioplaying) {
      if (this.audioTrack) {
        this.audioTrack.stop();
      }
      this.isAudioplaying = false;
    }
  }

  mute() {
    if (this.gainNode) {
      this.audioLevel = this.gainNode.gain.value;
      this.gainNode.gain.value = 0;
    }
    this.isMuted = true;
  }

  unmute() {
    this.isMuted = false;
    if (this.gainNode) {
      if (this.audioLevel !== null && this.audioLevel !== undefined) {
        this.gainNode.gain.value = this.audioLevel;
      } else {
        this.gainNode.gain.value = 0.5;
      }
    }
  }

  destroy(callback) {
    clearInterval(this.playbackLoop);
    this.stopDecoding();

    if (this.model4D.audioSound) {
      if (this.audioTrack) {
        this.audioTrack.stop();
      }
      this.model4D.audioLoader = null;
      this.model4D.audioSound = null;
      this.model4D.audioListener = null;
      this.audioStartTime = 0;
      this.audioStartOffset = 0;
      this.audioPassedTime = 0;
    }

    this.resourceManager.reinitResources();

    if (this.isLoaded && this.model4D.mesh) {
      this.scene.remove(this.model4D.mesh);
      if (this.model4D.surface) this.scene.remove(this.model4D.surface);
      if (this.model4D.light) this.scene.remove(this.model4D.light);
    }

    this.isLoaded = false;
    this.isPlaying = false;
    this.isDecoding = false;
    this.isAudioplaying = false;
    this.isAudioloaded = false;
    this.isSeeking = false;
    this.currentMesh = null;

    this.decoder4D._meshesCache = [];
    this.decoder4D._chunks4D = [];

    this.currentFrame = 0;
    this.sequenceTotalLength = 0;
    this.sequenceDecodedFrames = 0;

    if (callback) {
      callback();
    }
  }
}
