// Rounds: buy phase, the live round, plant and defuse, the economy and the
// match. It owns the clock and the money; main.js owns the frame and the aim.
import { MAP } from './map.js';
import { PHASE, WIN_ROUNDS, ROUND_TIME, BUY_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { WEAPONS, GRENADES } from './weapons.js';

const WIN_BONUS = 400;
const LOSS_BONUS = 200;
const KILL_BONUS = 150;
const PLANT_BONUS = 200;
const DEFUSE_BONUS = 300;

export function createRounds(ctx) {
  const { state, hud, sfx } = ctx;

  function aliveTeams() {
    return {
      atk: ctx.playerAlive() + ctx.bots.aliveCount('atk'),
      def: ctx.bots.aliveCount('def'),
    };
  }

  function startRound() {
    state.phase = PHASE.BUY;
    state.phaseT = BUY_TIME;
    state.bomb = {
      state: 'carried', carrier: 'player', site: null, fuse: 0,
      progress: 0, actor: null, x: 0, z: 0,
    };
    ctx.resetActors();
    ctx.weapon.equip('ketapel');
    ctx.weapon.state.grenades = { durian: 0, cabe: 0 };
    hud.setBomb('Durian with you — plant at A or B', 'carry');
    hud.setPrompt('');
    hud.setProgress(null, 0);
  }

  function startMatch() {
    state.score = { atk: 0, def: 0 };
    state.round = 1;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    startRound();
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
    state.score[winner] += 1;
    const playerWon = winner === 'atk';
    state.money += playerWon ? WIN_BONUS : LOSS_BONUS;
    hud.setScore(state.score.atk, state.score.def);
    hud.setMoney(state.money);
    if (playerWon) sfx.roundWin();
    else sfx.roundLose();
    const matchOver = state.score[winner] >= WIN_ROUNDS;
    state.phase = matchOver ? PHASE.MATCH_END : PHASE.ROUND_END;
    state.phaseT = matchOver ? 0 : 4;
    const title = matchOver
      ? (playerWon ? 'Kru Senja win the market!' : 'Satpam Pasar hold the market!')
      : (playerWon ? 'Round won — Kru Senja!' : 'Round lost — Satpam Pasar!');
    const sub = `${reason}  ·  Kru Senja ${state.score.atk} — ${state.score.def} Satpam Pasar` +
      (matchOver ? '' : `  ·  Next round in a moment (+$${playerWon ? WIN_BONUS : LOSS_BONUS}).`);
    if (matchOver) {
      hud.showOverlay('match', { title, sub });
      ctx.exitLock();
    } else {
      hud.showBanner(title, sub);
    }
    if (ctx.onRoundEnd) ctx.onRoundEnd(winner, reason);
  }

  function plantBomb(site, byPlayer) {
    if (state.bomb.state !== 'carried') return;
    state.bomb.state = 'planted';
    state.bomb.site = site;
    state.bomb.fuse = BOMB_TIME;
    state.bomb.progress = 0;
    state.bomb.actor = null;
    const s = MAP.sites[site];
    state.bomb.x = s.x;
    state.bomb.z = s.z;
    if (byPlayer) {
      state.money += PLANT_BONUS;
      hud.setMoney(state.money);
      hud.addFeed(`You planted the durian at ${s.name}! (+$${PLANT_BONUS})`);
    } else {
      hud.addFeed(`The durian is planted at ${s.name}!`);
    }
    hud.setBomb(`DURIAN PLANTED at ${s.name} — ${BOMB_TIME}s`, 'planted');
    sfx.plantBeep();
    ctx.onBombPlanted(site);
  }

  function defuseBomb(byPlayer) {
    if (state.bomb.state !== 'planted') return;
    state.bomb.state = 'defused';
    state.bomb.progress = 0;
    state.bomb.actor = null;
    hud.setBomb('Durian defused — Satpam Pasar save the market', 'defused');
    sfx.defuseBeep();
    ctx.onBombDefused();
  }

  function explodeBomb() {
    if (state.bomb.state !== 'planted') return;
    state.bomb.state = 'exploded';
    sfx.explosion();
    ctx.onBombExploded();
    endRound('atk', 'The durian went off. The bakso cart is now a crater.');
  }

  // Buy during the buy phase: number keys. Returns true when a purchase lands.
  function buy(code) {
    if (state.phase !== PHASE.BUY) return false;
    const rows = { Digit1: 'ketapel', Digit2: 'bambu', Digit3: 'sambal', Digit4: 'panjang', Digit5: 'kerupuk' };
    const grens = { Digit6: 'durian', Digit7: 'cabe' };
    if (rows[code]) {
      const def = WEAPONS[rows[code]];
      if (state.money < def.price) return false;
      state.money -= def.price;
      ctx.weapon.equip(rows[code]);
      hud.setMoney(state.money);
      hud.setWeapon(def.name);
      hud.setAmmo(ctx.weapon.state.mag, ctx.weapon.state.reserve);
      sfx.buy();
      return true;
    }
    if (grens[code]) {
      const def = GRENADES[grens[code]];
      if (state.money < def.price) return false;
      if (ctx.weapon.state.grenades[grens[code]] >= 2) return false;
      state.money -= def.price;
      ctx.weapon.state.grenades[grens[code]] += 1;
      hud.setMoney(state.money);
      sfx.buy();
      return true;
    }
    return false;
  }

  function step(dt) {
    if (state.phase === PHASE.BUY) {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        state.phase = PHASE.LIVE;
        state.phaseT = ROUND_TIME;
        hud.showBuy(false);
        hud.addFeed(`Round ${state.round} — plant the durian at A or B!`);
      }
      return;
    }
    if (state.phase === PHASE.ROUND_END) {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        state.round += 1;
        startRound();
      }
      return;
    }
    if (state.phase !== PHASE.LIVE) return;
    // Live round: the clock, the fuse, and the elimination checks.
    if (state.bomb.state === 'planted') {
      state.bomb.fuse -= dt;
      hud.setBomb(`DURIAN PLANTED — ${Math.max(0, Math.ceil(state.bomb.fuse))}s to boom`, 'planted');
      if (state.bomb.fuse <= 0) {
        explodeBomb();
        return;
      }
    } else {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        endRound('def', 'Time! The Satpam kept the market standing.');
        return;
      }
    }
    const alive = aliveTeams();
    hud.setAlive(alive.atk, alive.def);
    if (alive.def === 0) {
      endRound('atk', 'Satpam Pasar wiped out.');
      return;
    }
    if (alive.atk === 0) {
      if (state.bomb.state === 'planted') {
        // The durian is still ticking: defenders must defuse it.
        if (!ctx.bots.bots.some((b) => b.alive && b.team === 'def')) endRound('atk', 'Nobody left to defuse.');
      } else {
        endRound('def', 'Kru Senja wiped out.');
      }
    }
  }

  return {
    startMatch, startRound, endRound, plantBomb, defuseBomb, explodeBomb, buy, step,
    plantTime: PLANT_TIME, defuseTime: DEFUSE_TIME,
  };
}
