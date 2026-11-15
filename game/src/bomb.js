// The bomb: carried, planted, defused or exploded. One state machine, one
// mesh. The carrier plants by holding E inside a site for 3 seconds; a
// defender defuses by holding E beside a planted bomb for 5 seconds. If the
// carrier dies the bomb drops where they fell and any attacker can pick it up.
import * as THREE from 'three';
import { PLANT_TIME, DEFUSE_TIME, BOMB_TIME } from './state.js';
import { PALETTE } from './palette.js';

export function createBomb(deps) {
  const { scene, map, fx, audio, state } = deps;
  const lightMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.danger), emissive: new THREE.Color(PALETTE.danger),
    emissiveIntensity: 0.4, roughness: 0.5,
  });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1e22'), roughness: 0.6, metalness: 0.4 });
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), bodyMat);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), lightMat);
  light.position.set(0, 0.1, 0.13);
  mesh.add(body, light);
  mesh.visible = false;
  scene.add(mesh);
  let beepAt = 0;
  let attachedTo = null;

  function attachTo(entity) {
    if (attachedTo === entity) return;
    detach();
    attachedTo = entity;
    if (!entity) return;
    if (entity.isPlayer) {
      mesh.visible = false;
    } else if (entity.mesh) {
      entity.mesh.add(mesh);
      mesh.position.set(0, 0.9, 0.24);
      mesh.visible = true;
    }
  }

  function detach() {
    if (attachedTo && attachedTo.mesh) attachedTo.mesh.remove(mesh);
    attachedTo = null;
    scene.add(mesh);
  }

  function placeAt(x, y, z) {
    detach();
    mesh.position.set(x, y + 0.1, z);
    mesh.visible = true;
  }

  function inSite(entity, site) {
    const s = map.sites[site];
    const p = entity.body.position;
    return Math.hypot(p.x - s.center.x, p.z - s.center.z) <= s.radius;
  }

  return {
    mesh,
    assignCarrier(entity) {
      state.bomb.carrier = entity;
      state.bomb.state = 'carried';
      if (entity) {
        state.bomb.position.copy(entity.body.position);
        attachTo(entity);
      }
    },
    startPlant(entity, site) {
      const b = state.bomb;
      if (b.state !== 'carried' || b.carrier !== entity || !inSite(entity, site)) return false;
      b.state = 'planting';
      b.site = site;
      b.planter = entity;
      b.plantProgress = 0;
      return true;
    },
    startDefuse(entity) {
      const b = state.bomb;
      if (b.state !== 'planted') return false;
      const p = entity.body.position;
      if (Math.hypot(p.x - b.position.x, p.z - b.position.z) > 1.6) return false;
      b.state = 'defusing';
      b.defuser = entity;
      b.defuseProgress = 0;
      return true;
    },
    dropAt(pos) {
      const b = state.bomb;
      b.state = 'idle';
      b.carrier = null;
      b.planter = null;
      b.position.set(pos.x, 0, pos.z);
      placeAt(pos.x, 0, pos.z);
    },
    tryPickup(entity) {
      const b = state.bomb;
      if (b.state !== 'idle' || entity.team !== 'vanguard') return false;
      const p = entity.body.position;
      if (Math.hypot(p.x - b.position.x, p.z - b.position.z) > 1.3) return false;
      b.state = 'carried';
      b.carrier = entity;
      attachTo(entity);
      if (entity.isPlayer) deps.onPickup('You picked up the bomb');
      return true;
    },
    // Stage a planted bomb at a site (used by the screenshot staging).
    plantAt(site, timer) {
      const b = state.bomb;
      b.state = 'planted';
      b.site = site;
      b.timer = timer;
      b.carrier = null;
      b.planter = null;
      b.position.copy(map.sites[site].center);
      placeAt(b.position.x, 0, b.position.z);
    },
    reset() {
      const b = state.bomb;
      b.state = 'idle';
      b.carrier = null;
      b.site = null;
      b.planter = null;
      b.defuser = null;
      b.plantProgress = 0;
      b.defuseProgress = 0;
      b.timer = 0;
      mesh.visible = false;
      detach();
    },
    step(dt) {
      const b = state.bomb;
      if (b.state === 'carried' && b.carrier) {
        b.position.copy(b.carrier.body.position);
        attachTo(b.carrier);
      } else if (b.state === 'planting') {
        const planter = b.planter;
        if (!planter || !planter.alive || !inSite(planter, b.site)) {
          b.state = 'carried';
          b.planter = null;
          b.plantProgress = 0;
          attachTo(b.carrier);
        } else {
          b.plantProgress += dt;
          b.position.copy(planter.body.position);
          if (b.plantProgress >= PLANT_TIME) {
            b.state = 'planted';
            b.timer = BOMB_TIME;
            b.planter = null;
            placeAt(b.position.x, 0, b.position.z);
            audio.plant();
            deps.onPlanted(b.site);
          }
        }
      } else if (b.state === 'planted') {
        b.timer -= dt;
        const blink = b.timer < 10 ? 0.12 : 0.5;
        lightMat.emissiveIntensity = (state.elapsed % (blink * 2)) < blink ? 2.4 : 0.2;
        if (state.elapsed >= beepAt) {
          audio.beep();
          beepAt = state.elapsed + (b.timer < 10 ? 0.5 : 1);
        }
        if (b.timer <= 0) {
          b.state = 'exploded';
          fx.explosion(b.position);
          audio.explosion();
          mesh.visible = false;
          deps.onExploded();
        }
      } else if (b.state === 'defusing') {
        const defuser = b.defuser;
        const p = defuser ? defuser.body.position : null;
        if (!defuser || !defuser.alive || !p || Math.hypot(p.x - b.position.x, p.z - b.position.z) > 1.8) {
          b.state = 'planted';
          b.defuser = null;
          b.defuseProgress = 0;
        } else {
          b.defuseProgress += dt;
          if (b.defuseProgress >= DEFUSE_TIME) {
            b.state = 'defused';
            b.defuser = null;
            mesh.visible = false;
            deps.onDefused();
          }
        }
      }
    },
  };
}
