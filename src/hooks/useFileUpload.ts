import { useState, useCallback } from "react";

interface UploadState {
    file: File | null;
    progress: number;       // 0-100 — real progress from XHR
    uploading: boolean;
    uploaded: boolean;
    publicUrl: string | null;
    error: string | null;
}

const initialState: UploadState = {
    file: null,
    progress: 0,
    uploading: false,
    uploaded: false,
    publicUrl: null,
    error: null,
};

const WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

export function useFileUpload(_bucket?: string) {
    const [state, setState] = useState<UploadState>(initialState);

    const selectFile = useCallback((file: File | null) => {
        setState({ ...initialState, file });
    }, []);

    const upload = useCallback(async (folder: string): Promise<string | null> => {
        if (!state.file) return null;
        if (!WORKER_URL) {
            setState((s) => ({ ...s, error: "Upload service is not configured. Contact admin." }));
            return null;
        }

        setState((s) => ({ ...s, uploading: true, progress: 0, error: null }));

        try {
            // POST directly to the worker's /upload endpoint with XHR for progress events.
            // The worker accepts the raw file body and reads folder/filename from query params.
            const url = new URL(`${WORKER_URL}/upload`);
            url.searchParams.set("folder", folder);
            url.searchParams.set("filename", state.file.name);

            const publicUrl = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener("progress", (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        setState((s) => ({ ...s, progress: pct }));
                    }
                });

                xhr.addEventListener("load", () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const json = JSON.parse(xhr.responseText);
                            if (json.publicUrl) {
                                resolve(json.publicUrl);
                            } else {
                                reject(new Error(json.error ?? "Worker returned no URL"));
                            }
                        } catch {
                            reject(new Error("Invalid response from upload worker"));
                        }
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
                xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

                xhr.open("POST", url.toString());
                xhr.setRequestHeader("Content-Type", state.file!.type || "application/octet-stream");
                xhr.send(state.file);
            });

            setState((s) => ({ ...s, uploading: false, uploaded: true, progress: 100, publicUrl }));
            return publicUrl;

        } catch (err: any) {
            setState((s) => ({ ...s, uploading: false, progress: 0, error: err.message }));
            return null;
        }
    }, [state.file]);

    const remove = useCallback(() => setState(initialState), []);
    const reset = useCallback(() => setState(initialState), []);

    return { ...state, selectFile, upload, remove, reset };
}
