import { NextRequest, NextResponse } from "next/server";

// Server-side proxy: forwards the multipart form to the FastAPI backend so the
// backend URL stays server-side and we can shape errors for the client.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      body: form,
    });

    const text = await res.text();
    if (!res.ok) {
      let message = `Backend error (${res.status})`;
      try {
        message = JSON.parse(text)?.detail ?? message;
      } catch {
        /* keep default */
      }
      return NextResponse.json({ error: message }, { status: res.status });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: `Could not reach the backend at ${BACKEND_URL}. Is it running?` },
      { status: 502 }
    );
  }
}
