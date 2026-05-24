/**
 * File storage (§B.11). v1 ships a local-disk backend; guest ID documents are
 * AES-256-GCM encrypted at rest. The S3 backend is a documented future swap behind
 * this same interface. Files live under <root>/<owner>/<sha[0:2]>/<sha>.<ext>.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db";

export function uploadRoot(): string {
  return process.env.STAYKIT_UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

/** Derive a 32-byte key from FILE_ENCRYPTION_KEY (any length) via scrypt. */
function encryptionKey(): Buffer {
  const secret = process.env.FILE_ENCRYPTION_KEY || "staykit-dev-file-key";
  return scryptSync(secret, "staykit-file-salt", 32);
}

/** Encrypt: returns iv(12) || authTag(16) || ciphertext. */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export interface SaveFileInput {
  ownerId: string;
  uploadedById: string;
  kind: "GUEST_ID" | "ROOM_PHOTO" | "INVOICE_PDF" | "OTHER";
  buffer: Buffer;
  mime: string;
  ext: string;
}

/**
 * Persist a file and create its FileUpload row. GUEST_ID files are mandatorily
 * encrypted at rest; everything else is stored as-is.
 */
export async function saveFile(input: SaveFileInput) {
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  const encrypted = input.kind === "GUEST_ID";
  const payload = encrypted ? encryptBuffer(input.buffer) : input.buffer;

  const rel = path.join(input.ownerId, sha256.slice(0, 2), `${sha256}.${input.ext}`);
  const abs = path.join(uploadRoot(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, payload);

  return prisma.fileUpload.create({
    data: {
      ownerId: input.ownerId,
      kind: input.kind,
      path: rel,
      storage: "local",
      mime: input.mime,
      sizeBytes: input.buffer.length,
      sha256,
      encrypted,
      uploadedById: input.uploadedById,
    },
  });
}

/** Read a stored file, decrypting if it was encrypted. Caller enforces RBAC/step-up. */
export async function readStoredFile(fileId: string, ownerId: string): Promise<Buffer> {
  const file = await prisma.fileUpload.findFirst({ where: { id: fileId, ownerId } });
  if (!file) throw new Error("File not found.");
  const blob = await readFile(path.join(uploadRoot(), file.path));
  return file.encrypted ? decryptBuffer(blob) : blob;
}

/** Delete the bytes and the row. Used by DPDP purge / erasure. */
export async function deleteStoredFile(fileId: string): Promise<void> {
  const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
  if (!file) return;
  await unlink(path.join(uploadRoot(), file.path)).catch(() => {});
  await prisma.fileUpload.delete({ where: { id: file.id } });
}
