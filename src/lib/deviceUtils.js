export const DeviceUtils = {
  get isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  },

  get isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  },

  get isAndroid() {
    return /Android/.test(navigator.userAgent);
  },

  get deviceType() {
    if (this.isMobile) {
      return "mobile";
    }
    return "desktop";
  },

  get webglSupport() {
    try {
      const canvas = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch (e) {
      return false;
    }
  },

  get webgl2Support() {
    try {
      const canvas = document.createElement("canvas");
      return !!(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
    } catch (e) {
      return false;
    }
  },

  getCacheSize() {
    if (this.isMobile) {
      return 30;
    }
    return 45;
  },
};

export default DeviceUtils;
