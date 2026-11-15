// RUSTLINE YARD — an original foundry yard, not a copy of any commercial map.
// Two bomb sites (A FURNACE west, B DEPOT east), three lanes (A-long, mid,
// B-long), a connector gallery between them. Built from boxes and cylinders
// only, no models and no textures. Every solid is a collider for movement
// and a surface a bullet stops on. The waypoint graph is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HALF_X = 24;
const HALF_Z = 20;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'rust' ? 0.6 : 0.92,
      metalness: name === 'steel' ? 0.35 : 0.05,
    });
  }
  const beaconA = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber),
    emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.1,
  });
  const beaconB = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal),
    emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.1,
  });

  const colliders = [];
  const shootables = [];

  function addCollider(cx, cy, cz, hx, hy, hz) {
    const box = new THREE.Box3(
      new THREE.Vector3(cx - hx, cy - hy, cz - hz),
      new THREE.Vector3(cx + hx, cy + hy, cz + hz),
    );
    colliders.push(box);
    return box;
  }

  function box(w, h, d, x, y, z, material, collider = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.solid = true;
    group.add(mesh);
    shootables.push(mesh);
    if (collider) addCollider(x, y, z, w / 2, h / 2, d / 2);
    return mesh;
  }

  function cyl(radius, height, x, y, z, material, axis = 'y') {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), materials[material]);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.solid = true;
    group.add(mesh);
    shootables.push(mesh);
    if (axis === 'y') addCollider(x, y, z, radius, height / 2, radius);
    else if (axis === 'x') addCollider(x, y, z, height / 2, radius, radius);
    else addCollider(x, y, z, radius, radius, height / 2);
    return mesh;
  }

  // Ground and perimeter. The yard is open to the dusk sky.
  box(48.6, 0.4, 40.6, 0, -0.2, 0, 'ground');
  box(0.6, 4.6, 40.6, -HALF_X - 0.3, 2.3, 0, 'concrete');
  box(0.6, 4.6, 40.6, HALF_X + 0.3, 2.3, 0, 'concrete');
  box(49.2, 4.6, 0.6, 0, 2.3, -HALF_Z - 0.3, 'concrete');
  box(49.2, 4.6, 0.6, 0, 2.3, HALF_Z + 0.3, 'concrete');
  // Floor seams: thin dark joints that read as concrete panels.
  for (const z of [-10, 0, 10]) box(48, 0.02, 0.12, 0, 0.01, z, 'steel', false);
  for (const x of [-12, 0, 12]) box(0.12, 0.02, 40, x, 0.01, 0, 'steel', false);

  // ---- Site A: FURNACE (west). Plant spot is the open yard east of it. ----
  box(5, 5.5, 4, -18.5, 2.75, -14.5, 'rust');
  cyl(0.9, 7, -19.5, 3.5, -16, 'steel');
  box(1.3, 1.3, 1.3, -12.5, 0.65, -9.5, 'steel');
  box(1.3, 1.3, 1.3, -15.5, 0.65, -9.5, 'steel');
  box(1.3, 1.3, 1.3, -12, 0.65, -14.5, 'steel');
  box(1.3, 1.3, 1.3, -12, 1.95, -14.5, 'rust');
  box(3, 1.1, 0.6, -14, 0.55, -12.5, 'concrete');
  cyl(0.35, 12, -23.2, 2.2, -6, 'steel', 'z');
  cyl(0.5, 1.1, -20.5, 0.55, -10, 'amber');
  cyl(0.5, 1.1, -21.5, 0.55, -16, 'rust');

  // ---- Site B: DEPOT (east). Plant spot is the open yard south of the silo. ----
  cyl(2.2, 6.5, 18.5, 3.25, -15.5, 'steel');
  box(5, 2.6, 2.2, 12.5, 1.3, -10, 'rust');
  box(2.2, 2.6, 5, 19.5, 1.3, -11, 'steel');
  box(1.3, 1.3, 1.3, 13, 0.65, -14, 'steel');
  box(1.3, 1.3, 1.3, 16.5, 0.65, -9.5, 'steel');
  box(1.3, 1.3, 1.3, 18, 0.65, -9.5, 'amber');
  box(3, 1.1, 0.6, 14, 0.55, -12.5, 'concrete');
  cyl(0.5, 1.1, 20.5, 0.55, -10, 'teal');
  cyl(0.5, 1.1, 12.5, 0.55, -16, 'steel');

  // ---- Mid: the foundry hall ----
  box(2.2, 4.6, 2.2, 0, 2.3, 1, 'concrete');
  box(4, 1.0, 0.6, -2.5, 0.5, 5.5, 'concrete');
  box(4, 1.0, 0.6, 2.5, 0.5, -3.5, 'concrete');
  box(2.2, 2.2, 4, 6, 1.1, 2, 'rust');
  box(1.3, 1.3, 1.3, -4, 0.65, 2, 'steel');
  box(1.3, 1.3, 1.3, 4, 0.65, -1, 'steel');
  box(1.3, 1.3, 1.3, -5.5, 0.65, -4, 'amber');
  cyl(0.5, 1.1, -7, 0.55, 7, 'rust');
  cyl(0.5, 1.1, 7.5, 0.55, -5, 'steel');

  // ---- A-long and B-long cover ----
  box(1.3, 1.3, 1.3, -19, 0.65, 4, 'steel');
  box(1.3, 1.3, 1.3, -17.5, 0.65, 0, 'steel');
  box(1.3, 1.3, 1.3, -20, 0.65, 10, 'rust');
  box(1.3, 1.3, 1.3, -16, 0.65, 12, 'steel');
  box(0.6, 1.1, 4, -18, 0.55, 8, 'concrete');
  box(1.3, 1.3, 1.3, 19, 0.65, 4, 'steel');
  box(1.3, 1.3, 1.3, 17.5, 0.65, 0, 'steel');
  box(1.3, 1.3, 1.3, 20, 0.65, 10, 'rust');
  box(1.3, 1.3, 1.3, 16, 0.65, 12, 'steel');
  box(0.6, 1.1, 4, 18, 0.55, 8, 'concrete');

  // ---- Connector gallery: a wall with two doorways at x -7..-5 and 5..7 ----
  box(4, 3, 0.6, -9, 1.5, -6, 'concrete');
  box(10, 3, 0.6, 0, 1.5, -6, 'concrete');
  box(4, 3, 0.6, 9, 1.5, -6, 'concrete');
  box(0.5, 0.5, 0.5, -7, 3.25, -6, 'amber', false);
  box(0.5, 0.5, 0.5, 7, 3.25, -6, 'teal', false);

  // ---- Spawn cover ----
  box(3, 1.0, 0.6, -4, 0.5, 14, 'concrete');
  box(3, 1.0, 0.6, 4, 0.5, 14, 'concrete');
  box(1.3, 1.3, 1.3, -7, 0.65, 18.5, 'steel');
  box(3, 1.0, 0.6, -4, 0.5, -14, 'concrete');
  box(3, 1.0, 0.6, 4, 0.5, -14, 'concrete');

  // ---- Site beacons: glowing pylons and ground rings ----
  function beacon(x, z, material, ringColor) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), material);
    pylon.position.set(x, 1.3, z);
    group.add(pylon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 40),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);
  }
  beacon(-14, -11, beaconA, new THREE.Color(PALETTE.amber));
  beacon(15.5, -13.5, beaconB, new THREE.Color(PALETTE.teal));

  // ---- Distant skyline silhouettes, outside the playable yard ----
  box(10, 9, 6, -30, 4.5, -26, 'steel', false);
  box(7, 13, 7, 6, 6.5, -30, 'steel', false);
  box(12, 7, 5, 28, 3.5, -28, 'steel', false);
  box(8, 11, 6, -34, 5.5, 8, 'steel', false);
  box(9, 8, 6, 32, 4, 10, 'steel', false);

  // ---- Light: a low warm sun, a cool fill, a dusk sky ----
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a97a8'), new THREE.Color('#2a2620'), 0.95);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.6);
  sun.position.set(18, 24, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a8fb0'), 0.55);
  fill.position.set(-16, 12, -18);
  scene.add(fill);

  // ---- Waypoint graph: what the bots walk ----
  const nodes = new Map();
  function node(id, x, z, links) {
    nodes.set(id, { id, x, z, links });
  }
  node('atkSpawn', 0, 17, ['midS', 'aLong1', 'bLong1']);
  node('aLong1', -18, 12, ['atkSpawn', 'aLong2']);
  node('aLong2', -18, 2, ['aLong1', 'aLong3']);
  node('aLong3', -17, -5, ['aLong2', 'aSite', 'conW']);
  node('aSite', -14, -11, ['aLong3', 'aHold1', 'aHold2']);
  node('bLong1', 18, 12, ['atkSpawn', 'bLong2']);
  node('bLong2', 18, 2, ['bLong1', 'bLong3']);
  node('bLong3', 17, -5, ['bLong2', 'bSite', 'conE']);
  node('bSite', 15.5, -13.5, ['bLong3', 'bHold1', 'bHold2']);
  node('midS', 0, 10, ['atkSpawn', 'midC']);
  node('midC', 0, 3, ['midS', 'midN']);
  node('midN', 0, -3, ['midC', 'conW', 'conE', 'midHold']);
  node('conW', -6, -6, ['midN', 'aLong3', 'aHold1']);
  node('conE', 6, -6, ['midN', 'bLong3', 'bHold1']);
  node('defSpawn', 0, -17, ['midHold', 'aHold2', 'bHold2']);
  node('aHold1', -11, -9, ['aSite', 'conW']);
  node('aHold2', -19.5, -9.5, ['aSite', 'defSpawn']);
  node('bHold1', 12, -13, ['bSite', 'conE']);
  node('bHold2', 16.5, -8.5, ['bSite', 'defSpawn']);
  node('midHold', 0, -8, ['midN', 'defSpawn']);

  function nearestNode(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const n of nodes.values()) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  // Breadth-first path over the graph; returns node ids from start to goal.
  function findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length > 0) {
      const id = queue.shift();
      const n = nodes.get(id);
      if (!n) continue;
      for (const next of n.links) {
        if (prev.has(next)) continue;
        prev.set(next, id);
        if (next === toId) {
          const path = [toId];
          let cur = id;
          while (cur !== null) {
            path.unshift(cur);
            cur = prev.get(cur);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [fromId];
  }

  return {
    group,
    colliders,
    shootables,
    nodes,
    nearestNode,
    findPath,
    sites: {
      A: { center: new THREE.Vector3(-14, 0, -11), radius: 4.5, name: 'FURNACE' },
      B: { center: new THREE.Vector3(15.5, 0, -13.5), radius: 4.5, name: 'DEPOT' },
    },
    spawns: {
      attack: [
        new THREE.Vector3(-4, 0, 17), new THREE.Vector3(-2, 0, 18),
        new THREE.Vector3(0, 0, 16.5), new THREE.Vector3(2, 0, 18),
        new THREE.Vector3(4, 0, 17),
      ],
      defend: [
        new THREE.Vector3(-4, 0, -17), new THREE.Vector3(-2, 0, -18),
        new THREE.Vector3(0, 0, -16.5), new THREE.Vector3(2, 0, -18),
        new THREE.Vector3(4, 0, -17),
      ],
    },
  };
}
