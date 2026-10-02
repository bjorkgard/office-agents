import { hash } from "./appearance";
import { SHIRTS } from "./palette";

export type Gender = "female" | "male";
export type Identity = { name: string; gender: Gender };
export type ShirtChoice = { index: number; stripe: boolean };

const NAMES: Record<Gender, readonly string[]> = {
  female: [
    "Ada",
    "Beth",
    "Cleo",
    "Dana",
    "Eva",
    "Fay",
    "Gwen",
    "Hana",
    "Ines",
    "June",
    "Kira",
    "Lena",
  ],
  male: ["Abel", "Ben", "Carl", "Dev", "Eli", "Finn", "Gus", "Hugo", "Ivan", "Jon", "Kai", "Leo"],
};

// Same session id, same person. The seed is the id only, never transcript text.
export function identityFor(sessionId: string): Identity {
  const h = hash(sessionId);
  const gender: Gender = h % 2 === 0 ? "female" : "male";
  const names = NAMES[gender];
  return { name: names[Math.floor(h / 2) % names.length], gender };
}

// One number per (color, stripe) pair: plain colors take 0..SHIRTS.length-1, striped the next
// SHIRTS.length.
export function shirtSlot(shirt: ShirtChoice): number {
  return shirt.index + (shirt.stripe ? SHIRTS.length : 0);
}

// Hash the project path to a preferred color, then probe forward past the shirts
// that active projects already hold. Plain colors go first, so stripes start after
// SHIRTS.length projects. With every pair held the preferred plain shirt is reused.
export function pickShirt(projectPath: string, held: readonly ShirtChoice[]): ShirtChoice {
  const taken = new Set(held.map(shirtSlot));
  const start = hash(projectPath) % SHIRTS.length;
  for (const stripe of [false, true]) {
    for (let i = 0; i < SHIRTS.length; i++) {
      const shirt = { index: (start + i) % SHIRTS.length, stripe };
      if (!taken.has(shirtSlot(shirt))) return shirt;
    }
  }
  return { index: start, stripe: false };
}
