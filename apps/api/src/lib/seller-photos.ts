import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export const sellerPhotoDirectory = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads", "sellers");

export function sellerPhotoFilename(photoUrl: string | null | undefined) {
  const match = photoUrl?.match(/^public\/seller-photos\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/i);
  return match?.[1];
}

export async function removeSellerPhoto(photoUrl: string | null | undefined) {
  const filename = sellerPhotoFilename(photoUrl);
  if (!filename) return;
  await mkdir(sellerPhotoDirectory, { recursive: true });
  try {
    await unlink(join(sellerPhotoDirectory, filename));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}
