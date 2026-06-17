/**
 * File storage abstraction.
 * ---------------------------------------------------------------------------
 * The local implementation writes to /public/uploads. The FileStorage
 * interface is the seam for swapping in Vercel Blob, S3, or another provider
 * later without touching call sites.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export interface SaveFileInput {
  buffer: Buffer;
  /** Original filename or any name with an extension; used to derive the extension. */
  filename: string;
  contentType?: string;
}

export interface FileStorage {
  /** Persist a file and return its public-facing path/URL. */
  save(input: SaveFileInput): Promise<string>;
  /** Download a remote URL and persist it; returns the public path/URL. */
  saveFromUrl(url: string): Promise<string>;
}

const UPLOAD_SUBDIR = path.join("public", "uploads");

function uploadDir(): string {
  return path.join(process.cwd(), UPLOAD_SUBDIR);
}

function safeExtension(filename: string, contentType?: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext && /^\.[a-z0-9]{1,5}$/.test(ext)) return ext;
  if (contentType) {
    const map: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    if (map[contentType]) return map[contentType];
  }
  return ".png";
}

function randomName(ext: string): string {
  return `${crypto.randomBytes(16).toString("hex")}${ext}`;
}

export class LocalFileStorage implements FileStorage {
  async save(input: SaveFileInput): Promise<string> {
    const dir = uploadDir();
    await fs.mkdir(dir, { recursive: true });
    const name = randomName(safeExtension(input.filename, input.contentType));
    await fs.writeFile(path.join(dir, name), input.buffer);
    return `/uploads/${name}`;
  }

  async saveFromUrl(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download image (${res.status})`);
    }
    const contentType = res.headers.get("content-type") ?? undefined;
    const arrayBuffer = await res.arrayBuffer();
    return this.save({
      buffer: Buffer.from(arrayBuffer),
      filename: path.basename(new URL(url).pathname) || "image.png",
      contentType,
    });
  }
}

/**
 * Vercel Blob storage. Used in production (serverless filesystems are ephemeral).
 * Auto-selected when BLOB_READ_WRITE_TOKEN is present or STORAGE_PROVIDER is
 * "vercel-blob". Returns a public https URL, which works everywhere the app
 * already accepts a path or URL (img tags, resolveImage, etc.).
 */
export class VercelBlobFileStorage implements FileStorage {
  async save(input: SaveFileInput): Promise<string> {
    const { put } = await import("@vercel/blob");
    const name = `uploads/${randomName(safeExtension(input.filename, input.contentType))}`;
    const { url } = await put(name, input.buffer, {
      access: "public",
      contentType: input.contentType,
      addRandomSuffix: false,
    });
    return url;
  }

  async saveFromUrl(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download image (${res.status})`);
    }
    const contentType = res.headers.get("content-type") ?? undefined;
    const arrayBuffer = await res.arrayBuffer();
    return this.save({
      buffer: Buffer.from(arrayBuffer),
      filename: path.basename(new URL(url).pathname) || "image.png",
      contentType,
    });
  }
}

/** Which storage backend is active (after accounting for env). */
export function getStorageProviderName(): "local" | "vercel-blob" {
  const explicit = (process.env.STORAGE_PROVIDER ?? "").toLowerCase();
  if (explicit === "local") return "local";
  if (explicit === "vercel-blob") return "vercel-blob";
  // Auto: use Blob when a token is configured (e.g. a Vercel Blob store is linked).
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
}

let storage: FileStorage | null = null;

/**
 * Returns the configured FileStorage. Local disk by default; Vercel Blob when
 * STORAGE_PROVIDER=vercel-blob or BLOB_READ_WRITE_TOKEN is set.
 */
export function getFileStorage(): FileStorage {
  if (!storage) {
    storage = getStorageProviderName() === "vercel-blob"
      ? new VercelBlobFileStorage()
      : new LocalFileStorage();
  }
  return storage;
}
