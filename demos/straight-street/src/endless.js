import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FOREGROUND_LAYER } from "./cutaway.js";

export const CHUNK_LENGTH = 40;
const CHUNK_START = -32;
const BUILDINGS = ["cafe", "market", "arcade", "rowhouse", "bakery", "florist", "post", "bookshop", "studio", "metro"];
const PAVING = 0;
const STREET = 1;
const FOREGROUND = 2;

const chunkAt = (x) => Math.floor((x - CHUNK_START) / CHUNK_LENGTH);

function randomFor(seed, chunk) {
  let state = seed ^ Math.imul(chunk + 1, 0x9e3779b9);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let hash = Math.imul(state ^ (state >>> 15), state | 1);
    hash ^= hash + Math.imul(hash ^ (hash >>> 7), hash | 61);
    return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
  };
}

function layOutChunk(index, seed, catalog) {
  const random = randomFor(seed, index);
  const placements = [];
  const place = (module, x, y, z, batch, turn = 0, scale = 1) =>
    placements.push({ module, x, y, z, batch, turn, scale });
  place("road", CHUNK_LENGTH / 2, 0, 0, PAVING);
  if (random() < .62) place("crosswalk", 9 + 2 * Math.floor(random() * 12), 0, 0, PAVING);

  for (const side of [-1, 1]) {
    const near = side === 1;
    const turn = near ? Math.PI : 0;
    const batch = near ? FOREGROUND : STREET;
    for (let x = 1.25; x < CHUNK_LENGTH; x += 2.5) {
      place("sidewalk", x, 0, side * 4.606, PAVING, turn);
    }

    const row = [];
    const minimumGap = .66;
    let width = 0;
    while (true) {
      const scale = .87 + random() * .17;
      const fits = BUILDINGS.filter((name) =>
        catalog.get(name).width * scale + width + (row.length + 1) * minimumGap <= CHUNK_LENGTH);
      if (!fits.length) break;
      const variety = fits.filter((name) => name !== row.at(-1)?.name);
      const options = variety.length ? variety : fits;
      const name = options[Math.floor(random() * options.length)];
      const occupied = catalog.get(name).width * scale;
      row.push({ name, scale, occupied });
      width += occupied;
    }

    const gap = (CHUNK_LENGTH - width) / (row.length + 1);
    let edge = gap;
    for (const [slot, { name, scale, occupied }] of row.entries()) {
      const bounds = catalog.get(name).bounds;
      const x = edge - (near ? -bounds.max.x : bounds.min.x) * scale;
      const z = side * (5.2 + bounds.max.z * scale + random() * .55);
      place(name, x, .219, z, batch, turn, scale);
      const curbX = edge + occupied + gap * .5;
      const prop = random();
      if (slot < row.length - 1) {
        if (prop < .55) {
          place(prop < .26 ? "talltree" : "broadleaf", curbX, .219, side * 5.0, batch,
            random() * 2 * Math.PI, .82 + random() * .16);
        } else if (prop < .78) {
          place("lamp", curbX, .219, side * 3.94, batch, turn);
        } else {
          place(prop < .92 ? "bench" : "hydrant", curbX, .219, side * 4.99, STREET, turn);
        }
      }
      if (random() < .36) place("planter", edge + .5, .219, side * 4.63, STREET, turn);
      edge += occupied + gap;
    }
  }
  return placements;
}

export function createEndlessStreet(library) {
  const catalog = new Map();
  library.updateMatrixWorld(true);
  for (const root of library.children) {
    const parts = [];
    root.traverse((part) => {
      if (!part.isMesh) return;
      // The Blender modules use flat-color materials and share positions and normals.
      const geometry = new THREE.BufferGeometry();
      for (const name of ["position", "normal"]) geometry.setAttribute(name, part.geometry.getAttribute(name));
      geometry.setIndex(part.geometry.index);
      parts.push({ geometry, matrix: part.matrixWorld, material: part.material });
    });
    const bounds = new THREE.Box3().setFromObject(root);
    catalog.set(root.name, { parts, bounds, width: bounds.max.x - bounds.min.x });
  }

  const world = new THREE.Group();
  const chunks = new Map();
  const transform = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  let seed;

  function build(index) {
    const chunk = new THREE.Group();
    chunk.name = `Street chunk ${index}`;
    const batches = [new Map(), new Map(), new Map()];
    for (const placement of layOutChunk(index, seed, catalog)) {
      const { module, x, y, z, batch, turn, scale } = placement;
      transform.position.set(x, y, z);
      transform.rotation.y = turn;
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      for (const part of catalog.get(module).parts) {
        matrix.multiplyMatrices(transform.matrix, part.matrix);
        const geometry = part.geometry.clone().applyMatrix4(matrix);
        const groups = batches[batch];
        if (!groups.has(part.material)) groups.set(part.material, []);
        groups.get(part.material).push(geometry);
      }
    }
    for (const [batch, materials] of batches.entries()) {
      for (const [material, geometries] of materials) {
        const geometry = mergeGeometries(geometries);
        const surface = new THREE.Mesh(geometry, material);
        surface.receiveShadow = true;
        surface.castShadow = batch !== PAVING;
        if (batch === FOREGROUND) surface.layers.set(FOREGROUND_LAYER);
        chunk.add(surface);
      }
    }
    return chunk;
  }

  function remove(index, chunk) {
    world.remove(chunk);
    for (const mesh of chunk.children) mesh.geometry.dispose();
    chunks.delete(index);
  }

  return {
    world,
    reset(nextSeed) {
      if (seed === nextSeed) return;
      for (const [index, chunk] of chunks) remove(index, chunk);
      seed = nextSeed;
    },
    update(police, thief, origin) {
      const first = chunkAt(thief - 33);
      const last = chunkAt(thief + 54);
      const policeChunk = chunkAt(police);
      // Keep the area around the camera and the officer's current block.
      const needed = new Set([policeChunk]);
      for (let index = first; index <= last; index++) needed.add(index);
      let changed = false;
      for (const [index, chunk] of chunks) {
        if (!needed.has(index)) {
          remove(index, chunk);
          changed = true;
        }
      }
      for (const index of needed) {
        if (!chunks.has(index)) {
          const chunk = build(index);
          chunks.set(index, chunk);
          world.add(chunk);
          changed = true;
        }
        chunks.get(index).position.x = CHUNK_START + index * CHUNK_LENGTH - origin;
      }
      return changed;
    },
  };
}
