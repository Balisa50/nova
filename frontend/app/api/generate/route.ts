import { NextRequest, NextResponse } from "next/server";

// Server-side proxy: forwards the multipart form to the FastAPI backend so the
// backend URL stays server-side and we can shape errors for the client.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export const runtime = "nodejs";
export const maxDuration = 60;

const WARMING_MESSAGE =
  "The engine is warming up - this can take a few seconds the first time. Please try again in a moment.";

/**
 * fetch with a hard deadline. Node's fetch has no timeout of its own, so a
 * sleeping backend blocks until the platform kills the whole function, which
 * loses the ability to return a useful message.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    // Nudge the (free-tier, scale-to-zero) backend awake first, but bounded.
    //
    // This used to be an unbounded await. A cold Hugging Face Space takes
    // around 50 seconds to boot (measured 49s on 2026-08-14), so the nudge
    // alone consumed almost the whole 60-second function budget and the
    // generate call below was killed by the platform mid-flight. The user then
    // saw a generic failure instead of the friendly "warming up" message this
    // route exists to produce.
    //
    // Capped at 8 seconds: long enough to wake an already-warm or nearly-warm
    // backend, short enough to leave the budget for the real work. If the
    // backend is still cold after that, the generate call fails fast and the
    // handler below returns WARMING_MESSAGE, which is the intended outcome.
    await fetchWithTimeout(`${BACKEND_URL}/api/status`, { cache: "no-store" }, 8_000).catch(
      () => {}
    );

    // Leaves headroom under maxDuration so a slow backend produces our own
    // message rather than a platform timeout with no body.
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/api/generate`,
      { method: "POST", body: form },
      45_000
    );

    const text = await res.text();
    if (!res.ok) {
      // A real input problem (4xx) gets the backend's own guidance; anything
      // else is treated as "still warming up", never a scary failure.
      const isUserError = res.status >= 400 && res.status < 500;
      let message = WARMING_MESSAGE;
      if (isUserError) {
        try {
          message = JSON.parse(text)?.detail ?? "Please check your file and try again.";
        } catch {
          message = "Please check your file and try again.";
        }
      }
      return NextResponse.json({ error: message }, { status: res.status });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: WARMING_MESSAGE }, { status: 503 });
  }
}
