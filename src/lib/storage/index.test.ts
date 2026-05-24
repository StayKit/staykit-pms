import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { encryptBuffer, decryptBuffer, saveFile, readStoredFile, deleteStoredFile } from "./index";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const UP = mkdtempSync(path.join(tmpdir(), "staykit-uploads-"));
vi.stubEnv("STAYKIT_UPLOAD_DIR", UP);

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});
afterAll(() => vi.unstubAllEnvs());

describe("encryptBuffer / decryptBuffer", () => {
  it("round-trips and produces different ciphertext each time", () => {
    const plain = Buffer.from("Aadhaar 1234 5678 9012");
    const a = encryptBuffer(plain);
    const b = encryptBuffer(plain);
    expect(a.equals(b)).toBe(false); // random IV
    expect(decryptBuffer(a).toString()).toBe(plain.toString());
  });
});

describe("saveFile", () => {
  it("encrypts GUEST_ID files at rest and decrypts on read", async () => {
    const buffer = Buffer.from("passport-scan-bytes");
    const file = await saveFile({
      ownerId: fx.owner.id,
      uploadedById: fx.user.id,
      kind: "GUEST_ID",
      buffer,
      mime: "image/jpeg",
      ext: "jpg",
    });
    expect(file.encrypted).toBe(true);
    const back = await readStoredFile(file.id, fx.owner.id);
    expect(back.toString()).toBe("passport-scan-bytes");
  });

  it("stores non-ID files unencrypted", async () => {
    const file = await saveFile({
      ownerId: fx.owner.id,
      uploadedById: fx.user.id,
      kind: "ROOM_PHOTO",
      buffer: Buffer.from("room.jpg"),
      mime: "image/jpeg",
      ext: "jpg",
    });
    expect(file.encrypted).toBe(false);
    expect((await readStoredFile(file.id, fx.owner.id)).toString()).toBe("room.jpg");
  });

  it("deletes the row and tolerates a missing id", async () => {
    const file = await saveFile({
      ownerId: fx.owner.id,
      uploadedById: fx.user.id,
      kind: "OTHER",
      buffer: Buffer.from("x"),
      mime: "text/plain",
      ext: "txt",
    });
    await deleteStoredFile(file.id);
    expect(await prisma.fileUpload.findUnique({ where: { id: file.id } })).toBeNull();
    await expect(deleteStoredFile("missing")).resolves.toBeUndefined();
  });

  it("scopes reads to the owner", async () => {
    const file = await saveFile({
      ownerId: fx.owner.id,
      uploadedById: fx.user.id,
      kind: "OTHER",
      buffer: Buffer.from("x"),
      mime: "text/plain",
      ext: "txt",
    });
    await expect(readStoredFile(file.id, "someone-else")).rejects.toThrow(/not found/);
  });
});
