// Minimale Typdeklaration (ohne @types/node), damit Tests Dateien lesen können.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
}
