// Shared movement: acceleration, friction, gravity, crouch and jump, resolved
// as a box against the world's colliders one axis at a time, so a wall never
// swallows a body. The player and every bot run the same code; only the wish
// direction and the speed differ.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createMover(colliders, x, z, yaw) {
  const body = {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing
  // on the floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  function step(dt, wishX, wishZ, speed, wantJump, wantCrouch) {
    if (wantCrouch && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const moveSpeed = body.crouching ? speed * 0.45 : speed;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / Math.max(0.1, moveSpeed));
    body.velocity.x += (wishX * moveSpeed - body.velocity.x) * blend;
    body.velocity.z += (wishZ * moveSpeed - body.velocity.z) * blend;
    if (body.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (wantJump && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return {
    body,
    step,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    // A segment from a to b is clear when no collider box blocks it. Used for
    // bot line of sight; the slab test runs on plain numbers, no allocations.
    losClear(ax, ay, az, bx, by, bz) {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      for (const c of colliders) {
        let tmin = 0;
        let tmax = 1;
        if (dx === 0) {
          if (ax < c.min.x || ax > c.max.x) continue;
        } else {
          let t1 = (c.min.x - ax) / dx;
          let t2 = (c.max.x - ax) / dx;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        if (dy === 0) {
          if (ay < c.min.y || ay > c.max.y) continue;
        } else {
          let t1 = (c.min.y - ay) / dy;
          let t2 = (c.max.y - ay) / dy;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        if (dz === 0) {
          if (az < c.min.z || az > c.max.z) continue;
        } else {
          let t1 = (c.min.z - az) / dz;
          let t2 = (c.max.z - az) / dz;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        return false;
      }
      return true;
    },
  };
}

export { STAND_HEIGHT, CROUCH_HEIGHT, STAND_EYE, CROUCH_EYE };
