// Bots: two teams of night-market regulars. Attackers ("Kru Senja") push a bomb
// site along waypoint routes and plant the durian; defenders ("Satpam Pasar")
// hold angles, rotate on noise and defuse. A bot sees (range, field of view,
// line of sight), hears gunfire, aims with a reaction time, and fires in
// bursts whose hit chance falls with distance and target speed — so stopping,
// crouching and peeking corners genuinely matter.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, findPath, nearestWaypoint } from './map.js';
import { moveBody, makeBody, STAND_HEIGHT } from './mover.js';

const BOT_SPEED = 4.1;
const BOT_AIM_SPEED = 2.6;
const SEE_RANGE = 28;
const HEAR_RANGE = 26;
const REACT_MIN = 0.35;
const REACT_MAX = 0.65;
const BURST_MIN = 3;
const BURST_MAX = 5;

const ATK_NAMES = ['Budi', 'Sari', 'Joko'];
const DEF_NAMES = ['Pak RT', 'Mbak Yuni', 'Dedi', 'Agus'];

const tmpDir = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpFacing = new THREE.Vector3();

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

function buildFigure(team) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'atk' ? PALETTE.amber : PALETTE.teal), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c98f5f'), roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ground), roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.95, 10), shirt);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.58;
  head.castShadow = true;
  group.add(head);
  // the hat: a peci for Kru Senja, a satpam cap for the guards
  const hatMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'atk' ? PALETTE.stallCloth : PALETTE.teal), roughness: 0.8 });
  const hat = team === 'atk'
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.12, 10), hatMat)
    : new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 10), hatMat);
  hat.position.y = 1.76;
  group.add(hat);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.5, 10), dark);
  legs.position.y = 0.25;
  group.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.6), dark);
  gun.position.set(0.18, 1.15, -0.3);
  group.add(gun);
  return { group, body, head };
}

export function createBots(scene, colliders, hasLineOfSight, hooks) {
  // hooks: { onDeath(bot, killer), onPlantStart, onDefuseStart } — the round
  // module wires these; bots never touch the score themselves.
  const bots = [];
  const hitMeshes = [];
  let idCounter = 0;

  function spawnBot(team, name, spawn, random) {
    const id = `bot${idCounter++}`;
    const fig = buildFigure(team);
    const body = makeBody(spawn.x, spawn.z);
    const bot = {
      id, team, name, alive: true, hp: 100,
      body, yaw: spawn.yaw, pitch: 0, eye: 1.55,
      group: fig.group, headMesh: fig.head, bodyMesh: fig.body,
      state: 'hold', path: [], pathIndex: 0, holdWp: null, holdYaw: spawn.yaw,
      site: null, carrier: false, blindT: 0,
      visibleEnemy: null, aimTime: 0, burstLeft: 0, burstGap: 0, fireCooldown: 0,
      scanT: random() * 0.15, investigate: null, investigateT: 0,
      defusing: 0, planting: 0, random, speed: BOT_SPEED * (0.92 + random() * 0.16),
    };
    fig.body.userData = { bot, part: 'body' };
    fig.head.userData = { bot, part: 'head' };
    fig.group.position.set(spawn.x, 0, spawn.z);
    fig.group.rotation.y = spawn.yaw;
    scene.add(fig.group);
    hitMeshes.push(fig.body, fig.head);
    bots.push(bot);
    return bot;
  }

  function reset(teamSpawns, random) {
    for (const bot of bots) {
      scene.remove(bot.group);
    }
    bots.length = 0;
    hitMeshes.length = 0;
    idCounter = 0;
    MAP.spawns.atk.forEach((s, i) => {
      if (i === 0) return; // slot 0 is the player
      spawnBot('atk', ATK_NAMES[i - 1], s, random);
    });
    MAP.spawns.def.forEach((s, i) => spawnBot('def', DEF_NAMES[i], s, random));
    for (const bot of bots) {
      if (bot.team === 'def') {
        const hold = MAP.defHolds[bots.filter((b) => b.team === 'def').indexOf(bot) % MAP.defHolds.length];
        bot.holdWp = hold.wp;
        bot.holdYaw = hold.yaw;
        bot.path = findPath(nearestWaypoint(bot.body.position.x, bot.body.position.z), hold.wp);
        bot.pathIndex = 0;
        bot.state = 'move';
      }
    }
    return bots;
  }

  function damage(bot, amount, killer) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp > 0) return false;
    bot.alive = false;
    bot.state = 'dead';
    bot.group.rotation.x = -Math.PI / 2;
    bot.group.position.y = bot.body.position.y + 0.25;
    if (hooks.onDeath) hooks.onDeath(bot, killer);
    return true;
  }

  function hear(pos, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      tmpDir.copy(pos).sub(bot.body.position);
      tmpDir.y = 0;
      if (tmpDir.lengthSq() < HEAR_RANGE * HEAR_RANGE && bot.state !== 'engage') {
        bot.investigate = { x: pos.x, z: pos.z };
        bot.investigateT = 4;
      }
    }
  }

  function eyePos(bot, out) {
    out.set(bot.body.position.x, bot.body.position.y + bot.eye, bot.body.position.z);
    return out;
  }

  function canSee(bot, enemyPos, enemyEyeY) {
    tmpTo.copy(enemyPos);
    tmpTo.y = enemyEyeY;
    const eye = eyePos(bot, tmpEye);
    tmpDir.copy(tmpTo).sub(eye);
    const dist = tmpDir.length();
    if (dist > SEE_RANGE) return false;
    tmpDir.divideScalar(dist);
    // field of view: the bot must roughly face its enemy
    tmpFacing.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (tmpFacing.dot(tmpDir) < 0.35 && dist > 4) return false;
    return hasLineOfSight(eye, tmpTo);
  }

  function moveToward(bot, x, z, dt, speed) {
    tmpDir.set(x - bot.body.position.x, 0, z - bot.body.position.z);
    const dist = tmpDir.length();
    if (dist < 0.15) return true;
    tmpDir.divideScalar(dist);
    const targetYaw = Math.atan2(-tmpDir.x, -tmpDir.z);
    let dyaw = targetYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));
    const moving = Math.abs(dyaw) < 0.9;
    const vx = moving ? tmpDir.x * speed : 0;
    const vz = moving ? tmpDir.z * speed : 0;
    moveBody(colliders, bot.body, dt, vx, vz, 30 / speed, 9);
    return dist < 0.4;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const wp = MAP.waypoints[bot.path[bot.pathIndex]];
    const px = bot.body.position.x;
    const pz = bot.body.position.z;
    if (moveToward(bot, wp.x, wp.z, dt, speed)) {
      bot.pathIndex += 1;
      bot.stuckT = 0;
      return bot.pathIndex >= bot.path.length;
    }
    // Stuck against a wall or a crate on the waypoint line: after 2 s of no
    // progress, skip the waypoint instead of pushing at it forever.
    const moved = Math.hypot(bot.body.position.x - px, bot.body.position.z - pz);
    if (moved < 0.01) {
      bot.stuckT = (bot.stuckT || 0) + dt;
      if (bot.stuckT > 2) {
        bot.pathIndex += 1;
        bot.stuckT = 0;
      }
    } else {
      bot.stuckT = 0;
    }
    return false;
  }

  function setPath(bot, toWp) {
    bot.path = findPath(nearestWaypoint(bot.body.position.x, bot.body.position.z), toWp);
    bot.pathIndex = 0;
    bot.state = 'move';
  }

  // Point the bot at a waypoint, but only when it is not already walking there:
  // re-pathing every step resets the path and the bot never arrives.
  function ensurePath(bot, toWp) {
    const dest = bot.path.length ? bot.path[bot.path.length - 1] : null;
    if (dest !== toWp) setPath(bot, toWp);
  }

  // One fixed step for one bot. `enemies` is the list of live targets on the
  // other side: { pos: Vector3, eyeY, alive, speed, crouching, damage(n, killer),
  // isPlayer, name }. `world` carries the round facts the bot reacts to.
  function stepBot(bot, dt, enemies, world) {
    if (!bot.alive) return;
    if (bot.blindT > 0) {
      bot.blindT -= dt;
      bot.visibleEnemy = null;
      return;
    }
    bot.scanT -= dt;
    if (bot.scanT <= 0 && world.phase === 'live') {
      bot.scanT = 0.12;
      bot.visibleEnemy = null;
      let bestD = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        tmpTo.copy(e.pos);
        const d = tmpTo.distanceTo(bot.body.position);
        if (d < bestD && canSee(bot, e.pos, e.eyeY)) {
          bestD = d;
          bot.visibleEnemy = e;
        }
      }
      // Aim time only resets when the target changes: re-scanning the same
      // enemy every 0.12 s must not keep the bot forever "about to shoot".
      if (bot.visibleEnemy) {
        if (bot.aimTarget !== bot.visibleEnemy) {
          bot.aimTarget = bot.visibleEnemy;
          bot.aimTime = 0;
          bot.burstLeft = 0;
        }
        bot.state = 'engage';
      } else if (bot.state === 'engage') {
        bot.aimTarget = null;
        bot.state = bot.path.length > bot.pathIndex ? 'move' : 'hold';
      }
    }

    // The designated defuser does not stop to trade shots: the durian comes first.
    if (world.defuser === bot && world.bombPlanted) bot.visibleEnemy = null;
    const enemy = bot.visibleEnemy;
    if (enemy) {
      // Face the enemy, aim in, then fire in bursts.
      tmpDir.copy(enemy.pos).sub(bot.body.position);
      tmpDir.y = enemy.eyeY - (bot.body.position.y + bot.eye);
      const dist = tmpDir.length();
      tmpDir.divideScalar(dist);
      const targetYaw = Math.atan2(-tmpDir.x, -tmpDir.z);
      const targetPitch = Math.asin(Math.max(-1, Math.min(1, tmpDir.y)));
      let dyaw = targetYaw - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += Math.max(-4.5 * dt, Math.min(4.5 * dt, dyaw));
      bot.pitch += Math.max(-3 * dt, Math.min(3 * dt, targetPitch - bot.pitch));
      bot.aimTime += dt;
      const reaction = REACT_MIN + bot.random() * (REACT_MAX - REACT_MIN);
      if (bot.aimTime > reaction) {
        bot.fireCooldown -= dt;
        if (bot.burstLeft <= 0 && bot.fireCooldown <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(bot.random() * (BURST_MAX - BURST_MIN + 1));
          bot.fireCooldown = 0.9 + bot.random() * 0.6;
        }
        if (bot.burstLeft > 0) {
          bot.burstGap -= dt;
          if (bot.burstGap <= 0) {
            bot.burstGap = 0.13;
            bot.burstLeft -= 1;
            fireAt(bot, enemy, dist);
          }
        }
      }
      return; // engaging: no walking this step
    }

    // No enemy in sight: follow the role.
    if (bot.team === 'atk') {
      if (world.bombPlanted) {
        // hold near the planted site (the planter stops planting now)
        if (bot.state === 'plant') bot.state = 'hold';
        ensurePath(bot, world.bombSite === 'A' ? 'aSite' : 'bSite');
        if (bot.state === 'move' && followPath(bot, dt, bot.speed)) bot.state = 'hold';
        if (bot.state === 'hold') bot.yaw += Math.sin(world.elapsed * 0.4 + bot.id.charCodeAt(3)) * 0.15 * dt;
      } else if (bot.carrier) {
        if (bot.state !== 'plant' && bot.state !== 'move') setPath(bot, world.siteWp);
        if (bot.state === 'move') {
          if (followPath(bot, dt, bot.speed)) {
            bot.state = 'plant';
            bot.planting = 0;
            if (hooks.onPlantStart) hooks.onPlantStart(bot);
          }
        } else if (bot.state === 'plant') {
          bot.planting += dt;
          if (hooks.onPlantTick) hooks.onPlantTick(bot, bot.planting);
        }
      } else {
        // escort: stay near the carrier, retargeting as it moves
        bot.followT = (bot.followT || 0) - dt;
        const c = world.carrierPos;
        const d = Math.hypot(c.x - bot.body.position.x, c.z - bot.body.position.z);
        if (bot.followT <= 0 || (bot.state === 'hold' && d > 5)) {
          bot.followT = 2;
          ensurePath(bot, nearestWaypoint(c.x, c.z));
        }
        if (bot.state === 'move' && followPath(bot, dt, bot.speed)) bot.state = 'hold';
      }
    } else {
      // Defenders
      if (world.bombPlanted) {
        if (world.defuser === bot) {
          if (bot.state !== 'defuse' && bot.state !== 'move') setPath(bot, world.bombSite === 'A' ? 'aSite' : 'bSite');
          if (bot.state === 'move') {
            if (followPath(bot, dt, bot.speed * 1.05)) {
              bot.state = 'defuse';
              bot.defusing = 0;
              if (hooks.onDefuseStart) hooks.onDefuseStart(bot);
            }
          } else if (bot.state === 'defuse') {
            bot.defusing += dt;
            if (hooks.onDefuseTick) hooks.onDefuseTick(bot, bot.defusing);
          }
        } else {
          // everyone else rotates to the planted site
          ensurePath(bot, world.bombSite === 'A' ? 'aSite' : 'bSite');
          if (bot.state === 'move' && followPath(bot, dt, bot.speed)) bot.state = 'hold';
        }
      } else if (bot.investigate && bot.investigateT > 0) {
        bot.investigateT -= dt;
        ensurePath(bot, nearestWaypoint(bot.investigate.x, bot.investigate.z));
        if (followPath(bot, dt, bot.speed)) {
          bot.investigate = null;
          bot.state = 'hold';
        }
      } else if (bot.state === 'move') {
        if (followPath(bot, dt, bot.speed)) {
          bot.state = 'hold';
          bot.yaw = bot.holdYaw;
        }
      } else {
        // hold the angle, slowly scanning
        bot.yaw = bot.holdYaw + Math.sin(world.elapsed * 0.35 + bot.id.charCodeAt(3)) * 0.5;
      }
    }

    // Keep the figure glued to the body.
    bot.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.group.rotation.y = bot.yaw;
  }

  function fireAt(bot, enemy, dist) {
    // Hit chance: close and slow is deadly, far and sprinting is not.
    let chance = 0.42 - dist * 0.008 - (enemy.speed || 0) * 0.02 - (enemy.crouching ? 0.06 : 0);
    chance = Math.max(0.06, Math.min(0.55, chance));
    const eye = eyePos(bot, tmpEye);
    const muzzle = tmpTo.set(eye.x, eye.y - 0.1, eye.z);
    const aimPoint = new THREE.Vector3(enemy.pos.x, enemy.eyeY - 0.3, enemy.pos.z);
    if (bot.random() < chance) {
      const head = bot.random() < 0.12;
      const dmg = head ? 46 : 22 + bot.random() * 8;
      enemy.damage(dmg, bot);
      if (hooks.onShot) hooks.onShot(muzzle, aimPoint, true);
    } else {
      // miss: tracer lands near the enemy
      aimPoint.x += (bot.random() - 0.5) * 1.6;
      aimPoint.y += (bot.random() - 0.5) * 1.2;
      aimPoint.z += (bot.random() - 0.5) * 1.6;
      if (hooks.onShot) hooks.onShot(muzzle, aimPoint, false);
    }
    if (hooks.onNoise) hooks.onNoise(bot.body.position, bot.team);
  }

  function step(dt, enemiesByTeam, world) {
    for (const bot of bots) {
      stepBot(bot, dt, enemiesByTeam[bot.team === 'atk' ? 'def' : 'atk'], world);
    }
    // Figures follow bodies (also after an engage step, which returns early).
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    damage,
    hear,
    step,
    setPath,
    aliveCount(team) {
      let n = 0;
      for (const b of bots) if (b.alive && b.team === team) n += 1;
      return n;
    },
  };
}
