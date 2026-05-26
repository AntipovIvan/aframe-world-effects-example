import { DeviceUtils } from "./deviceUtils.js";

class ChunkSerialized {
  constructor() {
    this.type = 0;
    this.codec = 0;
    this.version = 0;
    this.size = 0;
    this.data = null;
  }
}

function worker_function() {
  let ModuleInstance = null;
  let codecInstance = null;
  let isModuleReady = false;

  const _pub = process.env.PUBLIC_PATH || "/";
  self.WEB4DV_WASM_URL = new URL(
    _pub + "web4dv/CODEC.wasm",
    self.location.origin,
  ).href;
  const codecPath = new URL(_pub + "web4dv/CODEC.js", self.location.origin)
    .href;
  importScripts(codecPath);

  Module.onRuntimeInitialized = function () {
    try {
      codecInstance = new Module.LinearEBD4DVDecoder();
      ModuleInstance = Module;
      isModuleReady = true;
      postMessage({ type: "module_ready" });
    } catch (error) {
      console.error("Error initializing codec:", error);
      postMessage({ type: "module_error", error: error.message });
    }
  };

  onmessage = function (e) {
    if (!isModuleReady || !ModuleInstance || !codecInstance) {
      console.warn("Module not ready, ignoring message");
      return;
    }

    try {
      const chunk4d = new ModuleInstance.Chunk(
        e.data[0],
        e.data[1],
        e.data[2],
        e.data[3],
        e.data[4],
      );
      const mesh = codecInstance.AddChunk(chunk4d);
      chunk4d.delete();

      if (mesh) {
        const vview = new Float32Array(mesh.GetVertices());
        const fview = new Int32Array(mesh.GetFaces());
        const uvview = new Float32Array(mesh.GetUVs());
        const nview = new Float32Array(mesh.GetNormals());
        const tview = new Int8Array(mesh.GetTexture());

        postMessage(
          {
            type: "mesh_data",
            frame: mesh.frame,
            nbVertices: mesh.nbVertices,
            nbFaces: mesh.nbFaces,
            textureBufferSize: mesh.textureBufferSize,
            textureEncoding: mesh.textureEncoding,
            vertices: vview,
            faces: fview,
            uvs: uvview,
            normals: nview,
            texture: tview,
          },
          [
            vview.buffer,
            fview.buffer,
            uvview.buffer,
            nview.buffer,
            tview.buffer,
          ],
        );

        mesh.delete();
      }
    } catch (error) {
      console.error("Error processing chunk:", error);
      postMessage({ type: "processing_error", error: error.message });
    }
  };
}
if (window != self) worker_function();

export class Decoder {
  constructor() {
    this._chunks4D = [];
    this._meshesCache = [];
    this._curChunkIndex = 0;
    this._keepChunksInCache = false;
    this._maxCacheSize = DeviceUtils.getCacheSize();
    this._workerReady = false;
    this._decodeWorker = new Worker(
      URL.createObjectURL(
        new Blob([`(${worker_function.toString()})()`], {
          type: "text/javascript",
        }),
      ),
    );

    const parent = this;
    this._decodeWorker.onmessage = function (e) {
      if (e.data.type === "module_ready") {
        parent._workerReady = true;
      } else if (e.data.type === "mesh_data") {
        parent._meshesCache.push(e.data);
      } else if (
        e.data.type === "module_error" ||
        e.data.type === "processing_error"
      ) {
        console.error("Worker error:", e.data.error);
      }
    };

    this._decodeWorker.onerror = function (e) {
      console.error(`decode worker error : ${e.message}`);
    };
  }

  Destroy() {
    if (this._decodeWorker) {
      this._decodeWorker.terminate();
      this._decodeWorker = null;
    }
  }

  SetInputTextureEncoding(encoding) {}

  DecodeChunk() {
    if (this._meshesCache.length >= this._maxCacheSize || !this._workerReady) {
      return;
    }

    let chunk4D = null;

    if (this._keepChunksInCache) {
      chunk4D = this._chunks4D[this._curChunkIndex];
      if (this._curChunkIndex < this._chunks4D.length) {
        this._curChunkIndex++;
      } else {
        this._curChunkIndex = 0;
      }
    } else {
      chunk4D = this._chunks4D.shift();
    }

    if (chunk4D) {
      this._decodeWorker.postMessage([
        chunk4D.type,
        chunk4D.codec,
        chunk4D.version,
        chunk4D.size,
        chunk4D.data,
      ]);

      if (
        this._keepChunksInCache &&
        this._curChunkIndex >= this._chunks4D.length
      ) {
        this._curChunkIndex = 0;
      }
    } else {
      console.log("DecodeChunk: No chunks available to process");
    }
  }
}

class BlocInfo {
  constructor(keyFrameId, nbInterFrames, blocChunkPos) {
    this.KeyFrameId = keyFrameId;
    this.NbInterFrames = nbInterFrames;
    this.BlocChunkPos = blocChunkPos;
  }
}

export class ResourceManagerXHR {
  constructor() {
    this._internalCacheSize = 20000000;

    this._sequenceInfo = {
      NbFrames: 0,
      NbBlocs: 0,
      FrameRate: 0,
      MaxVertices: 0,
      MaxTriangles: 0,
      TextureEncoding: 0,
      TextureSizeX: 0,
      TextureSizeY: 0,
      NbAdditionalTracks: 0,
    };

    this._pointerToSequenceInfo = 0;
    this._pointerToBlocIndex = 0;
    this._pointerToTrackIndex = 0;
    this._blocInfos = [];
    this._KFPositions = [];
    this._currentBlocIndex = 0;
    this._firstBlocIndex = 0;
    this._lastBlocIndex = 0;
    this._tracksPositions = [];
    this._audioTrack = [];
    this._isInitialized = false;
    this._isDownloading = false;
    this._file4ds = "";
    this.decoder4D = new Decoder();
  }

  Open(callbackFunction) {
    this._callback = callbackFunction;
    this.getFileHeader();
  }

  SetXHR(firstByte, lastByte) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", this._file4ds);
    xhr.responseType = "arraybuffer";
    xhr.overrideMimeType("arrayBuffer; charset=x-user-defined");

    xhr.setRequestHeader("Range", `bytes=${firstByte}-${lastByte}`);

    return xhr;
  }

  getOneChunk(position) {
    const xhr = this.SetXHR(position, position + 9);

    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        let headerChunk;
        if (xhr.status === 206) {
          headerChunk = xhr.response;
        } else {
          // Extract the requested range from the full response
          headerChunk = xhr.response.slice(position, position + 9);
        }

        const dv = new DataView(headerChunk);
        const type = dv.getUint8(0, true);
        const codec = dv.getUint16(1, true);
        const version = dv.getUint16(3, true);
        const chunkSize = dv.getUint32(5, true);

        const chunkHeader = {
          Type: type,
          Codec: codec,
          Version: version,
          Size: chunkSize,
        };

        if (chunkHeader.Type === 1) {
          parent.getSequenceInfo(position + 9, chunkHeader.Size);
        } else if (chunkHeader.Type === 2) {
          parent.getTracksIndexes(position + 9, chunkHeader.Size);
        } else if (chunkHeader.Type === 3) {
          parent.getBlocsInfos(position + 9, chunkHeader.Size);
        } else if (chunkHeader.Type === 21) {
          parent.getAudioTrack(position + 9, chunkHeader.Size);
        } else {
          parent.getChunkData(position + 9, chunkHeader.Size);
        }
      } else {
        console.error(
          `getOneChunk: Request failed - status: ${xhr.status}, statusText: ${xhr.statusText}`,
        );
      }
    };
    xhr.send();
  }

  getBunchOfChunks(onLoadCallback) {
    if (!this._isInitialized) {
      return;
    }

    if (this._isDownloading) {
      return;
    }
    this._isDownloading = true;

    const pos0 = this._KFPositions[this._currentBlocIndex];
    let pos1 = pos0;

    while (
      pos1 - pos0 < this._internalCacheSize &&
      ++this._currentBlocIndex <= this._lastBlocIndex
    ) {
      pos1 = this._KFPositions[this._currentBlocIndex];
    }

    if (this._currentBlocIndex > this._lastBlocIndex) {
      if (this._lastBlocIndex === this._sequenceInfo.NbBlocs - 1) {
        pos1 = this._pointerToBlocIndex;
      } else {
        pos1 = this._KFPositions[this._currentBlocIndex];
      }
      this._currentBlocIndex = this._firstBlocIndex;
    }

    let memorySize = pos1 - pos0;

    const xhr = this.SetXHR(pos0, pos1);

    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        let responseData;
        if (xhr.status === 206) {
          responseData = xhr.response;
        } else {
          responseData = xhr.response.slice(pos0, pos1);
        }

        const dv = new DataView(responseData);
        let dataPtr = 0;
        while (memorySize > 0) {
          const chunkSize = dv.getUint32(dataPtr + 5, true);

          const cdataArray = new Uint8Array(
            responseData.slice(dataPtr + 9, dataPtr + 9 + chunkSize),
            0,
            chunkSize,
          );

          const chunk4D = new ChunkSerialized();
          chunk4D.type = dv.getUint8(dataPtr, true);
          chunk4D.codec = dv.getUint16(dataPtr + 1, true);
          chunk4D.version = dv.getUint16(dataPtr + 3, true);
          chunk4D.size = chunkSize;
          chunk4D.data = cdataArray;

          dataPtr += 9 + chunkSize;
          memorySize -= 9 + chunkSize;

          if (
            chunk4D.type === 10 ||
            chunk4D.type === 11 ||
            chunk4D.type === 12 ||
            chunk4D.type === 14
          ) {
            if (
              !parent.decoder4D._keepChunksInCache ||
              parent.decoder4D._chunks4D.length <
                parent._sequenceInfo.NbFrames * 2
            ) {
              parent.decoder4D._chunks4D.push(chunk4D);
            }
          }
        }

        parent._isDownloading = false;
      } else {
        parent._isDownloading = false;
      }
    };

    xhr.onerror = function () {
      console.error("XHR request failed");
      parent._isDownloading = false;
    };

    xhr.send();
  }

  reinitResources() {
    this._sequenceInfo = {
      NbFrames: 0,
      NbBlocs: 0,
      FrameRate: 0,
      MaxVertices: 0,
      MaxTriangles: 0,
      TextureEncoding: 0,
      TextureSizeX: 0,
      TextureSizeY: 0,
      NbAdditionalTracks: 0,
    };
    this._blocInfos = [];
    this._KFPositions = [];
    this._currentBlocIndex = 0;
    this._firstBlocIndex = 0;
    this._lastBlocIndex = 0;
    this._tracksPositions = [];
    this._audioTrack = [];
    this._isInitialized = false;
    this._isDownloading = false;
    if (this.decoder4D) {
      this.decoder4D._chunks4D = [];
      this.decoder4D._meshesCache = [];
      this.decoder4D._curChunkIndex = 0;
    }
  }

  seek(frame) {
    let sf = 0;
    let i = 0;
    while (sf < frame && i < this._blocInfos.length) {
      sf += this._blocInfos[i].NbInterFrames + 1;
      i++;
    }

    if (i > 0) {
      this._currentBlocIndex = i - 1;
    } else {
      this._currentBlocIndex = 0;
    }

    if (this.decoder4D) {
      this.decoder4D._chunks4D = [];
      this.decoder4D._meshesCache = [];
      this.decoder4D._curChunkIndex = 0;
    }

    this._isDownloading = false;
  }

  getChunkData(position, size) {
    const xhr = this.SetXHR(position, position + size);

    xhr.onload = function () {
      if (xhr.status === 206) {
        return xhr.response;
      } else if (xhr.status !== 200) {
        console.error(`Error: ${xhr.status}`);
        return null;
      } else return null;
    };
    xhr.send();
  }

  getFileHeader() {
    const xhr = this.SetXHR(0, 30);
    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        let headerChunk;
        if (xhr.status === 206) {
          headerChunk = xhr.response;
        } else {
          headerChunk = xhr.response.slice(0, 30);
        }

        const dv = new DataView(headerChunk);
        const version = dv.getInt16(4, true);
        parent._pointerToSequenceInfo = dv.getInt32(6, true);
        const pointerToSequenceInfoPart2 = dv.getInt32(10, true);
        parent._pointerToBlocIndex = dv.getInt32(14, true);
        const pointerToBlocIndexPart2 = dv.getInt32(18, true);
        parent._pointerToTrackIndex = dv.getInt32(22, true);
        const pointerToTrackIndexPart2 = dv.getInt32(26, true);
        parent.getOneChunk(parent._pointerToSequenceInfo);
      } else {
        console.error(
          `getFileHeader: Request failed - status: ${xhr.status}, statusText: ${xhr.statusText}`,
        );
      }
    };

    xhr.onerror = function () {
      console.error("getFileHeader: XHR request failed");
    };

    xhr.ontimeout = function () {
      console.error("getFileHeader: XHR request timed out");
    };

    xhr.send();
  }

  getSequenceInfo(position, size) {
    const xhr = this.SetXHR(position, position + size);

    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        let sequenceData;
        if (xhr.status === 206) {
          sequenceData = xhr.response;
        } else {
          sequenceData = xhr.response.slice(position, position + size);
        }

        const dv = new DataView(sequenceData);
        parent._sequenceInfo.NbFrames = dv.getUint32(0, true);
        parent._sequenceInfo.NbBlocs = dv.getUint32(4, true);
        parent._sequenceInfo.FrameRate = dv.getFloat32(8, true);
        parent._sequenceInfo.MaxVertices = dv.getUint32(12, true);
        parent._sequenceInfo.MaxTriangles = dv.getUint32(16, true);
        parent._sequenceInfo.TextureEncoding = dv.getUint32(20, true);
        parent._sequenceInfo.TextureSizeX = dv.getUint32(24, true);
        parent._sequenceInfo.TextureSizeY = dv.getUint32(28, true);
        parent._sequenceInfo.NbAdditionalTracks = dv.getUint32(32, true);

        parent.getOneChunk(parent._pointerToBlocIndex);

        if (parent._sequenceInfo.NbAdditionalTracks > 0) {
          parent.getOneChunk(parent._pointerToTrackIndex);
        }
      } else {
        console.error(
          `getSequenceInfo: Request failed - status: ${xhr.status}, statusText: ${xhr.statusText}`,
        );
      }
    };
    xhr.send();
  }

  getBlocsInfos(position, size) {
    const xhr = this.SetXHR(position, position + size);

    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        let blocsData;
        if (xhr.status === 206) {
          blocsData = xhr.response;
        } else {
          blocsData = xhr.response.slice(position, position + size);
        }

        const dv = new DataView(blocsData);

        parent._KFPositions.push(79);

        for (let i = 0; i < parent._sequenceInfo.NbBlocs; i++) {
          const bi = new BlocInfo(
            dv.getInt32(i * 16, true),
            dv.getInt32(i * 16 + 4, true),
            dv.getInt32(i * 16 + 8, true),
          );
          parent._blocInfos.push(bi);
          parent._KFPositions.push(
            bi.BlocChunkPos + 9 + (bi.NbInterFrames + 1) * 16,
          );
        }

        parent._firstBlocIndex = 0;
        parent._lastBlocIndex = parent._sequenceInfo.NbBlocs - 1;

        parent._isInitialized = true;

        parent._callback();
      } else {
        console.error(
          `getBlocsInfos: Request failed - status: ${xhr.status}, statusText: ${xhr.statusText}`,
        );
      }
    };
    xhr.send();
  }

  getTracksIndexes(position, size) {
    const xhr = this.SetXHR(position, position + size);

    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        let tracksData;
        if (xhr.status === 206) {
          tracksData = xhr.response;
        } else {
          tracksData = xhr.response.slice(position, position + size);
        }

        const dv = new DataView(tracksData);

        for (let i = 0; i < parent._sequenceInfo.NbAdditionalTracks; i++) {
          parent._tracksPositions.push(dv.getInt32(i * 8, true));
          parent.getOneChunk(parent._tracksPositions[i]);
        }
      } else {
        console.error(
          `getTracksIndexes: Request failed - status: ${xhr.status}, statusText: ${xhr.statusText}`,
        );
      }
    };
    xhr.send();
  }

  getAudioTrack(position, size) {
    const xhr = this.SetXHR(position, position + size);

    const parent = this;

    xhr.onload = function () {
      if (xhr.readyState === 4 && (xhr.status === 206 || xhr.status === 200)) {
        if (xhr.status === 206) {
          parent._audioTrack = xhr.response;
        } else {
          parent._audioTrack = xhr.response.slice(position, position + size);
        }
      } else {
        console.error(
          `getAudioTrack: Request failed - status: ${xhr.status}, statusText: ${xhr.statusText}`,
        );
      }
    };
    xhr.send();
  }

  set4DSFile(file) {
    this._file4ds = file;
  }
}
