import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { THIEF_START } from "./chase.js";
import { createCutaway, FOREGROUND_LAYER } from "./cutaway.js";
import { CHUNK_LENGTH, createEndlessStreet } from "./endless.js";

const easing = (value) => THREE.MathUtils.smoothstep(value, 0, 1);
const gesture = (elapsed, duration, easeIn, easeOut) =>
  easing(elapsed / easeIn) * easing((duration - elapsed) / easeOut);
const THIEF_ACTIONS = [
  { name: "glance", x: THIEF_START + 2.8 },
  { name: "wave", x: -3.0 },
];

class Runner {
  constructor(model, lane) {
    this.model = model;
    this.lane = lane;
    this.parts = {};
    this.rotate = new THREE.Euler();
    this.extra = new THREE.Quaternion();
    this.reset();
    model.rotation.y = Math.PI / 2;
    model.traverse((object) => {
      if (object.isMesh) {
        object.receiveShadow = true;
      }
      const name = object.name.replace(/[^a-z]/gi, "").toLowerCase();
      const prefix = ["head", "torso", "arml", "armr", "legl", "legr"].find((part) => name.startsWith(part));
      if (prefix && !this.parts[prefix]) this.parts[prefix] = { object, rest: object.quaternion.clone() };
    });
    if (Object.keys(this.parts).length !== 6) throw new Error("The runner model is missing a movable body part");

    // The Blender display poses have different fore-aft offsets on each side.
    for (const [left, right] of [["arml", "armr"], ["legl", "legr"]]) {
      const pair = [this.parts[left], this.parts[right]];
      const depth = (pair[0].object.position.z + pair[1].object.position.z) / 2;
      for (const { object, rest } of pair) {
        object.position.z = depth;
        this.rotate.setFromQuaternion(rest, "YXZ").x = 0;
        rest.setFromEuler(this.rotate);
      }
    }
  }

  pose(name, x, y = 0, z = 0) {
    const { object, rest } = this.parts[name];
    this.rotate.set(x, y, z, "YXZ");
    object.quaternion.copy(rest).multiply(this.extra.setFromEuler(this.rotate));
  }

  play(action, elapsed) {
    this.action = action;
    this.actionAt = elapsed;
  }

  reset() {
    this.stride = 0;
    this.action = null;
    this.actionAt = -Infinity;
  }

  update(position, velocity, elapsed, seconds) {
    const motion = Math.min(1, velocity / 3) * easing(elapsed / .15);
    const cadence = Math.min(2.8, 1.35 + velocity * .145);
    if (velocity > 0) this.stride += seconds * cadence * 2 * Math.PI;
    const stride = Math.sin(this.stride) * motion;
    const legSwing = stride * (.45 + .16 * Math.min(1, velocity / 9));
    const armSwing = -stride * .53;
    const actionTime = elapsed - this.actionAt;
    const glance = motion && this.action === "glance" ? gesture(actionTime, 1.04, .21, .31) : 0;
    const wave = motion && this.action === "wave" ? gesture(actionTime, 1.42, .23, .31) : 0;
    const flutter = wave ? Math.sin(actionTime * 17) * .23 : 0;
    // Compensate for the rear boot's toe dipping as that leg swings back.
    const toeDrop = .52 * Math.abs(Math.sin(legSwing)) - .73 * (1 - Math.cos(legSwing));
    const lift = Math.cos(this.stride) ** 2 * .035 * motion;
    this.model.position.set(position, .047 + toeDrop + lift, this.lane);
    this.pose("legl", legSwing);
    this.pose("legr", -legSwing);
    this.pose("arml", armSwing * (1 - wave), .23 * wave, (-2.54 + flutter) * wave);
    this.pose("armr", -armSwing);
    this.pose("torso", .09 * motion, -.23 * glance, .029 * stride * motion);
    this.pose("head", -.035 * motion, -1.78 * glance);
  }
}

function contactShadows(scene) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((2 * x + 1) / size - 1, (2 * y + 1) / size - 1);
      const offset = (size * y + x) * 4;
      pixels.set([255, 255, 255, Math.round(255 * (1 - easing(radius)) ** 2)], offset);
    }
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ color: "#263b47", map, opacity: .54, transparent: true, depthWrite: false });
  return Array.from({ length: 2 }, () => {
    const shadow = new THREE.Mesh(geometry, material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.72, 1.25, 1);
    scene.add(shadow);
    return shadow;
  });
}

export async function createStreet(view) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.01;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  view.prepend(renderer.domElement);
  const cutaway = createCutaway(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a6ccbd");
  scene.add(new THREE.HemisphereLight("#f4fbf6", "#98a8a0", 1.69));
  const sun = new THREE.DirectionalLight("#fff2db", 1.94);
  sun.position.set(-23, 38, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(Math.min(3072, renderer.capabilities.maxTextureSize));
  Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 32, bottom: -32, near: 1, far: 104 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00045;
  sun.shadow.normalBias = .045;
  sun.shadow.radius = 3.1;
  sun.shadow.intensity = .83;
  sun.shadow.autoUpdate = false;
  const fill = new THREE.DirectionalLight("#e5f3ff", .66);
  fill.position.set(14, 10, 18);
  scene.add(sun, sun.target, fill);

  const land = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: "#a7c8b5" }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = -.27;
  land.receiveShadow = true;
  scene.add(land);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .08, 130);
  camera.layers.enable(FOREGROUND_LAYER);
  const focus = new THREE.Vector3(0, 2.31, -1.16);
  const cameraOffset = new THREE.Vector3(15, 22, 30);
  let followX;
  let nextAction = 0;
  let actionCycle = 0;
  let shadowCenter;

  function resize() {
    const bounds = view.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const aspect = bounds.width / bounds.height;
    const density = Math.min(Math.max(devicePixelRatio, 1.25), 2, Math.sqrt(2_600_000 / (bounds.width * bounds.height)));
    renderer.setPixelRatio(density);
    renderer.setSize(Math.round(bounds.width), Math.round(bounds.height), false);
    cutaway.resize();
    const span = THREE.MathUtils.clamp(20.0 / aspect, 15.0, 20.0);
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(view);
  resize();

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const files = ["thief", "police", "modules"];
  const [thiefModel, policeModel, modules] = await Promise.all(files.map((file) =>
    loader.loadAsync(`${import.meta.env.BASE_URL}scene/${file}.glb`)));
  const endless = createEndlessStreet(modules.scene);
  scene.add(endless.world, thiefModel.scene, policeModel.scene);
  const thief = new Runner(thiefModel.scene, .34);
  const police = new Runner(policeModel.scene, -.46);
  const [thiefShadow, policeShadow] = contactShadows(scene);
  sun.shadow.needsUpdate = true;

  return {
    reset(seed) {
      endless.reset(seed);
      followX = undefined;
      nextAction = 0;
      actionCycle = 0;
      shadowCenter = undefined;
      thief.reset();
      police.reset();
    },
    draw(chase, delta) {
      const advancing = chase.phase === "running";
      const cycle = Math.floor((chase.thief - THIEF_START) / CHUNK_LENGTH) * CHUNK_LENGTH;
      if (cycle !== actionCycle) {
        nextAction = 0;
        actionCycle = cycle;
      }
      const action = THIEF_ACTIONS[nextAction];
      if (advancing && action && chase.thief >= action.x + actionCycle) {
        thief.play(action.name, chase.elapsed);
        nextAction++;
      }
      // Rebase the rendered coordinates around the active street chunks.
      const origin = Math.floor(chase.thief / CHUNK_LENGTH) * CHUNK_LENGTH;
      const loadedNewChunks = endless.update(chase.police, chase.thief, origin);
      const thiefX = chase.thief - origin;
      const policeX = chase.police - origin;
      const animationDelta = advancing ? delta : 0;
      thief.update(thiefX, chase.speed, chase.elapsed, animationDelta);
      police.update(policeX, chase.policeSpeed, chase.elapsed, animationDelta);
      thiefShadow.position.set(thiefX + .10, .061, thief.lane - .12);
      policeShadow.position.set(policeX + .10, .061, police.lane - .12);

      const targetX = chase.thief + 2.9;
      followX = followX === undefined ? targetX : THREE.MathUtils.lerp(followX, targetX, 1 - Math.exp(-6 * delta));
      focus.x = followX - origin;
      const lightX = Math.round(followX / 16) * 16 - origin;
      if (lightX !== shadowCenter || loadedNewChunks) {
        shadowCenter = lightX;
        sun.position.x = lightX - 23;
        sun.target.position.x = lightX;
        sun.shadow.needsUpdate = true;
      }
      camera.position.copy(focus).add(cameraOffset);
      camera.lookAt(focus);
      cutaway.render(scene, camera, thief.model);
    },
  };
}
