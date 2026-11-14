// Weapons: five originals, each with its own numbers, view model and feel.
// Buy menu prices live here too, so the HUD and the rounds module agree.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  ketapel: {
    name: 'Ketapel', kind: 'pistol', price: 0, mag: 12, reserve: 36,
    damage: 26, headMult: 2, gap: 0.16, reload: 1.1, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, kick: 0.006, pellets: 1, zoom: 1,
    desc: 'Pistol slingshot — free, quiet, honest.',
  },
  bambu: {
    name: 'Bedil Bambu', kind: 'rifle', price: 900, mag: 30, reserve: 90,
    damage: 30, headMult: 3.3, gap: 0.096, reload: 1.9, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, pellets: 1, zoom: 1,
    desc: 'Bamboo rifle — the workhorse. Stopping pays.',
  },
  sambal: {
    name: 'Semprotan Sambal', kind: 'smg', price: 550, mag: 28, reserve: 84,
    damage: 20, headMult: 2.5, gap: 0.07, reload: 1.6, auto: true,
    spreadStill: 0.006, spreadMove: 0.034, kick: 0.005, pellets: 1, zoom: 1,
    desc: 'Chilli-spray SMG — fast, wild, close-range.',
  },
  panjang: {
    name: 'Bedil Panjang', kind: 'sniper', price: 1600, mag: 5, reserve: 15,
    damage: 90, headMult: 2, gap: 1.1, reload: 2.6, auto: false,
    spreadStill: 0.0004, spreadMove: 0.09, kick: 0.03, pellets: 1, zoom: 2.6,
    desc: 'Long bamboo sniper — one shot, one story. Right-click to scope.',
  },
  kerupuk: {
    name: 'Meriam Kerupuk', kind: 'shotgun', price: 700, mag: 6, reserve: 24,
    damage: 12, headMult: 2, gap: 0.85, reload: 2.4, auto: false,
    spreadStill: 0.02, spreadMove: 0.05, kick: 0.022, pellets: 8, zoom: 1,
    desc: 'Cracker cannon — eight pellets of crunch.',
  },
};

export const GRENADES = {
  durian: { name: 'Durian Lempar', price: 200, desc: 'A thrown durian. Frag. It explodes.' },
  cabe: { name: 'Cabe Rawit', price: 150, desc: 'A chilli flash. Blinds anyone looking.' },
};

const VIEW_COLORS = { ketapel: 'cartMetal', bambu: 'stallWood', sambal: 'danger', panjang: 'teal', kerupuk: 'stallCloth2' };

// One view-model group per weapon, built once and swapped; the camera owns it.
function buildModel(def) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE[VIEW_COLORS[def.kind] ?? 'cartMetal']),
    roughness: 0.55, metalness: 0.3,
    emissive: new THREE.Color(PALETTE[VIEW_COLORS[def.kind] ?? 'cartMetal']),
    emissiveIntensity: 0.18,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.ground), roughness: 0.7, metalness: 0.2,
    emissive: new THREE.Color(PALETTE.ground), emissiveIntensity: 0.25,
  });
  const len = def.kind === 'sniper' ? 0.62 : def.kind === 'shotgun' ? 0.55 : def.kind === 'rifle' ? 0.48 : def.kind === 'smg' ? 0.4 : 0.3;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, len), bodyMat);
  group.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len * 0.7), darkMat);
  barrel.position.set(0, 0.02, -len * 0.7);
  group.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), darkMat);
  stock.position.set(0, -0.015, len / 2 + 0.04);
  group.add(stock);
  // a bamboo grip so the gun reads as market-made, not factory grey
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), bodyMat);
  grip.position.set(0, -0.09, 0.05);
  grip.rotation.x = 0.25;
  group.add(grip);
  if (def.kind === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.065, -0.05);
    group.add(scope);
  }
  if (def.kind === 'shotgun') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), darkMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.025, -len * 0.55);
    group.add(tube);
  }
  group.position.set(0.26, -0.23, -0.5);
  group.rotation.y = 0.06;
  return group;
}

export function createWeaponRig(camera) {
  const models = {};
  for (const [id, def] of Object.entries(WEAPONS)) models[id] = buildModel(def);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);
  let current = null;

  const state = {
    id: 'ketapel', mag: WEAPONS.ketapel.mag, reserve: WEAPONS.ketapel.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, scoped: false,
    grenades: { durian: 0, cabe: 0 },
  };

  function equip(id) {
    if (current) camera.remove(current);
    current = models[id];
    camera.add(current);
    const def = WEAPONS[id];
    state.id = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.scoped = false;
  }
  equip('ketapel');

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (current) {
      current.position.z = -0.5 + state.kick;
      current.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) current.rotation.x = -0.55 * Math.min(1, (WEAPONS[state.id].reload - state.reloadLeft) * 2);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const def = WEAPONS[state.id];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    def() { return WEAPONS[state.id]; },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() {
      state.cooldown = WEAPONS[state.id].gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPONS[state.id];
      const base = state.scoped ? def.spreadStill * 0.4 : def.spreadStill;
      return base + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    refillAmmo() {
      const def = WEAPONS[state.id];
      state.mag = def.mag;
      state.reserve = def.reserve;
    },
  };
}
