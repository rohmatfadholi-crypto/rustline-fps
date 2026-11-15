// The bots: nine of them, five a side with the player. Each one walks a
// route over the map's waypoint graph, holds a position, sees with a line of
// sight and a field of view, hears gunshots and investigates, and fights in
// bursts with an aim error that shrinks the longer it watches its target.
// Attackers push a site and plant; defenders hold, rotate to a planted bomb
// and defuse. One mover, one combat resolver, one damage path for everyone.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';

const CALLSIGNS = ['ASH', 'BRICK', 'COBALT', 'DUSK', 'EMBER', 'FLINT', 'GRIT', 'HAVOC', 'IRON'];
const VISION_RANGE = 42;
const VISION_FOV = 0.55; // cos(56 deg)
const HEAR_RANGE = 26;
const BOT_SPEED = 4.6;
const TURN_RATE = 5.5;

function buildBody(scene, team) {
  const color = team === 'vanguard' ? PALETTE.amber : PALETTE.teal;
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.75, metalness: 0.25 });
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.2 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 1.2, roughness: 0.4,
  });
  const group = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
  legL.position.set(-0.12, 0.25, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
  legR.position.set(0.12, 0.25, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), teamMat);
  torso.position.set(0, 0.85, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), dark);
  head.position.set(0, 1.42, 0);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.02), visorMat);
  visor.position.set(0, 1.44, -0.16);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), dark);
  armL.position.set(-0.34, 0.85, -0.08);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), dark);
  armR.position.set(0.34, 0.85, -0.08);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), dark);
  gun.position.set(0.18, 1.05, -0.35);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.18, 1.05, -0.72);
  flash.visible = false;
  group.add(legL, legR, torso, head, visor, armL, armR, gun, flash);
  group.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = false;
  });
  scene.add(group);
  return { group, head, torso, legL, legR, gun, flash };
}

export function createBotSystem(deps) {
  const { scene, map, combat, fx, audio, state, rng } = deps;
  const bots = [];
  const tmpDir = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();

  function makeBot(index, team) {
    const mover = createMover(map.colliders, 0, 0, 0);
    const parts = buildBody(scene, team);
    const bot = {
      id: index,
      name: CALLSIGNS[index % CALLSIGNS.length],
      team,
      mover,
      body: mover.body,
      mesh: parts.group,
      flashMesh: parts.flash,
      hitMeshes: [],
      alive: true,
      hp: 100,
      armor: 0,
      weaponDef: WEAPONS.rifle,
      mag: WEAPONS.rifle.mag,
      cooldown: 0,
      reloadLeft: 0,
      flashLife: 0,
      // AI
      role: 'attack',
      route: [],
      routeIndex: 0,
      holdNode: null,
      holdYaw: 0,
      target: null,
      aimTime: 0,
      reactAt: 0,
      burstLeft: 0,
      burstPause: 0,
      lastSeen: null,
      lastSeenAt: -10,
      investigate: null,
      blindUntil: 0,
      stuckAt: 0,
      lastPos: new THREE.Vector3(),
      visionAt: rng.range(0, 0.12),
      skill: rng.range(0.55, 0.8),
      isCarrier: false,
      plantSite: null,
      deadAt: 0,
      deathSpin: 0,
    };
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    parts.torso.userData.bot = bot;
    parts.torso.userData.part = 'body';
    parts.legL.userData.bot = bot;
    parts.legL.userData.part = 'body';
    parts.legR.userData.bot = bot;
    parts.legR.userData.part = 'body';
    bot.hitMeshes = [parts.head, parts.torso, parts.legL, parts.legR];
    return bot;
  }

  for (let i = 0; i < 9; i += 1) {
    bots.push(makeBot(i, i < 4 ? 'vanguard' : 'wardens'));
  }

  function eyePos(bot) {
    const p = bot.body.position;
    tmpEye.set(p.x, p.y + bot.body.eye, p.z);
    return tmpEye;
  }

  function viewDir(bot) {
    const cp = Math.cos(bot.body.pitch);
    tmpDir.set(-Math.sin(bot.body.yaw) * cp, Math.sin(bot.body.pitch), -Math.cos(bot.body.yaw) * cp);
    return tmpDir;
  }

  function losTo(bot, point) {
    const eye = eyePos(bot);
    return bot.mover.losClear(eye.x, eye.y, eye.z, point.x, point.y, point.z);
  }

  // A smoke cloud blocks sight when the segment passes through its sphere.
  function throughSmoke(ax, ay, az, bx, by, bz) {
    for (const cloud of state.smoke) {
      const cx = cloud.center.x - ax;
      const cy = cloud.center.y - ay;
      const cz = cloud.center.z - az;
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const len2 = dx * dx + dy * dy + dz * dz;
      if (len2 === 0) continue;
      let t = (cx * dx + cy * dy + cz * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - cloud.center.x;
      const py = ay + dy * t - cloud.center.y;
      const pz = az + dz * t - cloud.center.z;
      if (px * px + py * py + pz * pz < cloud.radius * cloud.radius) return true;
    }
    return false;
  }

  function canSee(bot, enemy) {
    if (!enemy || !enemy.alive) return false;
    const eye = eyePos(bot);
    const ep = enemy.eyePos ? enemy.eyePos() : null;
    const ex = ep ? ep.x : enemy.body.position.x;
    const ey = ep ? ep.y : enemy.body.position.y + 1.2;
    const ez = ep ? ep.z : enemy.body.position.z;
    const dx = ex - eye.x;
    const dy = ey - eye.y;
    const dz = ez - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > VISION_RANGE) return false;
    const fwd = viewDir(bot);
    if ((fwd.x * dx + fwd.y * dy + fwd.z * dz) / dist < VISION_FOV) return false;
    if (!bot.mover.losClear(eye.x, eye.y, eye.z, ex, ey, ez)) return false;
    if (throughSmoke(eye.x, eye.y, eye.z, ex, ey, ez)) return false;
    return true;
  }

  function acquire(bot, now) {
    const enemies = [];
    const player = state.player;
    if (player && player.alive && player.team !== bot.team) enemies.push(player);
    for (const other of bots) {
      if (other !== bot && other.alive && other.team !== bot.team) enemies.push(other);
    }
    let best = null;
    let bestD = Infinity;
    for (const enemy of enemies) {
      if (!canSee(bot, enemy)) continue;
      const p = enemy.body.position;
      const d = (p.x - bot.body.position.x) ** 2 + (p.z - bot.body.position.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.aimTime = 0;
        bot.reactAt = now + 0.25 + (1 - bot.skill) * 0.35;
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      const ep = best.eyePos ? best.eyePos() : null;
      bot.lastSeen = ep ? { x: ep.x, y: ep.y, z: ep.z } : { x: best.body.position.x, y: best.body.position.y + 1.2, z: best.body.position.z };
      bot.lastSeenAt = now;
      return true;
    }
    return false;
  }

  function aimAt(bot, target, dt) {
    const p = bot.body.position;
    const tp = target.body.position;
    const ty = target === state.player ? p.y + target.body.eye - 0.35 : tp.y + 1.15;
    const dx = tp.x - p.x;
    const dy = ty - (p.y + bot.body.eye);
    const dz = tp.z - p.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let dyaw = wantYaw - bot.body.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, dyaw));
    bot.body.yaw += turn;
    bot.body.pitch += Math.max(-3 * dt, Math.min(3 * dt, wantPitch - bot.body.pitch));
    return Math.abs(dyaw) < 0.12;
  }

  function fireAt(bot, target, now) {
    const def = bot.weaponDef;
    if (bot.cooldown > 0 || bot.reloadLeft > 0) return;
    if (bot.mag <= 0) {
      bot.reloadLeft = def.reload;
      return;
    }
    const eye = eyePos(bot);
    const tp = target.body.position;
    const aimY = target === state.player ? tp.y + target.body.eye - 0.35 : tp.y + 1.15;
    const dx = tp.x - eye.x;
    const dy = aimY - eye.y;
    const dz = tp.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    const speed = Math.hypot(target.body.velocity.x, target.body.velocity.z);
    const error = (0.02 + (1 - bot.skill) * 0.03)
      * (1 + speed * 0.12) * (1 + dist / 45)
      * (1 - Math.min(bot.aimTime, 1) * 0.4)
      * (bot.mover.groundSpeed() > 1 ? 1.6 : 1);
    tmpDir.set(dx / dist, dy / dist, dz / dist);
    const enemies = bot.team === 'vanguard' ? bots.filter((b) => b.team === 'wardens') : bots.filter((b) => b.team === 'vanguard');
    const hit = combat.shoot({
      origin: eye, direction: tmpDir, spread: error, rng,
      damage: def.damage, headMult: def.headMult, range: def.range,
      bots: enemies, player: state.player && state.player.team !== bot.team ? state.player : null,
      exclude: bot,
    });
    bot.mag -= 1;
    bot.cooldown = def.gap;
    bot.flashLife = 0.05;
    bot.flashMesh.visible = true;
    audio.shot(def.kind);
    deps.onShotFired(eye, bot);
    if (hit.kind === 'bot' || hit.kind === 'player') {
      const fall = hit.distance > 35 ? 0.75 : hit.distance > 22 ? 0.85 : 1;
      deps.damage(hit.entity, hit.damage * fall, hit.part, bot);
    }
  }

  function setRoute(bot, targetNodeId) {
    const from = map.nearestNode(bot.body.position.x, bot.body.position.z);
    bot.route = map.findPath(from.id, targetNodeId);
    bot.routeIndex = 0;
  }

  function stepRoute(bot, dt, speed) {
    if (bot.routeIndex >= bot.route.length) return true;
    const node = map.nodes.get(bot.route[bot.routeIndex]);
    const dx = node.x - bot.body.position.x;
    const dz = node.z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.9) {
      bot.routeIndex += 1;
      return bot.routeIndex >= bot.route.length;
    }
    const nx = dx / (dist || 1);
    const nz = dz / (dist || 1);
    bot.mover.step(dt, nx, nz, speed, false, false);
    const wantYaw = Math.atan2(-nx, -nz);
    let dyaw = wantYaw - bot.body.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.body.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, dyaw));
    return false;
  }

  function syncMesh(bot) {
    const p = bot.body.position;
    bot.mesh.position.set(p.x, p.y, p.z);
    bot.mesh.rotation.set(0, bot.body.yaw, 0);
    if (!bot.alive) {
      bot.mesh.rotation.x = -Math.PI / 2 + bot.deathSpin;
      bot.mesh.position.y = Math.max(0, p.y - 0.1);
    }
  }

  function stepBot(bot, dt, now) {
    if (!bot.alive) {
      bot.deathSpin = Math.min(0.4, bot.deathSpin + dt * 0.8);
      syncMesh(bot);
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) bot.mag = bot.weaponDef.mag;
    }
    if (bot.flashLife > 0) {
      bot.flashLife -= dt;
      if (bot.flashLife <= 0) bot.flashMesh.visible = false;
    }
    const blind = now < bot.blindUntil;

    // Vision, staggered so nine bots do not all raycast on the same step.
    bot.visionAt -= dt;
    if (bot.visionAt <= 0 && !blind) {
      bot.visionAt = 0.12;
      if (bot.target && bot.target.alive) {
        if (!canSee(bot, bot.target)) {
          if (now - bot.lastSeenAt > 1.2) bot.target = null;
        } else {
          bot.lastSeenAt = now;
        }
      }
      if (!bot.target) acquire(bot, now);
    }
    if (blind) bot.target = null;

    if (bot.target && bot.target.alive) {
      bot.aimTime += dt;
      const aimed = aimAt(bot, bot.target, dt);
      if (aimed && now >= bot.reactAt) {
        if (bot.burstPause > 0) {
          bot.burstPause -= dt;
        } else if (bot.burstLeft > 0) {
          fireAt(bot, bot.target, now);
          bot.burstLeft -= 1;
          if (bot.burstLeft === 0) bot.burstPause = 0.5 + rng.random() * 0.5;
        } else {
          bot.burstLeft = 3 + Math.floor(rng.random() * 4);
        }
      }
      // Planted feet while fighting; a small strafe keeps the bot from being a statue.
      const strafe = Math.sin(now * 1.3 + bot.id * 2.1) * 0.35;
      const rx = Math.cos(bot.body.yaw);
      const rz = -Math.sin(bot.body.yaw);
      bot.mover.step(dt, rx * strafe, rz * strafe, 1.2, false, false);
      syncMesh(bot);
      return;
    }

    // No target: work the objective.
    const bomb = state.bomb;
    if (bot.team === 'wardens' && bomb.state === 'planted') {
      // Rotate to the planted site.
      const nodeId = bomb.site === 'A' ? 'aSite' : 'bSite';
      if (bot.holdNode !== nodeId) {
        bot.holdNode = nodeId;
        setRoute(bot, nodeId);
      }
      if (stepRoute(bot, dt, BOT_SPEED)) {
        const site = map.sites[bomb.site];
        const d = Math.hypot(bot.body.position.x - bomb.position.x, bot.body.position.z - bomb.position.z);
        if (d < 1.6) deps.startDefuse(bot);
        else {
          bot.body.yaw = Math.atan2(-(bomb.position.x - bot.body.position.x), -(bomb.position.z - bot.body.position.z));
        }
      }
      syncMesh(bot);
      return;
    }
    if (bot.isCarrier && bomb.state === 'carried' && bomb.carrier === bot) {
      const site = map.sites[bot.plantSite];
      const d = Math.hypot(bot.body.position.x - site.center.x, bot.body.position.z - site.center.z);
      if (d < 2.2) {
        deps.startPlant(bot, bot.plantSite);
        syncMesh(bot);
        return;
      }
      if (bot.holdNode !== (bot.plantSite === 'A' ? 'aSite' : 'bSite')) {
        bot.holdNode = bot.plantSite === 'A' ? 'aSite' : 'bSite';
        setRoute(bot, bot.holdNode);
      }
      stepRoute(bot, dt, BOT_SPEED);
      syncMesh(bot);
      return;
    }
    if (bot.investigate && now < bot.investigate.until) {
      if (bot.holdNode !== bot.investigate.node) {
        bot.holdNode = bot.investigate.node;
        setRoute(bot, bot.investigate.node);
      }
      if (stepRoute(bot, dt, BOT_SPEED)) {
        bot.body.yaw += dt * 0.9;
      }
      syncMesh(bot);
      return;
    }
    if (bot.investigate && now >= bot.investigate.until) bot.investigate = null;

    // Follow the assigned route, then hold and watch the lane.
    if (bot.route.length && bot.routeIndex < bot.route.length) {
      stepRoute(bot, dt, bot.role === 'attack' ? BOT_SPEED : BOT_SPEED * 0.9);
    } else if (bot.holdNode) {
      bot.body.yaw += Math.sin(now * 0.5 + bot.id) * dt * 0.35;
    }
    // Unstick: no progress for a while means the route is blocked; skip a node.
    const moved = Math.hypot(bot.body.position.x - bot.lastPos.x, bot.body.position.z - bot.lastPos.z);
    if (moved < 0.05) bot.stuckAt += dt;
    else bot.stuckAt = 0;
    bot.lastPos.set(bot.body.position.x, 0, bot.body.position.z);
    if (bot.stuckAt > 1.5 && bot.routeIndex < bot.route.length - 1) {
      bot.routeIndex += 1;
      bot.stuckAt = 0;
    }
    syncMesh(bot);
  }

  function hearShot(pos, shooter) {
    for (const bot of bots) {
      if (!bot.alive || bot === shooter || bot.target) continue;
      const d = Math.hypot(bot.body.position.x - pos.x, bot.body.position.z - pos.z);
      if (d > HEAR_RANGE) continue;
      const node = map.nearestNode(pos.x, pos.z);
      bot.investigate = { node: node.id, until: state.elapsed + 4 };
    }
  }

  function spawnRound() {
    const attacking = state.playerSide === 'vanguard';
    const attackTeam = attacking ? 'vanguard' : 'wardens';
    const defendTeam = attacking ? 'wardens' : 'vanguard';
    const attackSpawns = attacking ? map.spawns.attack : map.spawns.defend;
    const defendSpawns = attacking ? map.spawns.defend : map.spawns.attack;
    let ai = 0;
    let di = 0;
    const sites = rng.shuffle(['A', 'A', 'B', 'B']);
    for (const bot of bots) {
      bot.alive = true;
      bot.hp = 100;
      bot.armor = 0;
      bot.target = null;
      bot.investigate = null;
      bot.blindUntil = 0;
      bot.isCarrier = false;
      bot.plantSite = null;
      bot.deathSpin = 0;
      bot.mesh.rotation.set(0, 0, 0);
      bot.mesh.visible = true;
      if (bot.team === attackTeam) {
        const spawn = attackSpawns[ai % attackSpawns.length];
        ai += 1;
        bot.body.position.set(spawn.x, 0, spawn.z);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = attacking ? 0 : Math.PI;
        bot.body.pitch = 0;
        bot.role = 'attack';
        bot.weaponDef = ai % 3 === 0 ? WEAPONS.smg : WEAPONS.rifle;
        bot.mag = bot.weaponDef.mag;
        const site = sites[(ai - 1) % sites.length];
        bot.plantSite = site;
        bot.holdNode = site === 'A' ? 'aSite' : 'bSite';
        setRoute(bot, bot.holdNode);
      } else {
        const spawn = defendSpawns[di % defendSpawns.length];
        di += 1;
        bot.body.position.set(spawn.x, 0, spawn.z);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = attacking ? Math.PI : 0;
        bot.body.pitch = 0;
        bot.role = 'defend';
        bot.weaponDef = di === 3 ? WEAPONS.dmr : di % 2 === 0 ? WEAPONS.smg : WEAPONS.rifle;
        bot.mag = bot.weaponDef.mag;
        const holds = ['aHold1', 'aHold2', 'bHold1', 'bHold2', 'midHold'];
        bot.holdNode = holds[(di - 1) % holds.length];
        setRoute(bot, bot.holdNode);
      }
      bot.body.eye = 1.6;
      syncMesh(bot);
    }
    // The carrier is an attacker bot when the player defends; the player
    // carries when attacking (main.js assigns it).
    if (!attacking) {
      const carrier = bots.find((b) => b.team === 'wardens' && b.role === 'attack');
      if (carrier) carrier.isCarrier = true;
    }
  }

  return {
    bots,
    spawnRound,
    hearShot,
    step(dt, now) {
      for (const bot of bots) stepBot(bot, dt, now);
    },
    eyePos,
    viewDir,
    losTo,
    canSee,
  };
}
