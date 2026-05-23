/** Human-friendly booking references, e.g. "SK-A8X3Q". Unambiguous alphabet. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1

export function generateBookingRef(): string {
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SK-${s}`;
}
