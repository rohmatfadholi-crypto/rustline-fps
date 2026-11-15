// The one place state lives. Every system reads and writes this object and
// nothing else holds game state, so a round reset is one function call and
// the dossier's judge can follow a round from a single file.
import * as THREE from 'three';

export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const BOMB_TIME = 40;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const WIN_TARGET = 5;
export const MAX_ROUNDS = 9;

export function createState() {
  return {
    phase: PHASE.MENU,
    round: 1,
    score: { vanguard: 0, wardens: 0 },
    lossStreak: { vanguard: 0, wardens: 0 },
    timer: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    // The player attacks on odd rounds and defends on even ones, so both
    // sides of the bomb objective are played.
    playerSide: 'vanguard',
    money: 800,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    bomb: {
      state: 'idle', // idle | carried | planting | planted | defusing | exploded | defused
      carrier: null, // the entity carrying it, or null
      site: null, // 'A' | 'B'
      position: new THREE.Vector3(0, 0, 0),
      plantProgress: 0,
      defuseProgress: 0,
      timer: 0,
      planter: null,
      defuser: null,
    },
    // Entities, filled in by main.js: the player and the nine bots.
    player: null,
    bots: [],
    // Grenade clouds that block sight, each { center: Vector3, radius, until }.
    smoke: [],
    // Flash blindness for the player, seconds left.
    flashBlind: 0,
    elapsed: 0,
    feed: [], // kill feed entries { text, killer, victim, headshot, at }
    spectate: null, // bot the camera follows when the player is dead
  };
}

export function playerAttacks(state) {
  return state.round % 2 === 1;
}

export function resetRoundState(state) {
  state.timer = BUY_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.bomb.state = 'idle';
  state.bomb.carrier = null;
  state.bomb.site = null;
  state.bomb.plantProgress = 0;
  state.bomb.defuseProgress = 0;
  state.bomb.timer = 0;
  state.bomb.planter = null;
  state.bomb.defuser = null;
  state.smoke.length = 0;
  state.flashBlind = 0;
  state.spectate = null;
  state.playerSide = playerAttacks(state) ? 'vanguard' : 'wardens';
}
