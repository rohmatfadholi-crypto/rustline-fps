// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// kill feed, bomb status, buy menu and the overlay panels. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out. Every
// setter caches its last value so the DOM is only touched on a change.
import { buyList } from './economy.js';

const OVERLAY_COPY = {
  start: {
    title: 'RUSTLINE',
    copy: 'A foundry yard at dusk. Plant the bomb at FURNACE or DEPOT — or hold the yard and defuse it.',
    action: 'Click to play',
  },
  paused: {
    title: 'RUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const keysList = $('keys-list');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageArc = $('damage-arc');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorFill = $('armor-fill');
  const armorValue = $('armor-value');
  const vitalsEl = $('vitals');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const grenadeCounts = $('grenades');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const phaseValue = $('phase-value');
  const scoreValue = $('score-value');
  const bombLine = $('bomb-line');
  const feedBox = $('feed');
  const buyPanel = $('buy');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const progressWrap = $('progress-wrap');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const flashVeil = $('flash-veil');
  const spectateNote = $('spectate-note');

  let last = {};
  let feedTimer = 0;
  let hitTimer = 0;
  let damageTimer = 0;

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function renderBuy(money, owned) {
    buyItems.innerHTML = '';
    for (const item of buyList()) {
      const ownedCount = item.id === 'smoke' || item.id === 'flash'
        ? owned[item.id] || 0
        : item.id === 'armor' ? (owned.armor ? 1 : 0) : (owned.weapon === item.id ? 1 : 0);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.id = item.id;
      const affordable = money >= item.price;
      button.disabled = !affordable && ownedCount === 0;
      button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-note">${item.note}</span><span class="buy-price">${item.price === 0 ? 'OWNED' : '$' + item.price}</span>${ownedCount ? '<span class="buy-owned">✓</span>' : ''}`;
      buyItems.appendChild(button);
    }
    setText(buyMoney, `$${money}`, 'buyMoney');
  }

  return {
    setHealth(hp) {
      if (last.hp === hp) return;
      last.hp = hp;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      setText(healthValue, String(Math.ceil(hp)), 'hpText');
    },
    setArmor(armor) {
      if (last.armor === armor) return;
      last.armor = armor;
      armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
      setText(armorValue, String(Math.ceil(armor)), 'armorText');
    },
    setAmmo(mag, reserve) {
      if (last.mag === mag && last.reserve === reserve) return;
      last.mag = mag;
      last.reserve = reserve;
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setWeapon(name, smoke, flash) {
      if (last.weapon !== name || last.smoke !== smoke || last.flash !== flash) {
        last.weapon = name;
        last.smoke = smoke;
        last.flash = flash;
        setText(weaponName, name, 'weaponName');
        setText(grenadeCounts, `SMK ${smoke} · FLS ${flash}`, 'grenades');
      }
    },
    setMoney(money) {
      if (last.money === money) return;
      last.money = money;
      setText(moneyValue, `$${money}`, 'money');
    },
    setTimer(seconds, phase) {
      // setText owns the cache; this setter must not pre-fill it, or the
      // write below would be skipped as "unchanged" every time.
      setText(timerValue, `${Math.max(0, Math.ceil(seconds))}`, 'timer');
      setText(phaseValue, phase, 'phase');
    },
    setScore(vanguard, wardens) {
      setText(scoreValue, `VANGUARD ${vanguard} — ${wardens} WARDENS`, 'score');
    },
    setBomb(text) {
      setText(bombLine, text, 'bomb');
      bombLine.classList.toggle('hot', text.includes('PLANTED'));
    },
    setSpread(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed, headshot) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      hitmarker.classList.toggle('head', headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill', 'head'), killed ? 220 : 120);
    },
    damageFrom(angleDeg) {
      damageArc.style.transform = `rotate(${angleDeg}deg)`;
      damageArc.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageArc.classList.remove('on'), 450);
    },
    feed(text) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.textContent = text;
      feedBox.prepend(entry);
      while (feedBox.children.length > 4) feedBox.removeChild(feedBox.lastChild);
      clearTimeout(feedTimer);
      feedTimer = setTimeout(() => { feedBox.innerHTML = ''; }, 6000);
    },
    showBuy(money, owned) {
      renderBuy(money, owned);
      buyPanel.hidden = false;
      // The panel reaches the bottom-left corner, so the vitals hide while
      // buying; health stays visible in the top bar and money in the panel.
      vitalsEl.hidden = true;
    },
    hideBuy() {
      buyPanel.hidden = true;
      vitalsEl.hidden = false;
    },
    refreshBuy(money, owned) {
      if (!buyPanel.hidden) renderBuy(money, owned);
    },
    onBuy(handler) {
      buyItems.addEventListener('click', (event) => {
        const button = event.target.closest('.buy-item');
        if (button) handler(button.dataset.id);
      });
    },
    setProgress(label, fraction) {
      if (label === null) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressFill.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
      setText(progressLabel, label, 'progressLabel');
    },
    setFlash(amount) {
      flashVeil.style.opacity = String(Math.max(0, Math.min(1, amount)));
    },
    showSpectate(text) {
      spectateNote.hidden = false;
      setText(spectateNote, text, 'spectate');
    },
    hideSpectate() {
      spectateNote.hidden = true;
    },
    showOverlay(mode, detail) {
      if (mode === 'round' || mode === 'match') {
        overlayTitle.textContent = detail.title;
        overlayCopy.textContent = detail.copy;
        playButton.textContent = detail.action;
        // Between rounds the keys are noise; the panel stays small so the
        // yard behind it stays visible.
        keysList.hidden = true;
      } else {
        const text = OVERLAY_COPY[mode];
        overlayTitle.textContent = text.title;
        overlayCopy.textContent = text.copy;
        playButton.textContent = text.action;
        keysList.hidden = false;
      }
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
  };
}
