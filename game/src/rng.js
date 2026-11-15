// Seeded randomness: the whole simulation draws from one mulberry32 stream, so a
// screenshot seed replays the same bots, the same routes and the same spread.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    random,
    range(min, max) {
      return min + random() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + random() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(random() * list.length)];
    },
    // Fisher-Yates on a copy; the caller's list keeps its order.
    shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    },
  };
}
