const WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

/**
 * Upload a file to Cloudflare R2 via the Worker proxy.
 * Uses fetch + arrayBuffer() for reliable mobile support (iOS Safari, Android Chrome).
 * Reading into ArrayBuffer first ensures deferred cloud files (iCloud, Google Photos)
 * are fully downloaded before the upload begins.
 */
export async function uploadToR2(
  file: File,
  folder: string,
  onProgress: (pct: number) => void
): Promise<string> {
  const url = new URL(`${WORKER_URL}/upload`);
  url.searchParams.set("folder", folder);
  url.searchParams.set("filename", file.name);

  onProgress(0);

  // Read full file into memory — fixes iOS Safari iCloud/deferred file access issues
  const buffer = await file.arrayBuffer();

  onProgress(20);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: buffer,
  });

  onProgress(90);

  if (!response.ok) {
    let msg = `Upload failed (HTTP ${response.status})`;
    try {
      const data = await response.json();
      msg = data.error ?? msg;
    } catch { }
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data.publicUrl) throw new Error("Invalid response from upload Worker");

  onProgress(100);
  return data.publicUrl;
}
