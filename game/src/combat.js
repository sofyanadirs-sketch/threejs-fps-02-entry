// Combat: hitscan shots with headshot bonus, pooled tracers, thrown grenades
// (a frag durian and a chilli flash) and their explosions. One raycaster and
// one set of pooled visuals, reused every frame — nothing is allocated here.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const FRAG_RADIUS = 6;
const FRAG_MAX = 110;
const FLASH_RANGE = 26;

export function createCombat(scene, worldShootables, colliders) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const dir = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const target = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  // Pooled tracers: one Line each, two endpoints, own material for fading.
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // One pooled explosion: an expanding shell and a light.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.durian), transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.durian), 0, 18);
  scene.add(boomLight);
  let boomLife = 0;

  const grenades = []; // { kind, pos, vel, fuse, mesh }
  const grenadeGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const testPoint = new THREE.Vector3();
  const durianMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.durian), roughness: 0.8 });
  const cabeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.6 });

  function showTracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = 0.3;
  }

  // Line of sight through the world only (no actors). Reuses the raycaster.
  function hasLineOfSight(from, to) {
    dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    raycaster.set(from, dir);
    raycaster.far = dist;
    return raycaster.intersectObjects(worldShootables, false).length === 0;
  }

  // One hitscan shot. `hitMeshes` is the live list of bot body/head meshes.
  // Returns { bot, part, damage, point } or null when the shot hits the world.
  function shoot(from, direction, def, hitMeshes) {
    origin.copy(from);
    dir.copy(direction);
    // spread is applied by the caller; this is the final direction.
    raycaster.set(origin, dir);
    raycaster.far = 120;
    const hits = raycaster.intersectObjects(hitMeshes, false);
    const worldHits = raycaster.intersectObjects(worldShootables, false);
    const botHit = hits[0];
    const wallHit = worldHits[0];
    let end;
    let result = null;
    if (botHit && (!wallHit || botHit.distance < wallHit.distance)) {
      const isHead = botHit.object.userData.part === 'head';
      const damage = def.damage * (isHead ? def.headMult : 1);
      hitPoint.copy(botHit.point);
      end = hitPoint;
      result = { bot: botHit.object.userData.bot, part: isHead ? 'head' : 'body', damage, point: hitPoint };
    } else if (wallHit) {
      end = wallHit.point;
    } else {
      end = target.copy(origin).addScaledVector(dir, 60);
    }
    showTracer(origin, end);
    return result;
  }

  function throwGrenade(kind, from, direction, speed = 11) {
    if (grenades.length >= 6) return;
    const mesh = new THREE.Mesh(grenadeGeo, kind === 'durian' ? durianMat : cabeMat);
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({
      kind,
      pos: mesh.position,
      vel: new THREE.Vector3().copy(direction).multiplyScalar(speed).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: kind === 'durian' ? 1.25 : 1.1,
      mesh,
    });
  }

  function pointInBox(p, box) {
    return p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y && p.z > box.min.z && p.z < box.max.z;
  }

  // Grenades, tracers and the explosion shell advance here. `actors` is the
  // list of damageable fighters: { alive, pos (Vector3 chest), eyeY, damage(n),
  // isPlayer, onFlash(seconds) } — the caller supplies it each step.
  function step(dt, actors, onExplode) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.3) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - Math.max(0, boomLife) / 0.45;
      boom.scale.setScalar(0.5 + k * FRAG_RADIUS);
      boom.material.opacity = Math.max(0, 0.85 * (1 - k));
      boomLight.intensity = Math.max(0, 60 * (1 - k));
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      // move one axis at a time so a wall bounces the grenade instead of eating it
      const next = { x: g.pos.x + g.vel.x * dt, y: g.pos.y + g.vel.y * dt, z: g.pos.z + g.vel.z * dt };
      testPoint.set(next.x, g.pos.y, g.pos.z);
      if (colliders.some((b) => pointInBox(testPoint, b))) { g.vel.x *= -0.45; } else { g.pos.x = next.x; }
      testPoint.set(g.pos.x, next.y, g.pos.z);
      if (colliders.some((b) => pointInBox(testPoint, b))) { g.vel.y *= -0.45; } else { g.pos.y = next.y; }
      testPoint.set(g.pos.x, g.pos.y, next.z);
      if (colliders.some((b) => pointInBox(testPoint, b))) { g.vel.z *= -0.45; } else { g.pos.z = next.z; }
      if (g.pos.y < 0.16) {
        g.pos.y = 0.16;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.8;
        g.vel.z *= 0.8;
      }
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        if (g.kind === 'durian') {
          boom.position.copy(g.pos);
          boom.visible = true;
          boom.scale.setScalar(0.5);
          boomLife = 0.45;
          boomLight.position.copy(g.pos);
          boomLight.intensity = 60;
          for (const a of actors) {
            if (!a.alive) continue;
            const d = a.pos.distanceTo(g.pos);
            if (d > FRAG_RADIUS) continue;
            const blocked = !hasLineOfSight(g.pos, a.pos);
            let dmg = FRAG_MAX * (1 - d / FRAG_RADIUS) + 15;
            if (blocked) dmg *= 0.4;
            a.damage(dmg, 'frag');
          }
          if (onExplode) onExplode(g.pos, 'durian');
        } else {
          // Cabe flash: anyone looking at the pop, within range and line of
          // sight, is blinded. The caller decides the facing check.
          for (const a of actors) {
            if (!a.alive) continue;
            const d = a.pos.distanceTo(g.pos);
            if (d > FLASH_RANGE) continue;
            if (!hasLineOfSight(g.pos, a.pos)) continue;
            a.onFlash(Math.max(0.8, 2.6 - d / FLASH_RANGE), g.pos);
          }
          if (onExplode) onExplode(g.pos, 'cabe');
        }
      }
    }
  }

  return { shoot, throwGrenade, step, hasLineOfSight, trace: showTracer };
}
