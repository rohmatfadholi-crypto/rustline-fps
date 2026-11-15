// Hitscan, one resolver for the player and every bot. A shot is a ray from an
// eye with a spread cone: the first thing it meets wins. Map surfaces and bot
// bodies are tested with three's Raycaster; the player is tested analytically
// against two boxes (head, torso), so no invisible body meshes are needed.
// The caller applies the damage; this module only says what was hit, where,
// and how hard. All temporaries are reused: no allocation per shot.
import * as THREE from 'three';

export function createCombat(map, fx) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const dir = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const headBox = new THREE.Box3();
  const torsoBox = new THREE.Box3();

  // Slab test: distance along dir to the first face of box, or Infinity.
  function rayBox(ox, oy, oz, dx, dy, dz, box) {
    let tmin = 0;
    let tmax = Infinity;
    if (dx === 0) {
      if (ox < box.min.x || ox > box.max.x) return Infinity;
    } else {
      let t1 = (box.min.x - ox) / dx;
      let t2 = (box.max.x - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    if (dy === 0) {
      if (oy < box.min.y || oy > box.max.y) return Infinity;
    } else {
      let t1 = (box.min.y - oy) / dy;
      let t2 = (box.max.y - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    if (dz === 0) {
      if (oz < box.min.z || oz > box.max.z) return Infinity;
    } else {
      let t1 = (box.min.z - oz) / dz;
      let t2 = (box.max.z - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }

  // The player's two hit boxes, from the body state (feet position + eye).
  function playerBoxes(player) {
    const p = player.body.position;
    const crouch = player.body.crouching;
    const height = crouch ? 1.12 : 1.72;
    const eyeY = p.y + player.body.eye;
    torsoBox.min.set(p.x - 0.34, p.y + 0.15, p.z - 0.34);
    torsoBox.max.set(p.x + 0.34, p.y + height - 0.45, p.z + 0.34);
    headBox.min.set(p.x - 0.2, eyeY - 0.12, p.z - 0.2);
    headBox.max.set(p.x + 0.2, eyeY + 0.22, p.z + 0.2);
    return { headBox, torsoBox };
  }

  return {
    // opts: { origin, direction, spread, rng, damage, headMult, range,
    //         bots (enemy bot entities, may be empty), player (entity or null),
    //         exclude (entity to skip, the shooter itself) }
    // Returns { kind: 'none'|'map'|'bot'|'player', entity, part, point, distance, damage }.
    shoot(opts) {
      const { rng, spread } = opts;
      origin.copy(opts.origin);
      dir.copy(opts.direction);
      dir.x += (rng.random() * 2 - 1) * spread;
      dir.y += (rng.random() * 2 - 1) * spread;
      dir.z += (rng.random() * 2 - 1) * spread;
      dir.normalize();

      // Map and bot bodies through the Raycaster, two calls, no array built.
      const meshes = map.shootables;
      const botMeshes = [];
      for (const bot of opts.bots || []) {
        if (bot === opts.exclude || !bot.alive) continue;
        for (const mesh of bot.hitMeshes) botMeshes.push(mesh);
      }
      raycaster.set(origin, dir);
      const mapHits = raycaster.intersectObjects(meshes, false);
      let bestDist = mapHits.length ? mapHits[0].distance : Infinity;
      let best = mapHits.length
        ? { kind: 'map', object: mapHits[0].object, point: mapHits[0].point, distance: mapHits[0].distance }
        : null;
      if (botMeshes.length) {
        const botHits = raycaster.intersectObjects(botMeshes, false);
        if (botHits.length && botHits[0].distance < bestDist) {
          bestDist = botHits[0].distance;
          best = { kind: 'bot', object: botHits[0].object, point: botHits[0].point, distance: botHits[0].distance };
        }
      }

      // The player, analytically.
      if (opts.player && opts.player !== opts.exclude && opts.player.alive) {
        const boxes = playerBoxes(opts.player);
        const dHead = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, boxes.headBox);
        const dTorso = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, boxes.torsoBox);
        const dPlayer = Math.min(dHead, dTorso);
        if (dPlayer < bestDist && dPlayer <= (opts.range || 120)) {
          bestDist = dPlayer;
          best = {
            kind: 'player',
            object: null,
            point: new THREE.Vector3(origin.x + dir.x * dPlayer, origin.y + dir.y * dPlayer, origin.z + dir.z * dPlayer),
            distance: dPlayer,
            part: dHead <= dTorso ? 'head' : 'body',
          };
        }
      }

      const travel = Math.min(bestDist, opts.range || 120);
      const end = new THREE.Vector3(origin.x + dir.x * travel, origin.y + dir.y * travel, origin.z + dir.z * travel);
      fx.tracer(origin, end);

      if (!best) return { kind: 'none', point: end, distance: bestDist, damage: 0 };
      if (best.kind === 'map') {
        fx.impact(best.point);
        return { kind: 'map', point: best.point, distance: best.distance, damage: 0 };
      }
      const part = best.kind === 'player'
        ? best.part
        : (best.object.userData.part || 'body');
      const damage = opts.damage * (part === 'head' ? opts.headMult : 1);
      const entity = best.kind === 'player' ? opts.player : best.object.userData.bot;
      return { kind: best.kind, entity, part, point: best.point, distance: best.distance, damage };
    },
  };
}
