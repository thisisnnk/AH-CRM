const WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

/**
 * Upload a file to Cloudflare R2 via the Worker proxy.
 * The file is sent directly to the Worker which puts it into R2.
 * Returns the public URL of the uploaded file.
 */
export function uploadToR2(
  file: File,
  folder: string,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(`${WORKER_URL}/upload`);
    url.searchParams.set("folder", folder);
    url.searchParams.set("filename", file.name);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { publicUrl } = JSON.parse(xhr.responseText);
          onProgress(100);
          resolve(publicUrl);
        } catch {
          reject(new Error("Invalid response from upload Worker"));
        }
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText)?.error ?? msg; } catch { }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out — please try again")));

    xhr.open("POST", url.toString());
    xhr.timeout = 120_000;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
  });
}
