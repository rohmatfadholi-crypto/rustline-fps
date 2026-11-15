// The economy: money earned per round and spent in the buy menu. A win pays
// $3,250, a loss $1,900 plus $500 per consecutive loss up to $3,400, a kill
// $300, a plant or a defuse $300. The buy menu is a data table the HUD
// renders; the simulation only moves numbers.
import { WEAPONS } from './weapons.js';

export const GRENADE_PRICES = { smoke: 300, flash: 200 };
export const ARMOR_PRICE = 650;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_REWARD_CAP = 3400;
export const KILL_REWARD = 300;
export const OBJECTIVE_REWARD = 300;

export function buyList() {
  return [
    { key: '1', id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, note: '25 rnd · auto · all-round' },
    { key: '2', id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, note: '28 rnd · fast · close range' },
    { key: '3', id: 'shotgun', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, note: '6 shells · 8 pellets · close' },
    { key: '4', id: 'dmr', name: WEAPONS.dmr.name, price: WEAPONS.dmr.price, note: '10 rnd · 80 dmg · long lanes' },
    { key: '5', id: 'pistol', name: WEAPONS.pistol.name, price: 0, note: 'sidearm · always owned' },
    { key: '6', id: 'smoke', name: 'SMK-2 SMOKE', price: GRENADE_PRICES.smoke, note: 'blocks sight · 14 s' },
    { key: '7', id: 'flash', name: 'FLS-1 FLASH', price: GRENADE_PRICES.flash, note: 'blinds who looks at it' },
    { key: '8', id: 'armor', name: 'PLATE VEST', price: ARMOR_PRICE, note: 'absorbs half the damage' },
  ];
}

// The round's end-of-round payout for one side.
export function roundReward(won, lossStreak) {
  if (won) return WIN_REWARD;
  return Math.min(LOSS_REWARD_CAP, LOSS_REWARD + LOSS_STREAK_BONUS * lossStreak);
}
