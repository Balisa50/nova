import { NextRequest, NextResponse } from "next/server";

// Server-side proxy: forwards the multipart form to the FastAPI backend so the
// backend URL stays server-side and we can shape errors for the client.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export const runtime = "nodejs";
export const maxDuration = 60;

const WARMING_MESSAGE =
  "The engine is warming up - this can take a few seconds the first time. Please try again in a moment.";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    // Nudge the (free-tier, scale-to-zero) backend awake first; this request
    // blocks while the machine boots, so the generate call below lands warm.
    await fetch(`${BACKEND_URL}/api/status`, { cache: "no-store" }).catch(() => {});

    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      body: form,
    });

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
