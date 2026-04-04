// In dev, route through Vite's proxy (/api/worker → worker URL) to bypass CORS.
// In production, hit the worker directly.
const WORKER_URL = import.meta.env.DEV
  ? "/api/worker"
  : import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

// Timeout helpers
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out. Please check your connection and try again.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Upload a file to Cloudflare R2 via the Worker proxy.
 * Uses fetch + arrayBuffer() for reliable mobile support (iOS Safari, Android Chrome).
 * Reading into ArrayBuffer first ensures deferred cloud files (iCloud, Google Photos)
 * are fully downloaded before the upload begins.
 * Includes timeouts so it never hangs silently on slow mobile connections.
 */
export async function uploadToR2(
  file: File,
  folder: string,
  onProgress: (pct: number) => void
): Promise<string> {
  if (!WORKER_URL) {
    throw new Error("Upload service is not configured. Contact admin.");
  }
  const urlStr = `${WORKER_URL}/upload?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(file.name)}`;

  onProgress(0);

  // Read full file into memory — fixes iOS Safari iCloud/Google Photos deferred access.
  // 60s timeout: large files on mobile slow networks can take time to download from cloud.
  const buffer = await withTimeout(
    file.arrayBuffer(),
    60_000,
    "Reading file"
  );

  onProgress(20);

  // Upload with AbortController + 120s timeout so fetch never hangs silently on mobile.
  const controller = new AbortController();
  const uploadTimer = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(urlStr, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Upload timed out. Please check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(uploadTimer);
  }

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
