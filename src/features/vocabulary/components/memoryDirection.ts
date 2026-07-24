export type MemoryDirection = 'en-to-ja' | 'ja-to-en';

export function getMemoryDirection(
  sessionId: string,
  itemId: number,
  position: number,
): MemoryDirection {
  const seed = `${sessionId}:${itemId}:${position}`;
  let hash = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2_246_822_507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3_266_489_909);
  hash ^= hash >>> 16;

  return (hash >>> 0) % 2 === 0 ? 'en-to-ja' : 'ja-to-en';
}
