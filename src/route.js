export const CHUNK_LENGTH = 40;
export const STREET_HALF_DEPTH = 24;
const START = -32;
export const BEND_RADIUS = 6.5;
export const BEND_APPROACH = STREET_HALF_DEPTH - BEND_RADIUS;
export const BEND_ARC = Math.PI * BEND_RADIUS / 2;
export const BEND_LENGTH = 2 * BEND_APPROACH + BEND_ARC;

export function randomFor(seed, chunk) {
  let state = seed ^ Math.imul(chunk + 1, 0x9e3779b9);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let hash = Math.imul(state ^ (state >>> 15), state | 1);
    hash ^= hash + Math.imul(hash ^ (hash >>> 7), hash | 61);
    return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
  };
}

export function bendPoint(distance, turn) {
  if (distance <= BEND_APPROACH) return { x: distance, z: 0, dx: 1, dz: 0 };
  if (distance >= BEND_APPROACH + BEND_ARC) {
    return { x: STREET_HALF_DEPTH, z: turn * (distance - BEND_LENGTH + STREET_HALF_DEPTH), dx: 0, dz: turn };
  }
  const angle = (distance - BEND_APPROACH) / BEND_RADIUS;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return { x: BEND_APPROACH + BEND_RADIUS * sin, z: turn * BEND_RADIUS * (1 - cos), dx: cos, dz: turn * sin };
}

export function createRoute(seed) {
  const pieces = [];
  const random = randomFor(seed ^ 0x25ca13ce, 0);
  let x = START;
  let z = 0;
  let start = START;
  let dx = 1;
  let dz = 0;
  let block = 0;
  let straightLeft = 1;

  function append() {
    // Each sideways leg bends back toward +X, so later blocks cannot loop into earlier streets.
    const turn = straightLeft > 0 ? 0 : dx ? (random() < .5 ? -1 : 1) : -dz;
    const end = start + (turn ? BEND_LENGTH : CHUNK_LENGTH);
    pieces.push({ index: pieces.length, block, start, end, x, z, dx, dz, turn });
    if (turn) {
      x += STREET_HALF_DEPTH * (dx - dz * turn);
      z += STREET_HALF_DEPTH * (dz + dx * turn);
      [dx, dz] = [-dz * turn, dx * turn];
      straightLeft = (dx ? 2 : 1) + Math.floor(random() * 2);
    } else {
      x += dx * CHUNK_LENGTH;
      z += dz * CHUNK_LENGTH;
      block++;
      straightLeft--;
    }
    start = end;
  }

  function pieceAt(distance) {
    if (distance < START) {
      const index = Math.floor((distance - START) / CHUNK_LENGTH);
      const start = START + index * CHUNK_LENGTH;
      return { index, block: index, start, end: start + CHUNK_LENGTH, x: start, z: 0, dx: 1, dz: 0, turn: 0 };
    }
    while (start <= distance) append();
    let low = 0;
    let high = pieces.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (distance < pieces[middle].end) high = middle;
      else low = middle + 1;
    }
    return pieces[low];
  }

  function sample(distance, lane = 0) {
    const piece = pieceAt(distance);
    const offset = distance - piece.start;
    const local = piece.turn ? bendPoint(offset, piece.turn) : { x: offset, z: 0, dx: 1, dz: 0 };
    const dx = piece.dx * local.dx - piece.dz * local.dz;
    const dz = piece.dz * local.dx + piece.dx * local.dz;
    return {
      x: piece.x + piece.dx * local.x - piece.dz * local.z - dz * lane,
      z: piece.z + piece.dz * local.x + piece.dx * local.z + dx * lane,
      dx, dz,
    };
  }

  return { pieceAt, sample };
}
