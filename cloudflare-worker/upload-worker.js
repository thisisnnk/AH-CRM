/**
 * Cloudflare Worker — R2 Direct Upload Proxy
 *
 * Browser sends the file directly to this Worker.
 * Worker puts it into R2 using the bucket binding.
 * Returns the public URL.
 */

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN ?? "*";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-File-Name",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Content-Type": "application/json",
    };

    const url = new URL(request.url);

    // POST /upload?folder=uploads&filename=file.pdf
    if (request.method !== "POST" || url.pathname !== "/upload") {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
    }

    const folder = url.searchParams.get("folder") ?? "uploads";
    const filename = url.searchParams.get("filename") ?? "file";
    const contentType = request.headers.get("content-type") ?? "application/octet-stream";

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${folder}/${Date.now()}_${safeName}`;

    try {
      const body = await request.arrayBuffer();
      await env.R2_BUCKET.put(key, body, {
        httpMetadata: { contentType },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
    }

    const publicUrl = `${env.R2_PUBLIC_DOMAIN}/${key}`;
    return new Response(JSON.stringify({ publicUrl }), { status: 200, headers: corsHeaders });
  },
};
