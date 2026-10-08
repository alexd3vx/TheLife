import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Soft studio reflections for a stage. Without them skin, cloth and eyes are lit only by a few direct lights and read as flat plastic;
 * with them dark skin gets a sheen, cloth gets a soft edge and the eyes get a wet highlight. One small texture, built once per stage.
 */
export function addStageEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity = 0.8): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = texture;
  scene.environmentIntensity = intensity;
  return () => {
    if (scene.environment === texture) scene.environment = null;
    texture.dispose();
    pmrem.dispose();
    room.dispose();
  };
}
