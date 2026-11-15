// The player: one mover, one weapon, health and armour, grenades. The view
// is the body plus a recoil offset that decays back, so a burst kicks the
// aim up and it settles again. Bots read the same three helpers the grenade
// code needs: eyePos, viewDir and losTo.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { createWeapon, WEAPONS } from './weapons.js';

const WALK_SPEED = 5.2;
const SENSITIVITY = 0.0022;

export function createPlayer(camera, colliders) {
  const mover = createMover(colliders, 0, 0, 0);
  const weapon = createWeapon(camera);
  const eye = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const player = {
    isPlayer: true,
    team: 'vanguard',
    mover,
    body: mover.body,
    weapon,
    alive: true,
    hp: 100,
    armor: 0,
    grenades: { smoke: 0, flash: 0 },
    recoilPitch: 0,
    recoilYaw: 0,
    stepAt: 0,
    eyePos() {
      const p = mover.body.position;
      eye.set(p.x, p.y + mover.body.eye, p.z);
      return eye;
    },
    viewDir() {
      const pitch = mover.body.pitch + player.recoilPitch;
      const cp = Math.cos(pitch);
      dir.set(-Math.sin(mover.body.yaw) * cp, Math.sin(pitch), -Math.cos(mover.body.yaw) * cp);
      return dir;
    },
    losTo(point) {
      const e = player.eyePos();
      return mover.losClear(e.x, e.y, e.z, point.x, point.y, point.z);
    },
    look(dx, dy) {
      mover.body.yaw -= dx * SENSITIVITY;
      mover.body.pitch = Math.max(-1.45, Math.min(1.45, mover.body.pitch - dy * SENSITIVITY));
    },
    recoil(pitchKick, yawKick) {
      player.recoilPitch = Math.min(0.12, player.recoilPitch + pitchKick);
      player.recoilYaw += yawKick;
    },
    reset(spawn, yaw, team) {
      player.team = team;
      player.alive = true;
      player.hp = 100;
      player.armor = 0;
      player.grenades.smoke = 0;
      player.grenades.flash = 0;
      player.recoilPitch = 0;
      player.recoilYaw = 0;
      mover.body.position.set(spawn.x, 0, spawn.z);
      mover.body.velocity.set(0, 0, 0);
      mover.body.yaw = yaw;
      mover.body.pitch = 0;
      mover.body.eye = 1.6;
      mover.body.crouching = false;
      mover.body.height = 1.72;
      weapon.equip('pistol', true);
    },
    step(dt, keys, now, audio) {
      const body = mover.body;
      player.recoilPitch = Math.max(0, player.recoilPitch - dt * 0.35);
      player.recoilYaw *= Math.max(0, 1 - dt * 8);

      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      let wishX = 0;
      let wishZ = 0;
      if (forward || strafe) {
        const sin = Math.sin(body.yaw);
        const cos = Math.cos(body.yaw);
        wishX = -sin * forward + cos * strafe;
        wishZ = -cos * forward - sin * strafe;
        const len = Math.hypot(wishX, wishZ) || 1;
        wishX /= len;
        wishZ /= len;
      }
      const speed = WALK_SPEED * weapon.state.def.moveSpeed;
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      const jump = keys.has('Space');
      mover.step(dt, wishX, wishZ, speed, jump, crouch);
      weapon.step(dt);

      if (body.onGround && mover.groundSpeed() > 2 && now >= player.stepAt) {
        player.stepAt = now + 0.38;
        audio.step();
      }
    },
    cameraPitch() {
      return mover.body.pitch + player.recoilPitch;
    },
    cameraYaw() {
      return mover.body.yaw + player.recoilYaw;
    },
  };
  return player;
}

export { WEAPONS };
