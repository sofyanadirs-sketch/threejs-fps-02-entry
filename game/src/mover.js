// Shared movement: a capsule approximated as a box, resolved one axis at a time
// against the world's colliders, so a wall never swallows a body. Player and
// bots both move through here; the numbers differ, the physics do not.
import * as THREE from 'three';

export const RADIUS = 0.34;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const GRAVITY = 20;

const probe = new THREE.Box3();

export function overlaps(colliders, x, y, z, height, lift) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
  return null;
}

// body: { position: Vector3, velocity: Vector3, height, onGround }.
// wishX/wishZ: desired horizontal velocity. Returns nothing; mutates body.
export function moveBody(colliders, body, dt, wishX, wishZ, accel, friction) {
  const blend = Math.min(1, accel * dt);
  body.velocity.x += (wishX - body.velocity.x) * blend;
  body.velocity.z += (wishZ - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  body.velocity.y -= GRAVITY * dt;
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(colliders, nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(colliders, body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(colliders, body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function makeBody(x, z) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    height: STAND_HEIGHT,
    onGround: true,
  };
}
