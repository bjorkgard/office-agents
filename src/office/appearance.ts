import type { HairToken, SkinToken } from "./CharacterRig";
import { HAIRSTYLES } from "./sprites";

export const HAIR: readonly HairToken[] = ["--hair-1", "--hair-2", "--hair-3", "--hair-4"];
export const SKIN: readonly SkinToken[] = ["--skin-1", "--skin-2", "--skin-3"];

export type Appearance = { hairStyle: number; hair: HairToken; skin: SkinToken };

// FNV-1a over the UTF-16 code units, then a murmur3 finalizer so short seeds that
// differ in one character still spread over every bucket.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Same seed, same look: hairstyle, hair color and skin tone from one hash.
export function appearanceFor(seed: string): Appearance {
  const h = hash(seed);
  return {
    hairStyle: h % HAIRSTYLES.length,
    hair: HAIR[Math.floor(h / HAIRSTYLES.length) % HAIR.length],
    skin: SKIN[Math.floor(h / (HAIRSTYLES.length * HAIR.length)) % SKIN.length],
  };
}
