/** Lightweight UUID v4 using the browser's crypto API */
export function uuidv4(): string {
  return crypto.randomUUID();
}
