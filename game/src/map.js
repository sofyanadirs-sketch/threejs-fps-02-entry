// Pasar Senja — the map as data. Everything the simulation needs (colliders,
// sites, spawns, waypoints) lives here; world.js only draws it. North is -z:
// the two bomb sites sit at the north end, the attackers spawn in the south.
// Units are metres. A collider is [cx, cy, cz, w, h, d] (centre + size).
export const MAP = {
  bounds: { minX: -28, maxX: 28, minZ: -18, maxZ: 18, wallH: 4.2 },
  sites: {
    A: { name: 'Gerobak Bakso', x: 20, z: -12, r: 4.2, dy: 1.85 },
    B: { name: 'Lapak Sate', x: -20, z: -12, r: 4.2, dy: 1.65 },
  },
  spawns: {
    atk: [
      { x: -4, z: 14.5, yaw: 0 }, { x: -1.5, z: 15, yaw: 0 },
      { x: 1.5, z: 15, yaw: 0 }, { x: 4, z: 14.5, yaw: 0 },
    ],
    def: [
      { x: -6, z: -14.5, yaw: Math.PI }, { x: -2, z: -15, yaw: Math.PI },
      { x: 2, z: -15, yaw: Math.PI }, { x: 6, z: -14.5, yaw: Math.PI },
    ],
  },
  // Boxes: stalls, carts, crates, stage, trees. Tall enough to block sightlines
  // where noted; low crates (h <= 1.1) are crouch cover you can shoot over.
  boxes: [
    // perimeter walls
    [-28.2, 2.1, 0, 0.4, 4.2, 36.4, 'wall'],
    [28.2, 2.1, 0, 0.4, 4.2, 36.4, 'wall'],
    [0, 2.1, -18.2, 56.4, 4.2, 0.4, 'wall'],
    [0, 2.1, 18.2, 56.4, 4.2, 0.4, 'wall'],
    // south market row (stalls you weave between)
    [-16, 1.1, 6, 4, 2.2, 2, 'stall'],
    [-8, 1.1, 6, 4, 2.2, 2, 'stall'],
    [8, 1.1, 6, 4, 2.2, 2, 'stall'],
    [16, 1.1, 6, 4, 2.2, 2, 'stall'],
    // north market row, leaving mid open
    [-20, 1.1, -4, 4, 2.2, 2, 'stall'],
    [-12, 1.1, -4, 4, 2.2, 2, 'stall'],
    [12, 1.1, -4, 4, 2.2, 2, 'stall'],
    [20, 1.1, -4, 4, 2.2, 2, 'stall'],
    // the two bomb sites: a bakso cart and a sate grill
    [20, 0.7, -12, 2.6, 1.4, 1.6, 'cart'],
    [-20, 0.6, -12, 2.6, 1.2, 1.6, 'grill'],
    // Panggung Dangdut — the mid stage, east of the mid lane so the lane stays open
    [8, 0.5, -2, 8, 1, 5, 'stage'],
    // crates: low cover in the lanes, kept off the waypoint lines
    [-21, 0.55, 4, 1.6, 1.1, 1.6, 'crate'],
    [21, 0.55, 4, 1.6, 1.1, 1.6, 'crate'],
    [-20, 0.55, -6, 1.6, 1.1, 1.6, 'crate'],
    [20, 0.55, -6, 1.6, 1.1, 1.6, 'crate'],
    [-6, 0.55, -3, 1.6, 1.1, 1.6, 'crate'],
    [6, 0.55, -3, 1.6, 1.1, 1.6, 'crate'],
    [-14, 0.8, 10, 1.2, 1.6, 1.2, 'crate'],
    [14, 0.8, 10, 1.2, 1.6, 1.2, 'crate'],
    [-10, 0.55, -10, 1.6, 1.1, 1.6, 'crate'],
    [10, 0.55, -10, 1.6, 1.1, 1.6, 'crate'],
    // spawn gates: tall warung blocks right in front of each spawn, so the two
    // teams cannot see or shoot each other from spawn to spawn
    [0, 1.7, 11.5, 10, 3.4, 2, 'tall'],
    [0, 1.7, -11.5, 10, 3.4, 2, 'tall'],
    // banana trees (trunks block movement, canopies are above head height)
    [-26, 1.4, -16, 0.7, 2.8, 0.7, 'trunk'],
    [26, 1.4, -16, 0.7, 2.8, 0.7, 'trunk'],
    [-26, 1.4, 16, 0.7, 2.8, 0.7, 'trunk'],
    [26, 1.4, 16, 0.7, 2.8, 0.7, 'trunk'],
  ],
  // Waypoint graph for bots. Straight lines between neighbours are clear of boxes.
  waypoints: {
    spawnA: { x: 0, z: 14, n: ['westS', 'eastS'] },
    spawnD: { x: 0, z: -14, n: ['defA', 'defB'] },
    midS: { x: 0, z: 8, n: ['center', 'marketW', 'marketE', 'westS', 'eastS'] },
    center: { x: 0, z: 0, n: ['midS', 'midN', 'westM', 'eastM', 'panggungW'] },
    midN: { x: 0, z: -7, n: ['center', 'aApproach', 'bApproach', 'defA', 'defB', 'panggungE'] },
    westS: { x: -24, z: 10, n: ['spawnA', 'westM', 'marketW'] },
    westM: { x: -24, z: 0, n: ['westS', 'westN', 'center', 'marketW'] },
    westN: { x: -24, z: -10, n: ['westM', 'bApproach', 'bSite', 'defB'] },
    eastS: { x: 24, z: 10, n: ['spawnA', 'eastM', 'marketE'] },
    eastM: { x: 24, z: 0, n: ['eastS', 'eastN', 'center', 'marketE'] },
    eastN: { x: 24, z: -10, n: ['eastM', 'aApproach', 'aSite', 'defA'] },
    marketW: { x: -12, z: 6, n: ['midS', 'westS', 'westM', 'marketE'] },
    marketE: { x: 12, z: 6, n: ['midS', 'eastS', 'eastM', 'marketW'] },
    panggungW: { x: -8, z: -2, n: ['center', 'bApproach', 'westM'] },
    panggungE: { x: 15, z: -7, n: ['midN', 'aApproach', 'eastM'] },
    aApproach: { x: 14, z: -8, n: ['midN', 'aSite', 'eastN', 'panggungE'] },
    aSite: { x: 20, z: -12, n: ['aApproach', 'eastN', 'defA'] },
    bApproach: { x: -14, z: -8, n: ['midN', 'bSite', 'westN', 'panggungW'] },
    bSite: { x: -20, z: -12, n: ['bApproach', 'westN', 'defB'] },
    defA: { x: 16, z: -14, n: ['spawnD', 'aSite', 'eastN'] },
    defB: { x: -16, z: -14, n: ['spawnD', 'bSite', 'westN'] },
    aHold: { x: 15, z: -6, n: ['aApproach', 'eastM'] },
    bHold: { x: -15, z: -6, n: ['bApproach', 'westM'] },
  },
  // Where defenders like to stand (waypoint name + facing yaw).
  defHolds: [
    { wp: 'aSite', yaw: Math.PI * 0.75 }, { wp: 'bSite', yaw: Math.PI * 0.25 },
    { wp: 'aHold', yaw: Math.PI }, { wp: 'bHold', yaw: Math.PI },
    { wp: 'midN', yaw: 0 }, { wp: 'defA', yaw: Math.PI * 0.5 },
    { wp: 'defB', yaw: Math.PI * 0.5 }, { wp: 'panggungE', yaw: Math.PI * 0.5 },
  ],
};

// Breadth-first shortest path over the waypoint graph. Returns an array of
// waypoint names from `from` to `to` (excluding `from`, including `to`).
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of MAP.waypoints[cur].n) {
      if (prev[next] !== undefined) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = cur;
        while (node !== null) {
          path.unshift(node);
          node = prev[node];
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [to];
}

// Nearest waypoint to a point (for bots that start off-graph).
export function nearestWaypoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [name, wp] of Object.entries(MAP.waypoints)) {
    const d = (wp.x - x) ** 2 + (wp.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
