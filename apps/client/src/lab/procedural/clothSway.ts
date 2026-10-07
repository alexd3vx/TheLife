import * as THREE from "three";

/**
 * Cheap cloth motion for hanging garments, with no per-vertex simulation: the person's own movement drives one spring, and the shader
 * moves each vertex of the cloth by that spring in proportion to how loose it is (the `sway` attribute: nothing at the waist, most at the
 * hem). A skirt lags when you start, swings forward when you stop, billows out as you speed up, and ripples a little. One spring per
 * person and a few lines of vertex shader, so it costs next to nothing on a phone.
 */

export interface SwayUniforms {
  uDrag: { value: THREE.Vector3 };
  uTime: { value: number };
  uFlutter: { value: number };
  uBillow: { value: number };
  uAxis: { value: THREE.Vector2 };
}

export class Sway {
  readonly uniforms: SwayUniforms = {
    uDrag: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uFlutter: { value: 0.002 },
    uBillow: { value: 0 },
    uAxis: { value: new THREE.Vector2() },
  };
  private velocity = new THREE.Vector3();
  private lag = new THREE.Vector3();
  private lagSpeed = new THREE.Vector3();
  private last: THREE.Vector3 | null = null;
  private inv = new THREE.Quaternion();

  /** `pelvis`: where the hips are in the world now; `root`: the person's world rotation (the cloth is moved in the person's own space). */
  update(dt: number, pelvis: THREE.Vector3, root: THREE.Quaternion): void {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    if (this.last) {
      const v = pelvis.clone().sub(this.last).divideScalar(dt);
      if (v.length() > 8) v.set(0, 0, 0); // a jump (a teleport), not a movement
      this.velocity.lerp(v, 1 - Math.exp(-12 * dt));
    }
    this.last = (this.last ?? new THREE.Vector3()).copy(pelvis);
    const local = this.velocity.clone().applyQuaternion(this.inv.copy(root).invert());
    local.y *= 0.3;
    const target = local.multiplyScalar(-0.04);
    if (target.length() > 0.1) target.setLength(0.1);
    // a spring: the cloth is pulled toward where the movement wants it and overshoots a little
    this.lagSpeed.addScaledVector(target.clone().sub(this.lag), 60 * dt).addScaledVector(this.lagSpeed, -7 * dt);
    this.lag.addScaledVector(this.lagSpeed, dt);
    const speed = Math.min(1, this.velocity.length() / 3);
    const u = this.uniforms;
    u.uDrag.value.copy(this.lag);
    u.uTime.value += dt;
    u.uFlutter.value = 0.002 + speed * 0.012;
    u.uBillow.value = speed * 0.03;
  }
}

/** Makes a material move with the sway uniforms (its geometry must carry the `sway` attribute). */
export function applySway(material: THREE.Material, uniforms: SwayUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform vec3 uDrag;\nuniform float uTime;\nuniform float uFlutter;\nuniform float uBillow;\nuniform vec2 uAxis;")
      .replace(
        "#include <skinning_vertex>",
        `#include <skinning_vertex>
        {
          float sw = sway;
          vec2 radial = transformed.xz - uAxis;
          radial /= max(length(radial), 1e-4);
          transformed.xz += radial * uBillow * sw;
          transformed += uDrag * sw;
          transformed.y -= length(uDrag) * 0.3 * sw;
          float ph = uTime * 6.0 + transformed.y * 22.0 + atan(transformed.x - uAxis.x, transformed.z - uAxis.y) * 5.0;
          transformed.xz += radial * sin(ph) * uFlutter * sw;
        }`,
      );
  };
  material.customProgramCacheKey = () => "sway1";
}
