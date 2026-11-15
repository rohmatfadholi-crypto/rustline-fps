// RUSTLINE — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. ?shot=start|play|end|defend with &seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeRng } from './rng.js';
import { createState, resetRoundState, playerAttacks, PHASE, BUY_TIME, ROUND_TIME, WIN_TARGET, MAX_ROUNDS } from './state.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createBotSystem } from './bots.js';
import { createCombat } from './combat.js';
import { createFx } from './fx.js';
import { createGrenades } from './grenades.js';
import { createBomb } from './bomb.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { WEAPONS, falloff } from './weapons.js';
import { buyList, roundReward, KILL_REWARD, OBJECTIVE_REWARD } from './economy.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const noLock = params.get('nolock') === '1';
const rng = makeRng(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in three 0.187
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const state = createState();
const map = createMap(scene);
const fx = createFx(scene, rng);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(camera, map.colliders);
player.owned = new Set(['pistol']);
const combat = createCombat(map, fx);
const grenades = createGrenades(map, fx, state, audio);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();

let keptLoadout = null;
let shake = 0;
let frozen = false;
let overlayMode = 'start';
let prevFiring = false;
let lastTime = performance.now();
let accumulator = 0;

const bots = createBotSystem({
  scene, map, combat, fx, audio, state, rng,
  damage: (entity, amount, part, attacker) => damageEntity(entity, amount, part, attacker),
  onShotFired: (pos) => botsHearShot(pos),
  startPlant: (bot, site) => bomb.startPlant(bot, site),
  startDefuse: (bot) => bomb.startDefuse(bot),
});
const bomb = createBomb({
  scene, map, fx, audio, state,
  onPlanted: (site) => {
    feed(`Bomb planted at ${site}`);
    if (state.bomb.carrier === player) {
      state.money += OBJECTIVE_REWARD;
      state.plants += 1;
    }
  },
  onExploded: () => endRound('vanguard', 'The bomb detonated'),
  onDefused: () => {
    if (state.bomb.defuser === player) {
      state.money += OBJECTIVE_REWARD;
      state.defuses += 1;
    }
    endRound('wardens', 'The bomb was defused');
  },
  onPickup: (text) => feed(text),
});
state.player = player;
state.bots = bots.bots;

function feed(text) {
  hud.feed(text);
  state.feed.push({ text, at: state.elapsed });
}

function botsHearShot(pos) {
  bots.hearShot({ x: pos.x, z: pos.z }, player);
}

function aliveCount(team) {
  let count = player.team === team && player.alive ? 1 : 0;
  for (const bot of state.bots) if (bot.team === team && bot.alive) count += 1;
  return count;
}

function damageEntity(target, amount, part, attacker) {
  if (!target.alive || state.phase === PHASE.MENU) return;
  let remaining = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, remaining * 0.5);
    target.armor -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  if (target === player) {
    audio.hurt();
    if (attacker) {
      const dx = attacker.body.position.x - player.body.position.x;
      const dz = attacker.body.position.z - player.body.position.z;
      const worldAngle = Math.atan2(dx, dz);
      const relative = worldAngle - player.body.yaw;
      hud.damageFrom((relative * 180) / Math.PI);
    }
  }
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  const attackerName = attacker === player ? 'YOU' : attacker ? attacker.name : '—';
  const victimName = target === player ? 'YOU' : target.name;
  feed(`${attackerName} ▸ ${victimName}${part === 'head' ? ' · HEADSHOT' : ''}`);
  if (attacker === player) {
    state.kills += 1;
    state.money += KILL_REWARD;
    audio.kill();
  }
  if (target === player) {
    state.deaths += 1;
    const ally = state.bots.find((b) => b.team === player.team && b.alive);
    state.spectate = ally || null;
    if (ally) hud.showSpectate(`You are down — spectating ${ally.name}`);
    else hud.showSpectate('You are down');
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    target.deadAt = state.elapsed;
  }
  if (state.bomb.carrier === target) {
    bomb.dropAt(target.body.position);
    feed('The bomb was dropped');
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (state.phase !== PHASE.LIVE) return;
  const vanguardAlive = aliveCount('vanguard');
  const wardensAlive = aliveCount('wardens');
  const planted = state.bomb.state === 'planted' || state.bomb.state === 'defusing';
  if (vanguardAlive === 0 && !planted) endRound('wardens', 'Vanguard eliminated');
  else if (wardensAlive === 0 && !planted) endRound('vanguard', 'Wardens eliminated');
  else if (wardensAlive === 0 && planted) endRound('vanguard', 'Site cleared — the bomb will detonate');
}

function ownedSnapshot() {
  return {
    weapon: player.weapon.state.def.id,
    smoke: player.grenades.smoke,
    flash: player.grenades.flash,
    armor: player.armor > 0,
    owned: player.owned,
  };
}

// Each weapon keeps its own mag/reserve while holstered.
const ammoStore = {};
function saveAmmo() {
  const d = player.weapon.state.def;
  ammoStore[d.id] = { mag: player.weapon.state.mag, reserve: player.weapon.state.reserve };
}
function loadAmmo(id) {
  const saved = ammoStore[id];
  if (saved) {
    player.weapon.state.mag = saved.mag;
    player.weapon.state.reserve = saved.reserve;
  }
}
function switchWeapon(id) {
  if (player.weapon.state.def.id === id || !player.owned.has(id)) return;
  saveAmmo();
  player.weapon.equip(id, false);
  loadAmmo(id);
  syncHud();
}

function buy(itemId) {
  if (state.phase !== PHASE.BUY) return false;
  const item = buyList().find((i) => i.id === itemId);
  if (!item) return false;
  if (item.id === 'smoke' || item.id === 'flash') {
    if (player.grenades[item.id] >= 1 || state.money < item.price) return false;
    state.money -= item.price;
    player.grenades[item.id] += 1;
  } else if (item.id === 'armor') {
    if (player.armor >= 50 || state.money < item.price) return false;
    state.money -= item.price;
    player.armor = 50;
  } else {
    if (player.owned.has(itemId) || state.money < item.price) return false;
    state.money -= item.price;
    player.owned.add(itemId);
    saveAmmo();
    player.weapon.equip(itemId, true);
    saveAmmo();
  }
  audio.beep();
  hud.refreshBuy(state.money, ownedSnapshot());
  syncHud();
  return true;
}

function startMatch() {
  state.score.vanguard = 0;
  state.score.wardens = 0;
  state.lossStreak.vanguard = 0;
  state.lossStreak.wardens = 0;
  state.round = 1;
  state.money = 800;
  state.kills = 0;
  state.deaths = 0;
  state.plants = 0;
  state.defuses = 0;
  keptLoadout = null;
  player.owned = new Set(['pistol']);
  startRound();
}

function startRound() {
  resetRoundState(state);
  const attacking = playerAttacks(state);
  const side = attacking ? 'vanguard' : 'wardens';
  const spawns = attacking ? map.spawns.attack : map.spawns.defend;
  const spawn = spawns[2];
  player.reset(spawn, attacking ? 0 : Math.PI, side);
  // Survivors keep last round's primary; the fallen start with a pistol.
  if (keptLoadout && keptLoadout.weapon !== 'pistol') {
    player.owned.add(keptLoadout.weapon);
    player.weapon.equip(keptLoadout.weapon, true);
    player.weapon.state.mag = keptLoadout.mag;
    player.weapon.state.reserve = keptLoadout.reserve;
    saveAmmo();
    player.grenades.smoke = keptLoadout.smoke;
    player.grenades.flash = keptLoadout.flash;
    player.armor = keptLoadout.armor;
  }
  keptLoadout = null;
  bots.spawnRound();
  bomb.reset();
  if (attacking) {
    bomb.assignCarrier(player);
  } else {
    const carrier = state.bots.find((b) => b.team === 'wardens' && b.isCarrier);
    if (carrier) bomb.assignCarrier(carrier);
  }
  grenades.reset();
  state.phase = PHASE.BUY;
  state.timer = BUY_TIME;
  hud.hideOverlay();
  hud.hideSpectate();
  hud.showBuy(state.money, ownedSnapshot());
  hud.setBomb(attacking ? 'You carry the bomb — plant at FURNACE (A) or DEPOT (B)' : 'Hold the sites — stop the plant');
  syncHud();
  syncCamera();
}

function endRound(winner, reason) {
  if (state.phase !== PHASE.LIVE) return;
  state.phase = PHASE.ROUND_END;
  state.timer = 4;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const loser = winner === 'vanguard' ? 'wardens' : 'vanguard';
  state.lossStreak[winner] = 0;
  state.lossStreak[loser] += 1;
  const playerWon = winner === player.team;
  state.money += roundReward(playerWon, state.lossStreak[player.team]);
  if (player.alive) {
    keptLoadout = {
      weapon: player.weapon.state.def.id,
      mag: player.weapon.state.mag,
      reserve: player.weapon.state.reserve,
      smoke: player.grenades.smoke,
      flash: player.grenades.flash,
      armor: player.armor,
    };
  } else {
    keptLoadout = null;
    player.owned = new Set(['pistol']);
    for (const id of Object.keys(ammoStore)) if (id !== 'pistol') delete ammoStore[id];
  }
  if (playerWon) audio.roundWin();
  else audio.roundLose();
  hud.hideBuy();
  hud.setBomb('');
  hud.showOverlay('round', {
    title: playerWon ? 'ROUND WON' : 'ROUND LOST',
    copy: `${reason}. ${state.score.vanguard} — ${state.score.wardens} after round ${state.round}.`,
    action: 'Next round',
  });
  overlayMode = 'round';
  if (document.pointerLockElement) document.exitPointerLock();
  syncHud();
}

function endMatch(winner) {
  state.phase = PHASE.MATCH_END;
  state.matchWinner = winner;
  const playerWon = winner === player.team;
  hud.hideBuy();
  hud.showOverlay('match', {
    title: playerWon ? 'MATCH WON' : 'MATCH LOST',
    copy: `VANGUARD ${state.score.vanguard} — ${state.score.wardens} WARDENS. ${playerWon ? 'The yard is yours.' : 'The yard held.'} Kills ${state.kills} · Plants ${state.plants} · Defuses ${state.defuses}.`,
    action: 'Play again',
  });
  overlayMode = 'match';
  if (document.pointerLockElement) document.exitPointerLock();
}

function advanceRound() {
  if (state.score.vanguard >= WIN_TARGET || state.score.wardens >= WIN_TARGET || state.round >= MAX_ROUNDS) {
    // First to five wins; nine rounds always produce a leader.
    endMatch(state.score.vanguard > state.score.wardens ? 'vanguard' : 'wardens');
    return;
  }
  state.round += 1;
  startRound();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    if (state.phase === PHASE.MENU) startMatch();
    else hud.hideOverlay();
  } else if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    hud.showOverlay('paused');
    overlayMode = 'paused';
    hud.hideBuy();
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (overlayMode === 'round') {
    advanceRound();
  } else if (overlayMode === 'match') {
    startMatch();
  } else if (overlayMode === 'paused') {
    input.requestLock();
  } else {
    input.requestLock();
  }
});
hud.onBuy((itemId) => buy(itemId));

function syncCamera() {
  if (state.spectate && !player.alive) {
    const bot = state.spectate;
    const p = bot.body.position;
    camera.position.set(p.x - Math.sin(bot.body.yaw) * 1.2, p.y + bot.body.eye + 0.6, p.z - Math.cos(bot.body.yaw) * 1.2);
    camera.rotation.set(bot.body.pitch, bot.body.yaw, 0, 'YXZ');
    return;
  }
  const body = player.body;
  const shakeX = shake > 0 ? (rng.random() * 2 - 1) * shake * 0.02 : 0;
  const shakeY = shake > 0 ? (rng.random() * 2 - 1) * shake * 0.02 : 0;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(player.cameraPitch() + shakeX, player.cameraYaw() + shakeY, 0, 'YXZ');
}

function syncHud() {
  hud.setHealth(player.hp);
  hud.setArmor(player.armor);
  hud.setAmmo(player.weapon.state.mag, player.weapon.state.reserve);
  hud.setWeapon(player.weapon.state.def.name, player.grenades.smoke, player.grenades.flash);
  hud.setMoney(state.money);
  hud.setScore(state.score.vanguard, state.score.wardens);
  const phaseLabel = state.phase === PHASE.BUY ? 'BUY' : state.phase === PHASE.LIVE ? `ROUND ${state.round}` : state.phase === PHASE.ROUND_END ? 'ROUND OVER' : 'RUSTLINE';
  hud.setTimer(state.timer, phaseLabel);
  const spreadPx = 5 + player.weapon.spread(player.mover.groundSpeed()) * 900 + player.weapon.state.bloom * 300;
  hud.setSpread(Math.min(34, spreadPx));
  hud.setFlash(state.flashBlind > 0 ? Math.min(1, state.flashBlind) : 0);
  if (state.bomb.state === 'planting' && state.bomb.planter === player) {
    hud.setProgress('PLANTING THE BOMB', state.bomb.plantProgress / 3);
  } else if (state.bomb.state === 'defusing' && state.bomb.defuser === player) {
    hud.setProgress('DEFUSING', state.bomb.defuseProgress / 5);
  } else {
    hud.setProgress(null, 0);
  }
  if (state.bomb.state === 'planted') {
    hud.setBomb(`BOMB PLANTED at ${state.bomb.site} — ${Math.ceil(state.bomb.timer)}s`);
  }
}

function throwGrenade(kind) {
  if (state.phase !== PHASE.LIVE || !player.alive) return;
  if (player.grenades[kind] <= 0) return;
  player.grenades[kind] -= 1;
  const origin = player.eyePos();
  const dir = player.viewDir();
  const mesh = grenades.throw(kind, origin, dir, 13);
  scene.add(mesh.mesh);
  audio.bounce();
  syncHud();
}

function playerShoot() {
  const weapon = player.weapon;
  if (!weapon.ready()) {
    if (weapon.state.mag === 0 && weapon.state.reloadLeft === 0) audio.dryFire();
    return;
  }
  if (!weapon.takeRound()) return;
  const def = weapon.state.def;
  const origin = player.eyePos();
  const direction = player.viewDir();
  const spread = weapon.spread(player.mover.groundSpeed());
  const enemies = state.bots.filter((b) => b.team !== player.team);
  let anyHit = false;
  let anyKill = false;
  let anyHead = false;
  for (let p = 0; p < def.pellets; p += 1) {
    const hit = combat.shoot({
      origin, direction, spread, rng,
      damage: def.damage, headMult: def.headMult, range: def.range,
      bots: enemies, player: null, exclude: player,
    });
    if (hit.kind === 'bot') {
      const finalDamage = hit.damage * falloff(def, hit.distance);
      damageEntity(hit.entity, finalDamage, hit.part, player);
      fx.hitSpark(hit.point, hit.part === 'head');
      anyHit = true;
      anyHead = anyHead || hit.part === 'head';
      if (!hit.entity.alive) anyKill = true;
    }
  }
  weapon.pullTrigger();
  player.recoil(def.recoil, (rng.random() * 2 - 1) * def.recoil * 0.35);
  audio.shot(def.kind);
  botsHearShot(player.body.position);
  if (anyHit) {
    hud.hitMarker(anyKill, anyHead);
    audio.hit(anyHead);
    if (anyKill) audio.kill();
  }
  syncHud();
}

function tryInteract() {
  if (state.phase !== PHASE.LIVE || !player.alive) return;
  const keys = input.state.keys;
  if (!keys.has('KeyE')) return;
  const b = state.bomb;
  if (b.state === 'carried' && b.carrier === player) {
    const site = inSite(player, 'A') ? 'A' : inSite(player, 'B') ? 'B' : null;
    if (site) bomb.startPlant(player, site);
  } else if (b.state === 'planted') {
    const p = player.body.position;
    if (Math.hypot(p.x - b.position.x, p.z - b.position.z) <= 1.6) bomb.startDefuse(player);
  }
}

function inSite(entity, siteKey) {
  const s = map.sites[siteKey];
  const p = entity.body.position;
  return Math.hypot(p.x - s.center.x, p.z - s.center.z) <= s.radius;
}

function simStep(dt) {
  state.elapsed += dt;
  state.flashBlind = Math.max(0, state.flashBlind - dt);
  shake = Math.max(0, shake - dt * 1.8);
  if (state.phase === PHASE.BUY) {
    state.timer -= dt;
    player.step(dt, input.state.keys, state.elapsed, audio);
    if (state.timer <= 0) {
      state.phase = PHASE.LIVE;
      state.timer = ROUND_TIME;
      hud.hideBuy();
      hud.setBomb(state.playerSide === 'vanguard' ? 'Plant the bomb at FURNACE (A) or DEPOT (B)' : 'Hold the sites');
    }
  } else if (state.phase === PHASE.LIVE) {
    state.timer -= dt;
    player.step(dt, input.state.keys, state.elapsed, audio);
    bots.step(dt, state.elapsed);
    if (state.timer <= 0 && state.bomb.state !== 'planted' && state.bomb.state !== 'defusing') {
      endRound('wardens', 'Time expired — the bomb was never planted');
    }
  } else if (state.phase === PHASE.ROUND_END) {
    state.timer -= dt;
    if (state.timer <= 0) advanceRound();
  }
  grenades.step(dt);
  bomb.step(dt);
  // The dropped bomb waits for an attacker to walk over it.
  if (state.bomb.state === 'idle') {
    if (player.alive && player.team === 'vanguard') bomb.tryPickup(player);
    for (const bot of state.bots) {
      if (bot.alive && bot.team === 'vanguard') bomb.tryPickup(bot);
    }
  }
  fx.step(dt, state.elapsed);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  if (!shot) {
    const look = input.takeLook();
    if (input.state.locked || noLock) player.look(look.x, look.y);
    const def = player.weapon.state.def;
    const trigger = def.auto ? input.state.firing : input.state.firing && !prevFiring;
    prevFiring = input.state.firing;
    if ((input.state.locked || noLock) && state.phase === PHASE.LIVE && player.alive && trigger) playerShoot();
    if (input.wasPressed('KeyR') && player.alive) {
      if (player.weapon.reload()) audio.reload();
    }
    if (input.wasPressed('KeyB') && state.phase === PHASE.BUY) {
      hud.showBuy(state.money, ownedSnapshot());
    }
    if (input.wasPressed('KeyM')) audio.toggleMute();
    if (state.phase === PHASE.BUY) {
      for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']) {
        if (input.wasPressed(key)) {
          const item = buyList()[Number(key.slice(-1)) - 1];
          if (item) buy(item.id);
        }
      }
    }
    if (state.phase === PHASE.LIVE && player.alive) {
      const switchKeys = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'dmr', Digit5: 'pistol' };
      for (const [code, id] of Object.entries(switchKeys)) {
        if (input.wasPressed(code)) switchWeapon(id);
      }
      if (input.wasPressed('KeyG')) throwGrenade('smoke');
      if (input.wasPressed('KeyF')) throwGrenade('flash');
      tryInteract();
    }
    input.consumePressed();
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    simStep(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
  syncHud();
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) simStep(FIXED_STEP);
  syncCamera();
  syncHud();
}

function aimAtPoint(x, y, z) {
  const body = player.body;
  const dx = x - body.position.x;
  const dy = y - (body.position.y + body.eye);
  const dz = z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
}

function runShot(name) {
  hud.hideOverlay();
  resetRoundState(state);
  if (name === 'start') {
    state.round = 1;
    state.score.vanguard = 0;
    state.score.wardens = 0;
    state.money = 800;
    state.phase = PHASE.BUY;
    state.timer = 12;
    const spawn = map.spawns.attack[2];
    player.reset(spawn, 0, 'vanguard');
    player.owned = new Set(['pistol']);
    bots.spawnRound();
    bomb.reset();
    bomb.assignCarrier(player);
    hud.showBuy(800, ownedSnapshot());
    hud.setBomb('You carry the bomb — plant at FURNACE (A) or DEPOT (B)');
    aimAtPoint(-14, 1.4, -11);
    settle(30);
  } else if (name === 'play') {
    state.round = 3;
    state.score.vanguard = 1;
    state.score.wardens = 1;
    state.money = 3250;
    state.phase = PHASE.LIVE;
    state.timer = 62;
    const spawn = map.spawns.attack[2];
    player.reset(spawn, 0, 'vanguard');
    player.owned = new Set(['pistol', 'rifle']);
    player.weapon.equip('rifle', true);
    player.weapon.state.mag = 21;
    player.weapon.state.reserve = 75;
    bots.spawnRound();
    bomb.reset();
    bomb.assignCarrier(player);
    // Stage the fight: the player holds mid, an enemy crosses the lane, one
    // is already down, a teammate watches the connector.
    player.body.position.set(0, 0, 8);
    player.body.yaw = 0.35;
    player.body.pitch = 0;
    const foe = state.bots.find((b) => b.team === 'wardens');
    foe.body.position.set(1.5, 0, -3);
    foe.body.yaw = Math.PI;
    foe.target = null;
    const dead = state.bots.filter((b) => b.team === 'wardens')[1];
    dead.alive = false;
    dead.hp = 0;
    dead.body.position.set(-2.5, 0, 0.5);
    dead.deathSpin = 0.4;
    const mate = state.bots.find((b) => b.team === 'vanguard');
    mate.body.position.set(-3.5, 0, 5);
    mate.body.yaw = -0.4;
    feed('YOU ▸ HAVOC');
    settle(20);
    aimAtPoint(foe.body.position.x, 1.2, foe.body.position.z);
    settle(2);
    playerShoot();
    settle(1);
  } else if (name === 'end') {
    state.round = 2;
    state.score.vanguard = 2;
    state.score.wardens = 1;
    state.money = 3550;
    state.phase = PHASE.LIVE;
    state.timer = 40;
    const spawn = map.spawns.attack[2];
    player.reset(spawn, 0, 'vanguard');
    player.owned = new Set(['pistol', 'rifle']);
    player.weapon.equip('rifle', true);
    bots.spawnRound();
    bomb.reset();
    bomb.assignCarrier(player);
    // The bomb is planted at FURNACE; the player watches the site, a
    // defender is down beside the furnace.
    bomb.plantAt('A', 12);
    player.body.position.set(-9, 0, -6);
    player.body.yaw = 0.5;
    player.body.pitch = 0;
    const dead = state.bots.find((b) => b.team === 'wardens');
    dead.alive = false;
    dead.hp = 0;
    dead.body.position.set(-12, 0, -9);
    dead.deathSpin = 0.4;
    feed('YOU ▸ BRICK');
    feed('Bomb planted at A');
    settle(20);
    aimAtPoint(-14, 1.2, -11);
    settle(1);
    hud.showOverlay('round', {
      title: 'ROUND WON',
      copy: 'The bomb is planted at FURNACE. 2 — 1 after round 2.',
      action: 'Next round',
    });
    overlayMode = 'round';
  } else {
    // defend: the player holds DEPOT while smoke hangs over mid.
    state.round = 2;
    state.score.vanguard = 1;
    state.score.wardens = 0;
    state.money = 2950;
    state.phase = PHASE.LIVE;
    state.timer = 55;
    const spawn = map.spawns.defend[2];
    player.reset(spawn, Math.PI, 'wardens');
    player.owned = new Set(['pistol', 'rifle']);
    player.weapon.equip('rifle', true);
    bots.spawnRound();
    bomb.reset();
    const carrier = state.bots.find((b) => b.team === 'vanguard' && b.isCarrier);
    if (carrier) bomb.assignCarrier(carrier);
    player.body.position.set(6, 0, -10);
    player.body.yaw = 0;
    player.body.pitch = 0;
    const cloud = fx.addSmoke(new THREE.Vector3(6, 0.5, -1), state.elapsed + 14);
    state.smoke.push({ center: new THREE.Vector3(6, 0.5, -1), radius: cloud.radius, until: state.elapsed + 14 });
    const foe = state.bots.find((b) => b.team === 'vanguard');
    foe.body.position.set(6, 0, -4);
    foe.body.yaw = Math.PI;
    settle(20);
    aimAtPoint(foe.body.position.x, 1.2, foe.body.position.z);
    settle(1);
  }
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A small handle for play-testing from the console or a CDP client.
window.__rustline = { state, player, bots: state.bots, map, bomb, version: 'rustline-1' };

// Stage the yard behind the start overlay: both teams at their spawns.
function stageScene() {
  resetRoundState(state);
  const spawn = map.spawns.attack[2];
  player.reset(spawn, 0, 'vanguard');
  bots.spawnRound();
  bomb.reset();
  bomb.assignCarrier(player);
}

stageScene();
syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
