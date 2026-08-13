import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64; 

export function hashSenha(senhaPlana: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senhaPlana, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarSenha(senhaPlana: string, senhaHash: string): boolean {
  const [salt, hash] = senhaHash.split(":");
  if (!salt || !hash) return false;
  const calculado = scryptSync(senhaPlana, salt, KEYLEN);
  const armazenado = Buffer.from(hash, "hex");
  if (calculado.length !== armazenado.length) return false;
  return timingSafeEqual(calculado, armazenado);
}