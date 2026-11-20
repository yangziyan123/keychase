import * as THREE from "three";
import { BEND_APPROACH, BEND_ARC, BEND_LENGTH, STREET_HALF_DEPTH, bendPoint } from "./route.js";

const ROAD_EDGE = 3.52;
const WALK_EDGE = 5.726;
const BEND_WIDTH = STREET_HALF_DEPTH * 2;

function pathBetween(from, to, turn) {
  const path = [bendPoint(from, turn)];
  for (let i = 0; i <= 20; i++) {
    const distance = BEND_APPROACH + BEND_ARC * i / 20;
    if (distance > from && distance < to) path.push(bendPoint(distance, turn));
  }
  path.push(bendPoint(to, turn));
  return path;
}

const offset = ({ x, z, dx, dz }, distance) => [x - dz * distance, z + dx * distance];

export function bendPaving(turn, catalog) {
  const materials = new Map(["road", "sidewalk"].flatMap((key) =>
    catalog.get(key).parts.map(({ material }) => [material.name.split(/ [·|] /).at(-1), material])));
  const batches = new Map();

  function triangle(finish, height, a, b, c) {
    if (!batches.has(finish)) batches.set(finish, []);
    const positions = batches.get(finish);
    const upward = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    for (const [x, z] of upward > 0 ? [a, b, c] : [a, c, b]) positions.push(x, height, z);
  }

  function polygon(finish, height, points) {
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      triangle(finish, height, points[a], points[b], points[c]);
    }
  }

  function ribbon(finish, height, path, left, right) {
    for (let i = 1; i < path.length; i++) {
      const a = offset(path[i - 1], left);
      const b = offset(path[i - 1], right);
      const c = offset(path[i], left);
      const d = offset(path[i], right);
      triangle(finish, height, a, b, c);
      triangle(finish, height, b, d, c);
    }
  }

  const edge = STREET_HALF_DEPTH;
  const path = pathBetween(0, BEND_LENGTH, turn);
  polygon("sand", -.01, [[0, -edge], [BEND_WIDTH, -edge], [BEND_WIDTH, edge], [0, edge]]);
  ribbon("asphalt", .028, path, -ROAD_EDGE, ROAD_EDGE);
  polygon("courtyard", .217, [...path.map((point) => offset(point, turn * WALK_EDGE)), [0, turn * edge]]);
  polygon("courtyard", .217, [...path.map((point) => offset(point, -turn * WALK_EDGE)),
    [BEND_WIDTH, turn * edge], [BEND_WIDTH, -turn * edge], [0, -turn * edge]]);

  for (const side of [-1, 1]) {
    ribbon("mortar", .249, path, side * ROAD_EDGE, side * WALK_EDGE);
    const finishes = ["paver", "paver cool", "paver", "paver hot", "paver", "chalk"];
    for (let i = 0; i < 46; i++) {
      const segment = pathBetween((i + .026) * BEND_LENGTH / 46, (i + .974) * BEND_LENGTH / 46, turn);
      for (let tile = 0; tile < 4; tile++) {
        const left = ROAD_EDGE + (WALK_EDGE - ROAD_EDGE) * (tile + .025) / 4;
        const right = ROAD_EDGE + (WALK_EDGE - ROAD_EDGE) * (tile + .975) / 4;
        ribbon(finishes[(i * 13 + tile * 17 + side + 1) % finishes.length], .25, segment, side * left, side * right);
      }
    }
  }
  for (let d = 1; d < BEND_LENGTH - .65; d += 2) {
    ribbon("stripe", .041, pathBetween(d - .47, d + .47, turn), -.0365, .0365);
  }

  return [...batches].map(([finish, positions]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials.get(finish));
    mesh.receiveShadow = true;
    return mesh;
  });
}
