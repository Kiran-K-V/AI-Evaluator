import type { ApiResponse, ModelConfig, ToolCall } from "./types";

interface SystemMessage {
  role: "system";
  content: string;
}

interface UserMessage {
  role: "user";
  content: string;
}

interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

interface ToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

interface CallModelOptions {
  messages: ChatMessage[];
  config: ModelConfig;
  tools?: Record<string, unknown>[];
  responseFormat?: { type: string };
}

function isLocalUrl(url: string): boolean {
  return (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("0.0.0.0") ||
    url.includes("host.docker.internal")
  );
}

/** Use IPv4 for local APIs so server-side and Node do not target `::1` when only IPv4 is listening. */
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

export async function callModel(options: CallModelOptions): Promise<ApiResponse> {
  const { messages, config, tools, responseFormat } = options;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({ type: "function", function: t }));
    body.tool_choice = "auto";
  }

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const baseUrl =
    isLocalUrl(config.baseUrl) ? normalizeLocalhostToIpv4(config.baseUrl) : config.baseUrl;
  const targetUrl = `${baseUrl}/chat/completions`;
  const useProxy = isLocalUrl(config.baseUrl);

  const fetchUrl = useProxy
    ? `/api/proxy?url=${encodeURIComponent(targetUrl)}`
    : targetUrl;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const start = performance.now();

  const res = await fetch(fetchUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const latency = performance.now() - start;

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content ?? "",
    usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    latency,
    toolCalls: choice?.message?.tool_calls,
    finishReason: choice?.finish_reason,
  };
}

export async function testConnection(config: ModelConfig): Promise<boolean> {
  try {
    await callModel({
      messages: [{ role: "user", content: "Say hello in one word." }],
      config,
    });
    return true;
  } catch {
    return false;
  }
}
