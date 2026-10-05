import * as THREE from "three";

export const HORIZON_COLOR = new THREE.Color("#f4b27a");

/** Gradient dome that follows the camera, plus a soft sun glow near the horizon. */
export function createSky(glowTexture: THREE.Texture, sunDirection: THREE.Vector3) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(520, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color("#2a2f5e") },
        midColor: { value: new THREE.Color("#c9647a") },
        horizonColor: { value: HORIZON_COLOR },
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vHeight = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizonColor;
        varying float vHeight;
        void main() {
          float h = clamp(vHeight, 0.0, 1.0);
          vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.22, h));
          color = mix(color, topColor, smoothstep(0.18, 0.75, h));
          gl_FragColor = vec4(color, 1.0);
        }`,
    }),
  );

  const group = new THREE.Group();
  group.add(dome);

  const sunMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: "#ffd9a0",
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    transparent: true,
  });
  const sun = new THREE.Sprite(sunMaterial);
  sun.scale.set(220, 220, 1);
  sun.position.copy(sunDirection).multiplyScalar(470);
  group.add(sun);

  const core = new THREE.Sprite(sunMaterial.clone());
  core.scale.set(60, 60, 1);
  core.position.copy(sun.position);
  group.add(core);

  return group;
}
