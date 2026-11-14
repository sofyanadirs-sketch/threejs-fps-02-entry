// The player: look, crouch, jump and accelerated movement on top of mover.js.
// Spread punishes moving: stopping to aim is a real decision, not a suggestion.
import * as THREE from 'three';
import { moveBody, makeBody, STAND_HEIGHT, CROUCH_HEIGHT } from './mover.js';

const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, spawn) {
  const body = makeBody(spawn.x, spawn.z);
  const player = {
    body,
    yaw: spawn.yaw,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching) {
      player.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const accel = body.onGround ? GROUND_ACCEL : AIR_ACCEL;
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    moveBody(colliders, body, dt, wish.x * speed, wish.z * speed, accel / speed, FRICTION);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    reset(spawnPoint) {
      body.position.set(spawnPoint.x, 0, spawnPoint.z);
      body.velocity.set(0, 0, 0);
      body.height = STAND_HEIGHT;
      body.onGround = true;
      player.yaw = spawnPoint.yaw;
      player.pitch = 0;
      player.eye = STAND_EYE;
      player.crouching = false;
      player.alive = true;
    },
  };
}
