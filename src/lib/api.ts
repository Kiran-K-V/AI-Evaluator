import type { ApiResponse, ModelConfig } from "./types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallModelOptions {
  messages: ChatMessage[];
  config: ModelConfig;
  tools?: Record<string, unknown>[];
  responseFormat?: { type: string };
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

  const start = performance.now();

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
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
