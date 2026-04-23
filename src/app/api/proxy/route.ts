import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for local model APIs (Ollama, LM Studio, etc.)
 * that reject browser CORS preflight requests.
 *
 * The browser sends requests to /api/proxy?url=<encoded-target-url>
 * and this route forwards them server-side, bypassing CORS entirely.
 */
export async function POST(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const body = await req.text();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });

    const data = await upstream.text();
    return new NextResponse(data, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Proxy error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
