import { NextRequest, NextResponse } from "next/server";

/** Node fetch often resolves `localhost` to `::1` while Ollama typically listens on IPv4 only, causing ECONNREFUSED or long fallback delays. */
function normalizeLocalhostToIpv4(urlString: string): string {
  try {
    const u = new URL(urlString);
    if (u.hostname === "localhost" || u.hostname === "::1") {
      u.hostname = "127.0.0.1";
    }
    return u.href;
  } catch {
    return urlString;
  }
}

/**
 * Server-side proxy for local model APIs (Ollama, LM Studio, etc.)
 * that reject browser CORS preflight requests.
 *
 * The browser sends requests to /api/proxy?url=<encoded-target-url>
 * and this route forwards them server-side, bypassing CORS entirely.
 */
export async function POST(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const targetUrl = normalizeLocalhostToIpv4(rawUrl);

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
    const msg = err instanceof Error ? err.message : String(err);
    const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    return NextResponse.json(
      {
        error: isConnRefused
          ? `Cannot reach ${targetUrl} — is the server running? Start with: ollama serve`
          : `Proxy error: ${msg}`,
      },
      { status: 502 }
    );
  }
}
