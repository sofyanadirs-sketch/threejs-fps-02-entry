// The DOM HUD: health, ammo, money, round timer, score, alive counts, kill
// feed, bomb status and the buy menu. It never touches the simulation; main.js
// pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADES } from './weapons.js';

const BUY_ROWS = [
  ['1', 'Ketapel', WEAPONS.ketapel],
  ['2', 'Bedil Bambu', WEAPONS.bambu],
  ['3', 'Semprotan Sambal', WEAPONS.sambal],
  ['4', 'Bedil Panjang', WEAPONS.panjang],
  ['5', 'Meriam Kerupuk', WEAPONS.kerupuk],
  ['6', 'Durian Lempar (frag)', GRENADES.durian],
  ['7', 'Cabe Rawit (flash)', GRENADES.cabe],
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const hpFill = $('hp-fill');
  const hpText = $('hp-text');
  const moneyText = $('money-value');
  const timerText = $('timer-value');
  const timer = $('timer');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const weaponName = $('weapon-name');
  const feed = $('feed');
  const bombStatus = $('bomb-status');
  const prompt = $('prompt');
  const progress = $('progress');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const flash = $('flash');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const roundBanner = $('round-banner');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Build the buy menu rows once.
  const buyList = $('buy-list');
  for (const [key, label, def] of BUY_ROWS) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-key">${key}</span><span class="buy-name">${label}</span><span class="buy-desc">${def.desc}</span><span class="buy-price">$${def.price}</span>`;
    buyList.appendChild(row);
  }

  return {
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { setText(weaponName, 'weapon', name); },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      setText(hpText, 'hp', String(v));
      hpFill.style.width = `${v}%`;
      hpFill.classList.toggle('low', v <= 30);
    },
    setMoney(m) { setText(moneyText, 'money', `${m}`); setText(buyMoney, 'buymoney', `$${m}`); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerText, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timer.classList.toggle('buy', phase === 'buy');
    },
    setScore(atk, def) {
      setText(scoreAtk, 'satk', String(atk));
      setText(scoreDef, 'sdef', String(def));
    },
    setAlive(atk, def) {
      setText(aliveAtk, 'aatk', String(atk));
      setText(aliveDef, 'adef', String(def));
    },
    setBomb(text, kind) {
      setText(bombStatus, 'bomb', text);
      bombStatus.className = kind ? `bomb-${kind}` : '';
    },
    setPrompt(text) { setText(prompt, 'prompt', text); },
    setProgress(label, frac) {
      if (!label) {
        progress.hidden = true;
        return;
      }
      progress.hidden = false;
      setText(progressLabel, 'proglabel', label);
      progressFill.style.width = `${Math.round(frac * 100)}%`;
    },
    showBuy(show) { buyMenu.hidden = !show; },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    addFeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    },
    flashBlind(strength) {
      flash.style.opacity = String(Math.min(1, strength));
      setTimeout(() => { flash.style.opacity = '0'; }, 120);
      setTimeout(() => { flash.style.opacity = '0'; }, 400);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    showBanner(titleText, subText) {
      roundBanner.querySelector('.banner-title').textContent = titleText;
      roundBanner.querySelector('.banner-sub').textContent = subText;
      roundBanner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { roundBanner.hidden = true; }, 3200);
    },
    showOverlay(mode, data) {
      const texts = {
        start: ['Pasar Senja: Durian Strike', 'A tactical FPS at the night market. Plant the durian at Gerobak Bakso or Lapak Sate — or stop the Kru Senja from doing it.', 'Click to play'],
        paused: ['Paused', 'The market waits. Click to resume.', 'Click to resume'],
        round: [data.title, data.sub, 'Next round'],
        match: [data.title, data.sub, 'Play again'],
      };
      const [t, c, action] = texts[mode];
      title.textContent = t;
      copy.textContent = c;
      play.textContent = action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
