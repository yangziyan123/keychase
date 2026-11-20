import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bendPaving } from "./bend.js";
import { FOREGROUND_LAYER } from "./cutaway.js";
import { BEND_APPROACH, BEND_RADIUS, CHUNK_LENGTH, STREET_HALF_DEPTH, randomFor } from "./route.js";

const LANDMARK_INTERVAL = 3;
const RESIDENTIAL_ROLES = ["cottage", "apartment", "villa", "courtyard"];
const HALF_FOOTPRINT_ROLES = new Set(["cottage", "villa", "courtyard"]);
const BUILDING_GAP = .25;
const BUILDING_FRONTAGE = 5.75;
const BUILDING_DEPTH = STREET_HALF_DEPTH - BUILDING_FRONTAGE + BUILDING_GAP / 2;
const MIN_FILL_SCALE = .74;
const MIN_STOREFRONT_SCALE = .82;
const LANDMARK_DEPTH = 15.5;
const LANDMARK_MAX_HEIGHT = 14;
const PAVING = 0;
const STREET = 1;
const FOREGROUND = 2;

const pick = (options, random) => options[Math.floor(random() * options.length)];

function landmarkOrder(names, seed) {
  const order = [...names];
  const random = randomFor(seed ^ 0x8e41c65a, 0);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function landmarkAt(index, seed, order) {
  const group = Math.floor(index / LANDMARK_INTERVAL);
  const offset = group !== 0 && randomFor(seed ^ 0x53c78ab1, group)() < .5 ? 1 : 0;
  if (index !== group * LANDMARK_INTERVAL + offset) return undefined;
  // Deal each landmark once per cycle. The same model is at least 35 blocks away.
  return order[THREE.MathUtils.euclideanModulo(group, order.length)];
}

function buildingDistrict(catalog, roles, preferredRole, heightLimit, used, random) {
  const storefronts = roles.get("storefront").map((name) => {
    const { width, depth } = catalog.get(name);
    return { name, role: "storefront", width, depth };
  });
  const houses = RESIDENTIAL_ROLES.flatMap((role) => roles.get(role).map((name) => {
    const { width, depth, height } = catalog.get(name);
    return { name, role, width, depth, heightLimit: heightLimit / height,
      houseScale: HALF_FOOTPRINT_ROLES.has(role) ? Math.SQRT1_2 : 1 };
  }));
  return { buildings: [...houses, ...storefronts], storefronts, preferredRole, used, random };
}

function buildingScale(building, scale) {
  return building.role === "storefront" ? scale : Math.min(scale * .90, building.heightLimit) * building.houseScale;
}

function varietyCost(building, { used, preferredRole }, preferHouse) {
  const house = building.role !== "storefront";
  return (used.get(building.name) ?? 0) * 1.1 + (house !== preferHouse ? .24 : 0)
    + (house && building.role !== preferredRole ? .28 : 0);
}

const countBuilding = (used, name) => used.set(name, (used.get(name) ?? 0) + 1);

function fillFrontage(district, start, end, block) {
  const { buildings, storefronts, used, random } = district;
  const minimumStoreWidth = MIN_STOREFRONT_SCALE * Math.min(...storefronts.map(({ width }) => width));
  const row = [];
  let remaining = end - start;
  while (true) {
    const scale = .87 + random() * .13;
    const available = remaining - minimumStoreWidth - 2 * BUILDING_GAP;
    const previous = row.at(-1)?.name;
    const preferHouse = random() < .72;
    let next;
    for (const building of buildings) {
      const size = buildingScale(building, scale);
      const occupied = building.width * size;
      if (occupied > available) continue;
      const score = varietyCost(building, district, preferHouse) + (building.name === previous ? 1 : 0) + random() * .35;
      if (!next || score < next.score) next = { name: building.name, scale: size, occupied, score };
    }
    if (!next) break;
    row.push(next);
    countBuilding(used, next.name);
    remaining -= next.occupied + BUILDING_GAP;
  }

  // Fit one storefront to the remaining width so all gaps stay fixed, including chunk seams.
  const occupied = remaining - BUILDING_GAP;
  const fillers = storefronts.map(({ name, width }) => {
    const scale = occupied / width;
    const fit = scale + 1e-7 >= MIN_STOREFRONT_SCALE && scale <= 1.14 ? (used.get(name) ?? 0) * .14 : 100;
    return { name, scale, occupied, score: fit + Math.abs(Math.log(scale)) + random() * .08 };
  });
  const filler = fillers.reduce((best, next) => next.score < best.score ? next : best);
  const slots = Array.from({ length: row.length + 1 }, (_, slot) => slot)
    .filter((slot) => row[slot - 1]?.name !== filler.name && row[slot]?.name !== filler.name);
  row.splice(slots.length ? pick(slots, random) : row.length, 0, filler);
  countBuilding(used, filler.name);

  // Neighboring blocks favor different models at the seam, even when both rows use the same catalog.
  const edgeModels = new Set(buildings.filter((_, index) => (index & 1) === (block & 1)).map(({ name }) => name));
  function arrangeEdge(edge, reserved) {
    if (edgeModels.has(row[edge].name)) return;
    const neighbor = row[edge === 0 ? 1 : edge - 1]?.name;
    const replacement = row.findIndex(({ name }, index) => index !== reserved && name !== neighbor && edgeModels.has(name));
    if (replacement >= 0) [row[edge], row[replacement]] = [row[replacement], row[edge]];
  }
  if (start === 0) arrangeEdge(0);
  if (end === CHUNK_LENGTH) arrangeEdge(row.length - 1, start === 0 ? 0 : undefined);

  let left = start + BUILDING_GAP / 2;
  return row.map(({ name, scale, occupied }, index) => {
    const building = { name, scale, occupied, left, hasNext: index < row.length - 1 };
    left += occupied + BUILDING_GAP;
    return building;
  });
}

const lotArea = ({ left, right, front, back }) => (right - left) * (back - front);

function reserveLot(free, occupied) {
  const remaining = [];
  for (const lot of free) {
    if (occupied.right <= lot.left || occupied.left >= lot.right
        || occupied.back <= lot.front || occupied.front >= lot.back) {
      remaining.push(lot);
      continue;
    }

    // Keep the full empty rectangle on each side so the next building can bridge adjoining gaps.
    if (occupied.left > lot.left) remaining.push({ ...lot, right: occupied.left });
    if (occupied.right < lot.right) remaining.push({ ...lot, left: occupied.right });
    if (occupied.front > lot.front) remaining.push({ ...lot, back: occupied.front });
    if (occupied.back < lot.back) remaining.push({ ...lot, front: occupied.back });
  }

  remaining.sort((a, b) => lotArea(b) - lotArea(a));
  return remaining.filter((lot, index) => !remaining.some((other, i) => i < index &&
    other.left <= lot.left && other.right >= lot.right && other.front <= lot.front && other.back >= lot.back));
}

function fillInterior(free, district) {
  const { buildings, used, random } = district;
  const candidates = buildings.map((building) => ({ ...building, scale: buildingScale(building, 1) }));
  const packed = [];
  while (free.length) {
    const preferHouse = random() < .72;
    let best;
    for (const candidate of candidates) {
      const { name, width, depth } = candidate;
      const style = varietyCost(candidate, district, preferHouse) + random() * .08;
      for (const lot of free) {
        const scale = Math.min(candidate.scale,
          (lot.right - lot.left - BUILDING_GAP) / width, (lot.back - lot.front - BUILDING_GAP) / depth);
        if (scale < candidate.scale * MIN_FILL_SCALE) continue;
        const occupied = {
          left: lot.left, right: lot.left + width * scale + BUILDING_GAP,
          front: lot.front, back: lot.front + depth * scale + BUILDING_GAP,
        };
        const score = 1 - lotArea(occupied) / lotArea(lot) + .36 * (1 - scale / candidate.scale) + style;
        if (!best || score < best.score) best = { name, scale, occupied, score };
      }
    }
    if (!best) break;
    const { name, scale, occupied } = best;
    packed.push({ name, scale, left: occupied.left + BUILDING_GAP / 2, front: occupied.front });
    countBuilding(used, name);
    free = reserveLot(free, occupied);
  }
  return packed;
}

function layOutChunk(index, seed, catalog, roles, landmarks, foregroundSide) {
  const random = randomFor(seed, index);
  const placements = [];
  const place = (module, x, y, z, batch, turn = 0, scale = 1, heightScale = scale) =>
    placements.push({ module, x, y, z, batch, turn, scale, heightScale });
  const used = new Map();
  place("road", CHUNK_LENGTH / 2, 0, 0, PAVING);
  const crosswalk = random() < .62 ? 9 + 2 * Math.floor(random() * 12) : undefined;
  if (crosswalk !== undefined) place("crosswalk", crosswalk, 0, 0, PAVING);

  for (const side of [-1, 1]) {
    const near = side === 1;
    const turn = near ? Math.PI : 0;
    const foreground = side === foregroundSide;
    const batch = foreground ? FOREGROUND : STREET;
    const placeBuilding = ({ name, left, front, scale, heightScale = scale }) => {
      const { bounds } = catalog.get(name);
      const x = left - (near ? -bounds.max.x : bounds.min.x) * scale;
      const z = side * (BUILDING_FRONTAGE + front + bounds.max.z * scale);
      place(name, x, .219, z, batch, turn, scale, heightScale);
    };
    const landmark = foreground ? undefined : landmarkAt(index, seed, landmarks);
    let sections = [[0, CHUNK_LENGTH]];
    let free = [{ left: 0, right: CHUNK_LENGTH, front: 0, back: BUILDING_DEPTH }];
    if (landmark) {
      const { width, height, depth } = catalog.get(landmark);
      const scale = LANDMARK_DEPTH / depth;
      const left = (CHUNK_LENGTH - width * scale) / 2;
      const right = CHUNK_LENGTH - left;
      const plot = { left: left - BUILDING_GAP / 2, right: right + BUILDING_GAP / 2, front: 0, back: BUILDING_DEPTH };
      sections = [[0, plot.left], [plot.right, CHUNK_LENGTH]];
      free = reserveLot(free, plot);
      placeBuilding({ name: landmark, left, front: 0, scale, heightScale: Math.min(scale, LANDMARK_MAX_HEIGHT / height) });
    }

    for (let x = 1.25; x < CHUNK_LENGTH; x += 2.5) {
      place("sidewalk", x, 0, side * 4.606, PAVING, turn);
    }
    if (crosswalk !== undefined) {
      place("traffic-signal", crosswalk + side * 2.3, .25, side * 4.02, batch, turn + Math.PI / 2);
      for (const offset of [-1.38, 1.38]) {
        place("bollard", crosswalk + offset, .25, side * 3.83, STREET);
      }
    }

    // Carry the neighborhood style across blocks and prefer different models within each block.
    const neighborhood = randomFor(seed ^ (near ? 0x72c9b351 : 0x4b218fed), Math.floor(index / 2));
    const role = pick(RESIDENTIAL_ROLES, neighborhood);
    const district = buildingDistrict(catalog, roles, role, foreground ? 6.3 : 9.4, used, random);
    const frontage = sections.flatMap(([start, end]) => fillFrontage(district, start, end, index));
    for (const { name, scale, occupied, left, hasNext } of frontage) {
      placeBuilding({ name, left, front: 0, scale });
      free = reserveLot(free, {
        left: left - BUILDING_GAP / 2, right: left + occupied + BUILDING_GAP / 2,
        front: 0, back: catalog.get(name).depth * scale + BUILDING_GAP,
      });

      const curbX = left + occupied + BUILDING_GAP / 2;
      if (hasNext && (crosswalk === undefined || Math.abs(curbX - crosswalk) > 3.2)) {
        const prop = random();
        if (prop < .49) {
          place(prop < .23 ? "talltree" : "broadleaf", curbX, .25, side * 4.82, batch,
            random() * 2 * Math.PI, .76 + random() * .10);
        } else if (prop < .64) {
          place("lamp", curbX, .25, side * 3.94, batch, turn);
        } else {
          const furniture = prop < .79 ? "bench" : prop < .90 ? "hydrant" : "mailbox";
          place(furniture, curbX, .25, side * 4.93, STREET, turn);
        }
      }
      const planterX = left + occupied / 2;
      if ((crosswalk === undefined || Math.abs(planterX - crosswalk) > 3.2) && random() < .32) {
        place("planter", planterX, .25, side * 5.16, STREET, turn);
      }
    }
    const interiorRandom = randomFor(seed ^ (near ? 0x346beda1 : 0x672bd4fb), index);
    for (const building of fillInterior(free, { ...district, random: interiorRandom })) placeBuilding(building);
  }
  return placements;
}

function layOutBend(piece, seed, catalog, roles) {
  const random = randomFor(seed ^ 0xed93854a, piece.index);
  const role = pick(RESIDENTIAL_ROLES, random);
  const district = buildingDistrict(catalog, roles, role, 6.3, new Map(), random);
  const edge = STREET_HALF_DEPTH;
  const curb = BUILDING_FRONTAGE - BUILDING_GAP / 2;
  const cameraX = 15 * piece.dx + 30 * piece.dz;
  const cameraZ = 30 * piece.dx - 15 * piece.dz;

  // Pack in coordinates relative to each road leg so every facade opens onto a road.
  const entrance = [-piece.turn, piece.turn].flatMap((side) => {
    const inside = side === piece.turn;
    const lot = { left: 0, right: inside ? BEND_APPROACH : edge, front: curb, back: edge };
    const foreground = cameraZ * side > 0 || (inside && cameraX < 0);
    return fillInterior([lot], district).map(({ name, left, front, scale }) => {
      const { bounds } = catalog.get(name);
      return {
        module: name, y: .219, scale, heightScale: scale,
        x: left - (side > 0 ? -bounds.max.x : bounds.min.x) * scale,
        z: side * (front + BUILDING_GAP / 2 + bounds.max.z * scale),
        batch: foreground ? FOREGROUND : STREET, turn: side > 0 ? Math.PI : 0,
      };
    });
  });

  const exitLot = { left: 0, right: edge, front: curb, back: edge };
  const exit = fillInterior([exitLot], district).map(({ name, left, front, scale }) => {
    const { bounds } = catalog.get(name);
    return {
      module: name, y: .219, scale, heightScale: scale,
      x: edge + front + BUILDING_GAP / 2 + bounds.max.z * scale,
      z: piece.turn * left - (piece.turn > 0 ? bounds.min.x : bounds.max.x) * scale,
      batch: cameraX > 0 ? FOREGROUND : STREET, turn: -Math.PI / 2,
    };
  });

  // The outside corner faces the arc along its midpoint normal.
  const diagonal = Math.SQRT1_2;
  const apexX = BEND_APPROACH + BEND_RADIUS * diagonal;
  const apexZ = BEND_RADIUS * (1 - diagonal);
  const halfWidth = BEND_RADIUS * diagonal;
  const cornerLot = {
    left: -halfWidth, right: halfWidth,
    front: (edge - apexX) / diagonal + halfWidth,
    back: (2 * edge - apexX) / diagonal - halfWidth,
  };
  const corner = fillInterior([cornerLot], district).map(({ name, left, front, scale }) => {
    const { bounds } = catalog.get(name);
    const along = left - (piece.turn > 0 ? bounds.min.x : -bounds.max.x) * scale;
    const outward = front + BUILDING_GAP / 2 + bounds.max.z * scale;
    return {
      module: name, y: .219, scale, heightScale: scale,
      x: apexX + diagonal * (along + outward),
      z: piece.turn * (apexZ + diagonal * (along - outward)),
      batch: cameraX - cameraZ * piece.turn > 0 ? FOREGROUND : STREET,
      turn: Math.atan2(-1, piece.turn),
    };
  });
  return [...entrance, ...exit, ...corner];
}

export function createEndlessStreet(library) {
  const catalog = new Map();
  const roles = new Map();
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
    const size = bounds.getSize(new THREE.Vector3());
    catalog.set(root.name, { parts, bounds, width: size.x, height: size.y, depth: size.z });
    const role = root.userData.streetRole;
    if (role) {
      if (!roles.has(role)) roles.set(role, []);
      roles.get(role).push(root.name);
    }
  }

  const world = new THREE.Group();
  const chunks = new Map();
  const transform = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  let seed;
  let landmarks;

  function build(piece) {
    const chunk = new THREE.Group();
    chunk.name = `Street chunk ${piece.index}`;
    chunk.rotation.y = Math.atan2(-piece.dz, piece.dx);
    if (piece.turn) chunk.add(...bendPaving(piece.turn, catalog));
    const placements = piece.turn
      ? layOutBend(piece, seed, catalog, roles)
      : layOutChunk(piece.block, seed, catalog, roles, landmarks, piece.dz > 0 ? -1 : 1);
    const batches = [new Map(), new Map(), new Map()];
    for (const placement of placements) {
      const { module, x, y, z, batch, turn, scale, heightScale } = placement;
      transform.position.set(x, y, z);
      transform.rotation.y = turn;
      transform.scale.set(scale, heightScale, scale);
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
      landmarks = landmarkOrder(roles.get("landmark"), seed);
    },
    update(route, police, first, last, origin) {
      const policePiece = route.pieceAt(police);
      // Keep the area around the camera and the officer's current block.
      const needed = new Map([[policePiece.index, policePiece]]);
      for (let piece = route.pieceAt(first); piece.start <= last; piece = route.pieceAt(piece.end)) {
        needed.set(piece.index, piece);
      }
      let changed = false;
      for (const [index, chunk] of chunks) {
        if (!needed.has(index)) {
          remove(index, chunk);
          changed = true;
        }
      }
      for (const [index, piece] of needed) {
        if (!chunks.has(index)) {
          const chunk = build(piece);
          chunks.set(index, chunk);
          world.add(chunk);
          changed = true;
        }
        chunks.get(index).position.set(piece.x - origin.x, 0, piece.z - origin.z);
      }
      return changed;
    },
  };
}
