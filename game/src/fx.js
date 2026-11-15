// Effects, all pooled: nothing is created per frame or per shot. Tracers are
// a ring of lines, sparks are two fixed point clouds, smoke is a set of
// sprites per cloud. A smoke cloud is also a vision blocker: bots test their
// line of sight against its sphere.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 12;
const TRACER_LIFE = 0.07;
const SPARK_COUNT = 240;

function makeSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeCloud(scene, count, color, size) {
  const geometry = new THREE.BufferGeometry();
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    array[i * 3] = 0;
    array[i * 3 + 1] = -100;
    array[i * 3 + 2] = 0;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
  const material = new THREE.PointsMaterial({
    color, size, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points, positions: array, velocities: new Float32Array(count * 3), life: new Float32Array(count),
    cursor: 0, count,
  };
}

function spawnInto(cloud, point, count, speed, up) {
  for (let n = 0; n < count; n += 1) {
    const i = cloud.cursor;
    cloud.cursor = (cloud.cursor + 1) % cloud.count;
    cloud.positions[i * 3] = point.x;
    cloud.positions[i * 3 + 1] = point.y;
    cloud.positions[i * 3 + 2] = point.z;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * speed;
    cloud.velocities[i * 3] = Math.cos(a) * r;
    cloud.velocities[i * 3 + 1] = up + Math.random() * speed * 0.5;
    cloud.velocities[i * 3 + 2] = Math.sin(a) * r;
    cloud.life[i] = 0.35 + Math.random() * 0.25;
  }
}

export function createFx(scene, rng) {
  const smokeTexture = makeSmokeTexture();
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparks = makeCloud(scene, SPARK_COUNT, new THREE.Color('#ffb347'), 0.07);
  const blood = makeCloud(scene, SPARK_COUNT, new THREE.Color(PALETTE.danger), 0.09);

  const clouds = [];
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 30);
  scene.add(boomLight);
  const boomSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, depthWrite: false }),
  );
  scene.add(boomSphere);
  let boomLife = 0;

  function stepCloud(cloud, dt) {
    for (let i = 0; i < cloud.count; i += 1) {
      if (cloud.life[i] <= 0) continue;
      cloud.life[i] -= dt;
      cloud.positions[i * 3] += cloud.velocities[i * 3] * dt;
      cloud.positions[i * 3 + 1] += cloud.velocities[i * 3 + 1] * dt;
      cloud.positions[i * 3 + 2] += cloud.velocities[i * 3 + 2] * dt;
      cloud.velocities[i * 3 + 1] -= 6 * dt;
      if (cloud.life[i] <= 0) cloud.positions[i * 3 + 1] = -100;
    }
    cloud.points.geometry.attributes.position.needsUpdate = true;
  }

  return {
    tracer(a, b) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % TRACER_COUNT;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = a.x; pos[1] = a.y; pos[2] = a.z;
      pos[3] = b.x; pos[4] = b.y; pos[5] = b.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.life = TRACER_LIFE;
    },
    impact(point) {
      spawnInto(sparks, point, 10, 2.2, 1.2);
    },
    hitSpark(point, head) {
      spawnInto(blood, point, head ? 14 : 9, 1.6, 0.9);
      spawnInto(sparks, point, 4, 1.4, 0.8);
    },
    addSmoke(center, until) {
      const group = new THREE.Group();
      const sprites = [];
      for (let i = 0; i < 16; i += 1) {
        const material = new THREE.SpriteMaterial({
          map: smokeTexture, color: new THREE.Color('#b8bcc2'), transparent: true, opacity: 0.5, depthWrite: false,
        });
        const sprite = new THREE.Sprite(material);
        const r = rng.range(0, 2.2);
        const a = rng.range(0, Math.PI * 2);
        sprite.position.set(center.x + Math.cos(a) * r, center.y + rng.range(0.3, 2.2), center.z + Math.sin(a) * r);
        const s = rng.range(2.2, 4.2);
        sprite.scale.set(s, s, 1);
        group.add(sprite);
        sprites.push(sprite);
      }
      scene.add(group);
      const cloud = { center: center.clone(), radius: 3.2, until, group, sprites, born: until - 14 };
      clouds.push(cloud);
      return cloud;
    },
    explosion(point) {
      boomLight.position.copy(point);
      boomLight.position.y += 1;
      boomLight.intensity = 60;
      boomSphere.position.copy(point);
      boomSphere.position.y += 0.8;
      boomLife = 0.6;
      spawnInto(sparks, point, 60, 7, 4);
      spawnInto(blood, point, 30, 5, 3);
    },
    step(dt, now) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.85;
      }
      stepCloud(sparks, dt);
      stepCloud(blood, dt);
      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        const cloud = clouds[i];
        const age = now - cloud.born;
        const fade = Math.max(0, Math.min(1, (cloud.until - now) / 3));
        for (const sprite of cloud.sprites) {
          sprite.material.opacity = 0.5 * fade;
          sprite.position.y += dt * 0.12;
        }
        if (now >= cloud.until || age > 16) {
          scene.remove(cloud.group);
          clouds.splice(i, 1);
        }
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = Math.max(0, boomLife / 0.6);
        boomLight.intensity = 60 * t;
        const s = (1 - t) * 7 + 0.5;
        boomSphere.scale.set(s, s, s);
        boomSphere.material.opacity = 0.55 * t;
      } else {
        boomLight.intensity = 0;
        boomSphere.material.opacity = 0;
      }
    },
    smokeClouds() {
      return clouds;
    },
  };
}
