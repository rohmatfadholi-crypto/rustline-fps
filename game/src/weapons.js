// The armoury: five original weapons and the numbers that make them feel
// different. One table drives the buy menu, the HUD and the firing model, so
// a weapon is a row, not a special case. Names are invented; none copies a
// commercial game's.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SIDEARM', price: 0, damage: 26, headMult: 2,
    mag: 12, reserve: 48, auto: false, gap: 0.14, reload: 1.3,
    spreadStill: 0.004, spreadMove: 0.02, recoil: 0.006, moveSpeed: 1.0,
    pellets: 1, range: 60, kind: 'pistol', barrel: 0.22, grip: 0.05,
  },
  smg: {
    id: 'smg', name: 'HORNET PDW-9', price: 1500, damage: 22, headMult: 2,
    mag: 28, reserve: 84, auto: true, gap: 0.077, reload: 1.7,
    spreadStill: 0.006, spreadMove: 0.03, recoil: 0.005, moveSpeed: 1.0,
    pellets: 1, range: 45, kind: 'smg', barrel: 0.3, grip: 0.06,
  },
  rifle: {
    id: 'rifle', name: 'MARAUDER AR-7', price: 2700, damage: 34, headMult: 2,
    mag: 25, reserve: 75, auto: true, gap: 0.1, reload: 1.9,
    spreadStill: 0.003, spreadMove: 0.026, recoil: 0.011, moveSpeed: 0.95,
    pellets: 1, range: 90, kind: 'rifle', barrel: 0.42, grip: 0.07,
  },
  shotgun: {
    id: 'shotgun', name: 'BREACH-12', price: 1200, damage: 9, headMult: 2,
    mag: 6, reserve: 24, auto: false, gap: 0.8, reload: 2.6,
    spreadStill: 0.05, spreadMove: 0.06, recoil: 0.03, moveSpeed: 0.95,
    pellets: 8, range: 25, kind: 'shotgun', barrel: 0.5, grip: 0.09,
  },
  dmr: {
    id: 'dmr', name: 'LONGBOW DMR-50', price: 4750, damage: 80, headMult: 2,
    mag: 10, reserve: 20, auto: false, gap: 0.9, reload: 2.4,
    spreadStill: 0.001, spreadMove: 0.02, recoil: 0.03, moveSpeed: 0.9,
    pellets: 1, range: 120, kind: 'dmr', barrel: 0.62, grip: 0.08,
  },
};

export const BUY_ORDER = ['rifle', 'smg', 'shotgun', 'dmr', 'pistol'];

// Falloff: beyond close range a bullet loses bite, so long lanes still reward
// the rifle and the DMR and punish the SMG and the shotgun.
export function falloff(def, distance) {
  const close = def.kind === 'shotgun' ? 12 : def.kind === 'smg' ? 22 : def.kind === 'dmr' ? 60 : 35;
  if (distance <= close) return 1;
  const far = def.range;
  const t = Math.min(1, (distance - close) / Math.max(1, far - close));
  return 1 - t * (def.kind === 'shotgun' ? 0.55 : 0.35);
}

export function createWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.4), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), gripMat);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), gripMat);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), gripMat);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accentMat);
  barrel.position.set(0, 0.025, -0.36);
  mag.position.set(0, -0.1, 0.02);
  stock.position.set(0, -0.02, 0.28);
  sight.position.set(0, 0.075, -0.05);
  model.add(receiver, barrel, mag, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    def: WEAPONS.rifle,
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
  };

  function shapeModel() {
    const d = state.def;
    barrel.scale.z = d.barrel / 0.4;
    barrel.position.z = -0.2 - d.barrel / 2;
    mag.scale.y = d.id === 'shotgun' ? 0.6 : d.id === 'dmr' ? 1.3 : 1;
    sight.visible = d.id !== 'shotgun';
    flash.position.z = -0.55 - d.barrel;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = state.def;
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip(defId, refillAmmo) {
      const def = WEAPONS[defId];
      if (!def) return false;
      state.def = def;
      if (refillAmmo) {
        state.mag = def.mag;
        state.reserve = def.reserve;
      } else {
        state.mag = Math.min(state.mag, def.mag);
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      shapeModel();
      return true;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = 0.02 + state.def.recoil * 2.4;
      state.bloom = Math.min(0.05, state.bloom + state.def.recoil * 0.55);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = state.def;
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed) {
      const d = state.def;
      const moving = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
      return moving + state.bloom;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
