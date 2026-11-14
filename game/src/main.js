// Pasar Senja: Durian Strike — boot and the one loop. A fixed 60 Hz simulation
// feeds a render at the display's rate. ?shot=start|play|end|buy&seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, nearestWaypoint } from './map.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createState, PHASE, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { initAudio, sfx } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.dusk);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.dusk), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const combat = createCombat(scene, world.shootables, world.colliders);
const hud = createHud();
const weapon = createWeaponRig(camera);
const player = createPlayer(world.colliders, MAP.spawns.atk[0]);
const input = createInput(renderer.domElement, onLockChange);

let hp = 100;
let bloom = 0;
let grenadeCooldown = 0;
let plantProgress = 0;
let spectateBot = null;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;

// The planted durian: a spiky ball that appears on the site.
const durian = new THREE.Group();
{
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.durian), roughness: 0.75 }));
  durian.add(core);
  const spikeGeo = new THREE.ConeGeometry(0.09, 0.22, 6);
  const spikeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a7a1e'), roughness: 0.8 });
  for (let i = 0; i < 14; i += 1) {
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    spike.position.set(
      0.42 * Math.sin(phi) * Math.cos(theta),
      0.42 * Math.cos(phi),
      0.42 * Math.sin(phi) * Math.sin(theta),
    );
    spike.lookAt(spike.position.x * 2, spike.position.y * 2, spike.position.z * 2);
    spike.rotateX(Math.PI / 2);
    durian.add(spike);
  }
  const blink = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  blink.position.set(0, 0.48, 0);
  blink.name = 'blink';
  durian.add(blink);
  durian.visible = false;
  scene.add(durian);
}

// --- actors: the one shape bots and grenades damage -------------------------
const playerActor = {
  pos: player.state.body.position,
  eyeY: 1.6, alive: true, speed: 0, crouching: false, isPlayer: true, name: 'You',
  damage(amount, killer) {
    if (!playerActor.alive || state.phase !== PHASE.LIVE) return;
    hp -= amount;
    sfx.hurt();
    hud.setHealth(hp);
    if (hp > 0) return;
    hp = 0;
    playerActor.alive = false;
    player.state.alive = false;
    state.deaths += 1;
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') transferCarrier();
    hud.addFeed(killer && killer.name ? `${killer.name} got you.` : 'You are down.');
    hud.showBanner('You are down', 'Spectating your team — the round goes on.');
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onFlash(seconds, pos) {
    // blind only when actually looking at the pop
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const to = new THREE.Vector3().copy(pos).sub(camera.position).normalize();
    if (dir.dot(to) > -0.1) hud.flashBlind(Math.min(1, seconds));
  },
};

function botActor(bot) {
  if (bot.actor) return bot.actor;
  bot.actor = {
    pos: bot.body.position,
    eyeY: 1.55, alive: true, speed: 0, crouching: false, isPlayer: false, name: bot.name,
    damage(amount, killer) {
      const killed = bots.damage(bot, amount, killer);
      if (killed) {
        hud.addFeed(`${killer && killer.name ? killer.name : 'Someone'} dropped ${bot.name}.`);
      }
      return killed;
    },
    onFlash(seconds, pos) {
      const to = new THREE.Vector3().copy(pos).sub(bot.body.position).normalize();
      const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      if (facing.dot(to) > -0.1) bot.blindT = Math.max(bot.blindT, seconds);
    },
  };
  return bot.actor;
}

function transferCarrier() {
  const aliveAtk = bots.bots.filter((b) => b.alive && b.team === 'atk');
  if (!aliveAtk.length) {
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    hud.setBomb('Durian dropped — nobody left to carry it', 'dropped');
    return;
  }
  const next = aliveAtk[Math.floor(random() * aliveAtk.length)];
  next.carrier = true;
  next.site = state.bomb.site || pickSite();
  worldInfo.siteWp = next.site === 'A' ? 'aSite' : 'bSite';
  state.bomb.carrier = next.id;
  hud.addFeed(`${next.name} picked up the durian.`);
  hud.setBomb(`Durian with ${next.name} — plant at ${next.site}`, 'carry');
}

function pickSite() {
  return random() < 0.5 ? 'A' : 'B';
}

// --- world facts the bots read each step ------------------------------------
const worldInfo = {
  bombPlanted: false, bombSite: null, siteWp: 'aSite', defuser: null, elapsed: 0,
  phase: PHASE.BUY, carrierPos: { x: 0, z: 14 },
};

function onBombPlanted(site) {
  worldInfo.bombPlanted = true;
  worldInfo.bombSite = site;
  const s = MAP.sites[site];
  durian.position.set(s.x, s.dy, s.z);
  durian.visible = true;
  // the nearest living guard runs to defuse
  let best = null;
  let bestD = Infinity;
  for (const b of bots.bots) {
    if (!b.alive || b.team !== 'def') continue;
    const d = (b.body.position.x - s.x) ** 2 + (b.body.position.z - s.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  worldInfo.defuser = best;
  if (best) hud.addFeed(`${best.name} is running to defuse!`);
}

function onBombDefused() {
  worldInfo.bombPlanted = false;
  worldInfo.defuser = null;
  durian.visible = false;
  rounds.endRound('def', 'The durian was defused — the sate grill survives.');
}

function onBombExploded() {
  worldInfo.bombPlanted = false;
  worldInfo.defuser = null;
  durian.visible = false;
  const s = MAP.sites[state.bomb.site];
  const center = new THREE.Vector3(s.x, 0.6, s.z);
  const actors = [playerActor, ...bots.bots.map((b) => botActor(b))];
  for (const a of actors) {
    if (!a.alive) continue;
    const d = a.pos.distanceTo(center);
    if (d < 8) a.damage(140 * (1 - d / 10), null);
  }
}

// --- bots --------------------------------------------------------------------
const bots = createBots(scene, world.colliders, combat.hasLineOfSight, {
  onDeath(bot, killer) {
    if (bot.carrier) {
      bot.carrier = false;
      if (state.bomb.state === 'carried') transferCarrier();
    }
    if (killer === 'player') {
      state.kills += 1;
      state.money += 150;
      hud.setMoney(state.money);
      sfx.kill();
    }
  },
  onShot(from, to, hit) {
    combat.trace(from, to);
    const d = from.distanceTo(player.state.body.position);
    if (d < 22) sfx.shot('rifle');
  },
  onNoise(pos, team) {
    bots.hear(pos, team);
  },
  onPlantStart(bot) {
    hud.addFeed(`${bot.name} is planting the durian…`);
  },
  onPlantTick(bot, t) {
    if (t >= PLANT_TIME && state.bomb.state === 'carried') {
      rounds.plantBomb(bot.site, false);
    }
  },
  onDefuseStart(bot) {
    hud.addFeed(`${bot.name} is defusing the durian!`);
  },
  onDefuseTick(bot, t) {
    if (t >= DEFUSE_TIME && state.bomb.state === 'planted') {
      rounds.defuseBomb(false);
    }
  },
});

// --- rounds ------------------------------------------------------------------
const rounds = createRounds({
  state, hud, sfx,
  bots,
  weapon,
  playerAlive: () => (playerActor.alive ? 1 : 0),
  resetActors() {
    hp = 100;
    playerActor.alive = true;
    playerActor.speed = 0;
    player.reset(MAP.spawns.atk[0]);
    playerActor.eyeY = player.state.eye;
    bots.reset(MAP.spawns, random);
    for (const b of bots.bots) {
      b.actor = null;
      botActor(b);
      b.carrier = false;
      b.site = null;
      if (b.team === 'atk') b.site = pickSite();
    }
    worldInfo.bombPlanted = false;
    worldInfo.bombSite = null;
    worldInfo.defuser = null;
    worldInfo.siteWp = 'aSite';
    durian.visible = false;
    spectateBot = null;
    plantProgress = 0;
    hud.setHealth(hp);
    hud.setScore(state.score.atk, state.score.def);
    hud.setMoney(state.money);
    hud.setWeapon(WEAPONS.ketapel.name);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.setAlive(4, 4);
  },
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onBombPlanted,
  onBombDefused,
  onBombExploded,
  onRoundEnd() {},
});

hud.onPlay(() => {
  if (shot) return;
  initAudio();
  if (state.phase === PHASE.MATCH_END) {
    rounds.startMatch();
    hud.setScore(0, 0);
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (state.phase === PHASE.MATCH_END) {
    hud.showOverlay('match', { title: 'Match over', sub: 'Click to play again.' });
  } else if (state.phase === PHASE.LIVE && playerActor.alive) {
    hud.showOverlay('paused', {});
  }
}

// --- shooting ------------------------------------------------------------------
const rayDir = new THREE.Vector3();
const shootFrom = new THREE.Vector3();

function playerShoot() {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    sfx.dryFire();
    weapon.reload();
    return;
  }
  weapon.pullTrigger();
  sfx.shot(def.kind);
  bloom = Math.min(0.05, bloom + (def.kind === 'sniper' ? 0.03 : 0.012));
  const speed = player.groundSpeed();
  // fresh matrices: in shot mode no render has run since the bots were moved
  scene.updateMatrixWorld(true);
  for (let p = 0; p < def.pellets; p += 1) {
    camera.getWorldDirection(rayDir);
    const spread = weapon.spread(speed) + bloom;
    rayDir.x += (random() * 2 - 1) * spread;
    rayDir.y += (random() * 2 - 1) * spread;
    rayDir.z += (random() * 2 - 1) * spread;
    rayDir.normalize();
    shootFrom.copy(camera.position);
    const hit = combat.shoot(shootFrom, rayDir, def, bots.hitMeshes);
    if (hit) {
      const killed = bots.damage(hit.bot, hit.damage, 'player');
      hud.hitMarker(killed, shot ? 4000 : 90);
      if (killed) {
        state.kills += 1;
        state.money += 150;
        hud.setMoney(state.money);
        hud.addFeed(`You dropped ${hit.bot.name}${hit.part === 'head' ? ' — headshot!' : '.'} (+$150)`);
        sfx.kill();
      } else {
        sfx.hit();
      }
    }
  }
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hear(player.state.body.position, 'atk');
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function throwGrenade(kind) {
  if (grenadeCooldown > 0 || state.phase !== PHASE.LIVE) return;
  if (weapon.state.grenades[kind] <= 0) return;
  weapon.state.grenades[kind] -= 1;
  grenadeCooldown = 0.8;
  camera.getWorldDirection(rayDir);
  combat.throwGrenade(kind, camera.position, rayDir, 11);
  sfx.click();
  bots.hear(player.state.body.position, 'atk');
}

// --- per-frame simulation ------------------------------------------------------
function step(dt) {
  state.elapsed += dt;
  bloom = Math.max(0, bloom - dt * 0.04);
  grenadeCooldown = Math.max(0, grenadeCooldown - dt);
  rounds.step(dt);

  if (state.phase === PHASE.LIVE && playerActor.alive) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    player.step(dt, input.state.keys);
    playerActor.speed = player.groundSpeed();
    playerActor.crouching = player.state.crouching;
    playerActor.eyeY = player.state.body.position.y + player.state.eye;

    // scope
    const def = weapon.def();
    const wantScope = input.state.scoping && def.zoom > 1 && weapon.state.reloadLeft === 0;
    if (wantScope !== weapon.state.scoped) {
      weapon.state.scoped = wantScope;
      camera.fov = wantScope ? 74 / def.zoom : 74;
      camera.updateProjectionMatrix();
    }

    // fire
    const firing = input.state.firing;
    const trigger = def.auto ? firing : (firing && !prevFiring);
    prevFiring = firing;
    if (trigger && weapon.ready()) playerShoot();
    else if (trigger && weapon.state.mag === 0) {
      sfx.dryFire();
      weapon.reload();
    }
    if (input.state.keys.has('KeyR')) {
      weapon.reload();
      sfx.reload();
    }
    weapon.step(dt);

    // grenades
    const pressed = input.takePressed();
    if (pressed.has('KeyG')) throwGrenade('durian');
    if (pressed.has('KeyF')) throwGrenade('cabe');

    // plant channel: hold E inside a site while carrying the durian
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player' && input.state.keys.has('KeyE')) {
      let site = null;
      for (const [name, s] of Object.entries(MAP.sites)) {
        const dx = player.state.body.position.x - s.x;
        const dz = player.state.body.position.z - s.z;
        if (dx * dx + dz * dz < s.r * s.r) site = name;
      }
      if (site) {
        plantProgress += dt / PLANT_TIME;
        hud.setProgress(`Planting durian at ${MAP.sites[site].name}…`, Math.min(1, plantProgress));
        if (plantProgress >= 1) {
          plantProgress = 0;
          hud.setProgress(null, 0);
          rounds.plantBomb(site, true);
        }
      } else {
        plantProgress = 0;
        hud.setProgress(null, 0);
      }
    } else {
      plantProgress = 0;
      hud.setProgress(null, 0);
    }
  } else {
    input.takePressed();
    input.takeLook();
    weapon.step(dt);
  }

  // buy phase keys (work even without pointer lock, before the first click)
  if (state.phase === PHASE.BUY) {
    const pressed = input.takePressed();
    if (pressed.has('KeyB')) hud.showBuy(true);
    for (const code of pressed) rounds.buy(code);
    if (pressed.has('Escape')) hud.showBuy(false);
    // keep the buy menu visible during the whole buy phase
    hud.showBuy(true);
  }

  // bots
  if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    worldInfo.phase = state.phase;
    // escorts follow the carrier: the player's nearest site, or the bot's own
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
      const p = player.state.body.position;
      worldInfo.carrierPos = { x: p.x, z: p.z };
      const dA = (p.x - MAP.sites.A.x) ** 2 + (p.z - MAP.sites.A.z) ** 2;
      const dB = (p.x - MAP.sites.B.x) ** 2 + (p.z - MAP.sites.B.z) ** 2;
      worldInfo.siteWp = dA < dB ? 'aSite' : 'bSite';
    } else if (state.bomb.carrier && state.bomb.carrier !== 'player') {
      const cb = bots.bots.find((b) => b.id === state.bomb.carrier);
      if (cb) worldInfo.carrierPos = { x: cb.body.position.x, z: cb.body.position.z };
    }
    const atkEnemies = bots.bots.filter((b) => b.alive && b.team === 'def').map((b) => botActor(b));
    const defEnemies = bots.bots.filter((b) => b.alive && b.team === 'atk').map((b) => botActor(b));
    if (playerActor.alive && state.phase === PHASE.LIVE) defEnemies.push(playerActor);
    for (const b of bots.bots) {
      const a = botActor(b);
      a.eyeY = b.body.position.y + b.eye;
      a.speed = Math.hypot(b.body.velocity.x, b.body.velocity.z);
      a.alive = b.alive;
    }
    worldInfo.elapsed = state.elapsed;
    bots.step(dt, { atk: defEnemies, def: atkEnemies }, worldInfo);
  }

  // grenades, tracers, explosions
  const actors = [playerActor, ...bots.bots.map((b) => botActor(b))];
  combat.step(dt, actors, (pos, kind) => {
    if (kind === 'durian') sfx.explosion();
  });

  // durian blink
  if (durian.visible) {
    const blink = durian.getObjectByName('blink');
    if (blink) blink.visible = Math.floor(state.elapsed * 4) % 2 === 0;
    durian.rotation.y += dt * 0.8;
  }
}

function syncCamera() {
  if (playerActor.alive) {
    camera.position.set(
      player.state.body.position.x,
      player.state.body.position.y + player.state.eye,
      player.state.body.position.z,
    );
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  } else {
    // spectate the first living teammate
    if (!spectateBot || !spectateBot.alive) {
      spectateBot = bots.bots.find((b) => b.alive && b.team === 'atk') || null;
    }
    if (spectateBot) {
      camera.position.set(
        spectateBot.body.position.x,
        spectateBot.body.position.y + 1.55,
        spectateBot.body.position.z,
      );
      camera.rotation.set(spectateBot.pitch || 0, spectateBot.yaw, 0, 'YXZ');
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // HUD, every frame (the hud caches unchanged values)
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.setHealth(hp);
    hud.setTimer(state.phase === PHASE.BUY ? state.phaseT : state.phase === PHASE.LIVE ? state.phaseT : 0, state.phase);
    hud.setCrosshairSpread(4 + player.groundSpeed() * 2.2 + bloom * 500);
    if (state.phase === PHASE.BUY) {
      hud.setPrompt('Buy phase — press 1-7 to buy, B for the list');
    } else if (state.phase === PHASE.LIVE && state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
      let near = null;
      for (const [name, s] of Object.entries(MAP.sites)) {
        const dx = player.state.body.position.x - s.x;
        const dz = player.state.body.position.z - s.z;
        if (dx * dx + dz * dz < s.r * s.r) near = s.name;
      }
      hud.setPrompt(near ? `Hold E — plant the durian at ${near}` : 'Carry the durian to Site A (Gerobak Bakso) or Site B (Lapak Sate)');
    } else if (state.phase === PHASE.LIVE && state.bomb.state === 'planted') {
      hud.setPrompt('The durian is ticking — hold the site!');
    } else if (!playerActor.alive) {
      hud.setPrompt('You are down — spectating your team.');
    } else {
      hud.setPrompt('');
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + player.state.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  rounds.startMatch();
  if (name === 'start') {
    // buy phase from the south-west corner, looking across the whole market
    player.state.body.position.set(-12, 0, 13);
    player.state.yaw = -0.65;
    player.state.pitch = 0.04;
    settle(20);
    hud.showBuy(true);
  } else if (name === 'play') {
    // mid-fight: force the round live, put guards in mid, shoot one
    state.phase = PHASE.LIVE;
    state.phaseT = 62;
    player.state.body.position.set(0, 0, 4);
    player.state.yaw = 0;
    settle(10);
    const guards = bots.bots.filter((b) => b.team === 'def');
    guards[0].body.position.set(-1.5, 0, -1);
    guards[0].yaw = Math.PI;
    guards[1].body.position.set(2, 0, -2.5);
    guards[1].yaw = Math.PI * 0.9;
    guards[2].body.position.set(-5, 0, 1);
    guards[2].yaw = Math.PI * 0.8;
    const mate = bots.bots.find((b) => b.team === 'atk');
    mate.body.position.set(2.5, 0, 6);
    mate.yaw = 0;
    settle(30);
    // two headshots drop the first guard, a body shot tags the second
    const g0 = guards[0];
    const g1 = guards[1];
    aimAt(new THREE.Vector3(g0.body.position.x, g0.body.position.y + 1.58, g0.body.position.z));
    playerShoot();
    settle(6);
    aimAt(new THREE.Vector3(g0.body.position.x, g0.body.position.y + 1.58, g0.body.position.z));
    playerShoot();
    settle(8);
    aimAt(new THREE.Vector3(g1.body.position.x, g1.body.position.y + 1.45, g1.body.position.z));
    playerShoot();
    settle(8);
  } else if (name === 'end') {
    // the durian planted at Gerobak Bakso, ticking, player holding the site
    state.phase = PHASE.LIVE;
    state.phaseT = 40;
    rounds.plantBomb('A', true);
    player.state.body.position.set(16, 0, -7);
    settle(10);
    aimAt(new THREE.Vector3(20, 1.6, -12));
    hud.showBanner('Durian planted at Gerobak Bakso!', '35 seconds to boom — hold the site, Kru Senja.');
    settle(6);
  } else if (name === 'buy') {
    // the buy, made: Semprotan Sambal bought, money down to $250
    rounds.buy('Digit3');
    player.state.body.position.set(-7, 0, 12);
    player.state.yaw = -0.45;
    player.state.pitch = 0.03;
    settle(20);
    hud.showBuy(true);
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(hp);
  hud.setMoney(state.money);
  hud.setTimer(state.phaseT, state.phase);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
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

rounds.startMatch();
hud.setHealth(hp);
hud.setMoney(state.money);
hud.setScore(0, 0);
hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setWeapon(WEAPONS.ketapel.name);
hud.setAlive(4, 4);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
