// Throwables: a smoke grenade that lays a vision-blocking cloud and a flash
// grenade that blinds whoever looks at it. Both are small projectiles with
// gravity and one damped bounce off the map, then a fuse. The smoke cloud
// lives in the state so bot vision can test against it.
import * as THREE from 'three';

const GRAVITY = 12;
const RADIUS = 0.12;

export function createGrenades(map, fx, state, audio) {
  const active = [];
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c313a'), roughness: 0.6, metalness: 0.4 });
  const geometry = new THREE.SphereGeometry(RADIUS, 10, 8);

  function pointInBox(px, py, pz, box) {
    return px >= box.min.x - RADIUS && px <= box.max.x + RADIUS
      && py >= box.min.y - RADIUS && py <= box.max.y + RADIUS
      && pz >= box.min.z - RADIUS && pz <= box.max.z + RADIUS;
  }

  function bounce(g, dt) {
    g.pos.addScaledVector(g.vel, dt);
    for (const box of map.colliders) {
      if (!pointInBox(g.pos.x, g.pos.y, g.pos.z, box)) continue;
      // Push out along the smallest penetration and reflect that axis.
      const dxMin = g.pos.x - (box.min.x - RADIUS);
      const dxMax = (box.max.x + RADIUS) - g.pos.x;
      const dyMin = g.pos.y - (box.min.y - RADIUS);
      const dyMax = (box.max.y + RADIUS) - g.pos.y;
      const dzMin = g.pos.z - (box.min.z - RADIUS);
      const dzMax = (box.max.z + RADIUS) - g.pos.z;
      const min = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
      if (min === dxMin) { g.pos.x = box.min.x - RADIUS; g.vel.x = -Math.abs(g.vel.x) * 0.45; }
      else if (min === dxMax) { g.pos.x = box.max.x + RADIUS; g.vel.x = Math.abs(g.vel.x) * 0.45; }
      else if (min === dyMin) { g.pos.y = box.min.y - RADIUS; g.vel.y = -Math.abs(g.vel.y) * 0.45; }
      else if (min === dyMax) { g.pos.y = box.max.y + RADIUS; g.vel.y = Math.abs(g.vel.y) * 0.45; }
      else if (min === dzMin) { g.pos.z = box.min.z - RADIUS; g.vel.z = -Math.abs(g.vel.z) * 0.45; }
      else { g.pos.z = box.max.z + RADIUS; g.vel.z = Math.abs(g.vel.z) * 0.45; }
      audio.bounce();
      break;
    }
    if (g.pos.y < RADIUS) {
      g.pos.y = RADIUS;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
  }

  function activate(g) {
    if (g.kind === 'smoke') {
      const cloud = fx.addSmoke(g.pos, state.elapsed + 14);
      state.smoke.push({ center: g.pos.clone(), radius: cloud.radius, until: state.elapsed + 14 });
    } else {
      // Flash: whoever is looking at it, near enough, with a clear line, is blind.
      const from = g.pos;
      for (const entity of [state.player, ...state.bots]) {
        if (!entity || !entity.alive) continue;
        const eye = entity.eyePos();
        const dx = from.x - eye.x;
        const dy = from.y - eye.y;
        const dz = from.z - eye.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 30 || dist < 0.5) continue;
        const facing = entity.viewDir();
        const dot = (facing.x * dx + facing.y * dy + facing.z * dz) / dist;
        if (dot < 0.25) continue;
        if (!entity.losTo(from)) continue;
        const strength = Math.max(0.4, 1 - dist / 30);
        if (entity === state.player) state.flashBlind = Math.max(state.flashBlind, 2.5 * strength);
        else entity.blindUntil = Math.max(entity.blindUntil || 0, state.elapsed + 3.5 * strength);
      }
    }
  }

  return {
    active,
    throw(kind, origin, direction, speed) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(origin);
      const g = {
        kind,
        pos: origin.clone(),
        vel: direction.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 2.2, 0)),
        fuse: 1.4,
        mesh,
        bounced: false,
      };
      active.push(g);
      return g;
    },
    step(dt) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const g = active[i];
        g.vel.y -= GRAVITY * dt;
        bounce(g, dt);
        g.mesh.position.copy(g.pos);
        g.fuse -= dt;
        if (g.fuse <= 0) {
          activate(g);
          g.mesh.parent?.remove(g.mesh);
          active.splice(i, 1);
        }
      }
    },
    reset() {
      for (const g of active) g.mesh.parent?.remove(g.mesh);
      active.length = 0;
    },
  };
}
