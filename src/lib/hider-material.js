const myHiderMaterialComponent = {
  init() {
    const hiderMaterial = new THREE.MeshStandardMaterial();
    hiderMaterial.colorWrite = false;
    hiderMaterial.depthWrite = true;
    hiderMaterial.depthTest = true;
    hiderMaterial.side = THREE.DoubleSide;

    const applyHiderMaterial = (mesh) => {
      if (!mesh) {
        return;
      }
      if (mesh.material) {
        mesh.material = hiderMaterial;
      }
      mesh.traverse((node) => {
        if (node.isMesh) {
          node.material = hiderMaterial;
          node.renderOrder = -10;
        }
      });
    };

    applyHiderMaterial(this.el.getObject3D("mesh"));
    this.el.addEventListener("model-loaded", () =>
      applyHiderMaterial(this.el.getObject3D("mesh")),
    );
  },
};

export { myHiderMaterialComponent };
