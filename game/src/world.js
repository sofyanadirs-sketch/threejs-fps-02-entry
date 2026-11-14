// The night market, drawn from map.js: stalls with striped awnings, the bakso
// cart and the sate grill, the dangdut stage, banana trees and strings of warm
// bulbs. Plain geometry only — every shape is this game's own art.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

const AWNING_COLORS = ['stallCloth', 'stallCloth2', 'stallCloth3'];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'cartMetal' ? 0.35 : 0.9,
      metalness: name === 'cartMetal' ? 0.6 : 0.02,
      emissive: new THREE.Color(PALETTE[name]),
      emissiveIntensity: name === 'amber' || name === 'durian' ? 0.55 : 0,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function ball(r, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mats[mat]);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // Ground: one big slab, plus a warm rug strip down mid.
  box(57, 0.4, 37, 0, -0.2, 0, 'ground');
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 30), mats.stallCloth2);
  rug.position.set(0, 0.03, 2);
  rug.receiveShadow = true;
  group.add(rug);

  // Perimeter walls, low enough to see the dusk sky over them.
  box(0.4, 4.2, 36.4, -28.2, 2.1, 0, 'stallWood');
  box(0.4, 4.2, 36.4, 28.2, 2.1, 0, 'stallWood');
  box(56.4, 4.2, 0.4, 0, 2.1, -18.2, 'stallWood');
  box(56.4, 4.2, 0.4, 0, 2.1, 18.2, 'stallWood');

  let stallIndex = 0;
  for (const [cx, cy, cz, w, h, d, kind] of MAP.boxes) {
    if (kind === 'wall') continue;
    if (kind === 'stall') {
      const cloth = AWNING_COLORS[stallIndex % AWNING_COLORS.length];
      stallIndex += 1;
      box(w, h, d, cx, cy, cz, 'stallWood');
      // striped awning: alternating cloth / ink slats, tilted
      const slats = 5;
      for (let i = 0; i < slats; i += 1) {
        const s = box(w / slats, 0.08, d + 1.2, cx - w / 2 + (w / slats) * (i + 0.5), h + 0.55, cz, i % 2 ? 'ink' : cloth, false);
        s.rotation.x = -0.18;
      }
      box(0.08, 0.9, 0.08, cx - w / 2 + 0.1, h + 0.4, cz - d / 2 - 0.4, 'stallWood', false);
      box(0.08, 0.9, 0.08, cx + w / 2 - 0.1, h + 0.4, cz - d / 2 - 0.4, 'stallWood', false);
      // goods on the counter: little fruit and snack piles
      const goods = ['durian', 'stallCloth', 'stallCloth2', 'leaf'];
      for (let i = 0; i < 4; i += 1) {
        ball(0.16, cx - w / 2 + 0.5 + i * 0.9, h + 0.16, cz + (i % 2 ? 0.3 : -0.3), goods[(stallIndex + i) % goods.length]);
      }
      // warm bulb under the awning
      const bulb = ball(0.09, cx, h + 0.35, cz, 'amber');
      bulb.material = mats.amber;
    } else if (kind === 'cart') {
      // Gerobak Bakso: the cart, its pot and its umbrella
      box(w, h, d, cx, cy, cz, 'cartMetal');
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14), mats.stallCloth);
      pot.position.set(cx - 0.5, h + 0.2, cz);
      pot.castShadow = true;
      group.add(pot);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), mats.stallWood);
      pole.position.set(cx, h + 1.1, cz);
      group.add(pole);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 10), mats.stallCloth2);
      shade.position.set(cx, h + 2.4, cz);
      shade.castShadow = true;
      group.add(shade);
      ball(0.09, cx + 0.8, h + 0.5, cz, 'amber');
    } else if (kind === 'grill') {
      // Lapak Sate: grill table, skewers, charcoal glow
      box(w, h, d, cx, cy, cz, 'stallWood');
      box(w - 0.4, 0.18, d - 0.4, cx, h + 0.09, cz, 'danger', false);
      for (let i = 0; i < 5; i += 1) {
        const skewer = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), mats.stallWood);
        skewer.rotation.z = Math.PI / 2;
        skewer.position.set(cx - 0.6 + i * 0.3, h + 0.28, cz);
        group.add(skewer);
      }
      ball(0.09, cx + 0.9, h + 0.5, cz, 'amber');
    } else if (kind === 'stage') {
      // Panggung Dangdut: raised deck, backdrop, speaker stacks
      box(w, h, d, cx, cy, cz, 'stallCloth');
      box(w, 1.6, 0.3, cx, h + 0.8, cz - d / 2 + 0.15, 'stallCloth3');
      box(1.2, 1.8, 1, cx - w / 2 + 0.7, h + 0.9, cz + d / 2 - 0.6, 'ground');
      box(1.2, 1.8, 1, cx + w / 2 - 0.7, h + 0.9, cz + d / 2 - 0.6, 'ground');
      for (let i = 0; i < 6; i += 1) {
        ball(0.08, cx - 3 + i * 1.2, h + 1.85, cz - d / 2 + 0.2, i % 2 ? 'amber' : 'teal');
      }
    } else if (kind === 'crate') {
      box(w, h, d, cx, cy, cz, 'crate');
      box(w + 0.06, 0.08, d + 0.06, cx, cy + h / 2 - 0.04, cz, 'stallWood', false);
    } else if (kind === 'tall') {
      // Spawn gate: a tall warung block with a striped cloth top
      box(w, h, d, cx, cy, cz, 'stallWood');
      box(w + 0.3, 0.25, d + 0.5, cx, h + 0.12, cz, 'stallCloth');
      for (let i = 0; i < 3; i += 1) {
        ball(0.14, cx - 2 + i * 2, h + 0.35, cz, 'amber');
      }
    } else if (kind === 'trunk') {
      box(w, h, d, cx, cy, cz, 'trunk');
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 8), mats.leaf);
      canopy.position.set(cx, h + 1.4, cz);
      canopy.castShadow = true;
      group.add(canopy);
    }
  }

  // Strings of bulbs across the market, pole to pole.
  const poles = [[-12, 2], [12, 2], [-12, -8], [12, -8], [0, 10], [0, -12]];
  for (const [px, pz] of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8), mats.stallWood);
    pole.position.set(px, 2.2, pz);
    pole.castShadow = true;
    group.add(pole);
  }
  const bulbGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const stringPairs = [[[-12, 2], [12, 2]], [[-12, -8], [12, -8]], [[0, 10], [-12, 2]], [[0, 10], [12, 2]], [[-12, -8], [0, -12]], [[12, -8], [0, -12]]];
  for (const [[ax, az], [bx, bz]] of stringPairs) {
    for (let i = 1; i < 9; i += 1) {
      const t = i / 9;
      const sag = Math.sin(t * Math.PI) * 0.7;
      const bulb = new THREE.Mesh(bulbGeo, mats.amber);
      bulb.position.set(ax + (bx - ax) * t, 4.3 - sag, az + (bz - az) * t);
      group.add(bulb);
    }
  }

  // Light: violet dusk hemisphere, cool moon key with shadows, warm stall points.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8a6fb8'), new THREE.Color(PALETTE.ground), 1.15));
  const moon = new THREE.DirectionalLight(new THREE.Color('#b9c8ff'), 1.35);
  moon.position.set(-14, 20, 10);
  moon.target.position.set(0, 0, -2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -32;
  moon.shadow.camera.right = 32;
  moon.shadow.camera.top = 24;
  moon.shadow.camera.bottom = -24;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const warmSpots = [[-12, 6], [12, 6], [-20, -12], [20, -12], [0, -2], [0, 10]];
  for (const [x, z] of warmSpots) {
    const light = new THREE.PointLight(new THREE.Color(PALETTE.amber), 20, 16, 1.8);
    light.position.set(x, 3.4, z);
    scene.add(light);
  }

  return { colliders, shootables, group };
}
