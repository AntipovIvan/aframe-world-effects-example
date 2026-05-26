import { config } from "./config.js";

export default class EnhancedModel4D {
  constructor() {
    this.geometry = null;
    this.material = null;
    this.texture = null;
    this.mesh = null;

    this.textureSizeX = 0;
    this.textureSizeY = 0;

    this.audioListener = null;
    this.audioSound = null;
    this.audioLoader = null;
  }

  initMesh(
    vertices,
    uvs,
    indices,
    normals,
    textureEncoding,
    textureSizeX,
    textureSizeY,
    modelPosition,
  ) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3),
    );
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.dynamic = true;

    this.initializeTexture(textureEncoding, textureSizeX, textureSizeY);

    this.textureSizeX = textureSizeX;
    this.textureSizeY = textureSizeY;

    this.material = new THREE.MeshBasicMaterial({ map: this.texture });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "mesh4D";
    this.mesh.position.set(
      modelPosition[0],
      modelPosition[1],
      modelPosition[2],
    );
    this.mesh.castShadow = true;

    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10, 1, 1),
      new THREE.ShadowMaterial({
        opacity: config.model4D.shadowOpacity ?? 0.35,
      }),
    );
    this.surface.rotateX(-Math.PI / 2);
    this.surface.position.set(
      modelPosition[0],
      modelPosition[1],
      modelPosition[2],
    );
    this.surface.receiveShadow = true;
    this.surface.visible = false;

    const spotlightConfig = config.model4D.spotlight;
    const spotOffset = spotlightConfig.offset ?? { x: -1.5, y: 4, z: 0 };
    this.light = new THREE.SpotLight(
      spotlightConfig.color,
      spotlightConfig.intensity,
      spotlightConfig.distance,
      spotlightConfig.angle,
      spotlightConfig.penumbra,
      spotlightConfig.decay,
    );
    this.light.position.set(
      modelPosition[0] + spotOffset.x,
      modelPosition[1] + spotOffset.y,
      modelPosition[2] + spotOffset.z,
    );
    this.light.target.position.set(
      modelPosition[0],
      modelPosition[1],
      modelPosition[2],
    );
    this.light.castShadow = spotlightConfig.castShadow;
    this.light.shadow.mapSize.width = spotlightConfig.shadowMapSize[0];
    this.light.shadow.mapSize.height = spotlightConfig.shadowMapSize[1];
    this.light.shadow.camera.near = spotlightConfig.shadowCameraNear;
    this.light.shadow.camera.far = spotlightConfig.shadowCameraFar;
    this.light.shadow.camera.fov = spotlightConfig.shadowCameraFov;
    this.light.shadow.bias = spotlightConfig.shadowBias;
    this.light.shadow.normalBias = spotlightConfig.shadowNormalBias;
  }

  initializeTexture(textureEncoding, textureSizeX, textureSizeY) {
    if (textureEncoding === 164) {
      this.texture = new THREE.CompressedTexture(
        null,
        textureSizeX,
        textureSizeY,
        THREE.RGBA_ASTC_8x8_Format,
        THREE.UnsignedByteType,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.LinearFilter,
        THREE.LinearFilter,
      );
    } else if (textureEncoding === 100) {
      this.texture = new THREE.CompressedTexture(
        null,
        textureSizeX,
        textureSizeY,
        THREE.RGB_S3TC_DXT1_Format,
        THREE.UnsignedByteType,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.LinearFilter,
        THREE.LinearFilter,
      );
    } else {
      this.texture = new THREE.DataTexture(
        null,
        textureSizeX,
        textureSizeY,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.LinearFilter,
        THREE.LinearFilter,
      );
    }

    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.unpackAlignment = 1;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  updateMesh(verts, faces, uvs, normals, texture, nbVerts, nbFaces) {
    this.geometry.attributes.position.array = verts;
    this.geometry.attributes.position.needsUpdate = true;

    this.mesh.geometry.index.array = faces;
    this.geometry.attributes.uv.array = uvs;
    this.geometry.attributes.uv.needsUpdate = true;
    this.mesh.geometry.index.needsUpdate = true;
    this.geometry.attributes.normal.array = normals;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.setDrawRange(0, nbFaces * 3);

    if (!texture) return;

    const mipmap = {
      data: texture,
      width: this.textureSizeX,
      height: this.textureSizeY,
    };
    this.texture.mipmaps = [mipmap];
    this.texture.needsUpdate = true;
  }

  setPosition(modelPositionVec3) {
    const spotOffset = config.model4D.spotlight.offset ?? {
      x: -1.5,
      y: 4,
      z: 0,
    };
    this.mesh.position.x = modelPositionVec3[0];
    this.mesh.position.y = modelPositionVec3[1];
    this.mesh.position.z = modelPositionVec3[2];

    this.surface.position.set(
      modelPositionVec3[0],
      modelPositionVec3[1],
      modelPositionVec3[2],
    );
    this.light.position.set(
      modelPositionVec3[0] + spotOffset.x,
      modelPositionVec3[1] + spotOffset.y,
      modelPositionVec3[2] + spotOffset.z,
    );
    this.light.target.position.set(
      modelPositionVec3[0],
      modelPositionVec3[1],
      modelPositionVec3[2],
    );
  }

  setRotation(modelOrientationVec3) {
    this.mesh.rotation.x = modelOrientationVec3[0];
    this.mesh.rotation.y = modelOrientationVec3[1];
    this.mesh.rotation.z = modelOrientationVec3[2];
  }

  initAudio(audioCtx) {
    this.audioListener = new window.THREE.AudioListener(audioCtx);
    this.audioSound = new window.THREE.PositionalAudio(this.audioListener);
  }

  loadAudioFile(audioFile, isAudioloaded, callback) {
    this.audioLoader = new window.THREE.AudioLoader();
    this.audioLoader.load(audioFile, (buffer) => {
      this.setAudioBuffer(buffer);
      isAudioloaded = true;
      callback();
    });
  }

  setAudioBuffer(buffer) {
    this.audioSound.setBuffer(buffer);
    this.audioSound.setLoop(false);
    this.audioSound.setVolume(0);
  }

  dispose() {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.material) {
      if (this.material.map) {
        this.material.map.dispose();
      }
      this.material.dispose();
    }
    if (this.texture) {
      this.texture.dispose();
    }
    if (this.audioSound) {
      this.audioSound.disconnect();
    }
  }
}
