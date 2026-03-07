import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UploadState {
    file: File | null;
    progress: number;       // 0-100
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

export function useFileUpload(bucket: string = "crm-files") {
    const [state, setState] = useState<UploadState>(initialState);

    const selectFile = useCallback((file: File | null) => {
        setState({ ...initialState, file });
    }, []);

    const upload = useCallback(async (folder: string): Promise<string | null> => {
        if (!state.file) return null;

        setState((s) => ({ ...s, uploading: true, progress: 0, error: null }));

        const filePath = `${folder}/${Date.now()}_${state.file.name}`;

        try {
            // Simulate progress for small files (Supabase JS doesn't expose progress)
            const progressInterval = setInterval(() => {
                setState((s) => {
                    if (s.progress < 90) return { ...s, progress: s.progress + 10 };
                    return s;
                });
            }, 200);

            const { error: uploadErr } = await supabase.storage.from(bucket).upload(filePath, state.file);
            clearInterval(progressInterval);

            if (uploadErr) {
                setState((s) => ({ ...s, uploading: false, progress: 0, error: uploadErr.message }));
                return null;
            }

            const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

            setState((s) => ({
                ...s,
                uploading: false,
                uploaded: true,
                progress: 100,
                publicUrl,
            }));

            return publicUrl;
        } catch (err: any) {
            setState((s) => ({ ...s, uploading: false, progress: 0, error: err.message }));
            return null;
        }
    }, [state.file, bucket]);

    const remove = useCallback(() => {
        setState(initialState);
    }, []);

    const reset = useCallback(() => {
        setState(initialState);
    }, []);

    return { ...state, selectFile, upload, remove, reset };
}
