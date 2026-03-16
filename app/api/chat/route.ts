import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, UIMessage } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system:
      "You are a scheduling assistant for an embryology lab. Help manage shift rotations, staff availability, and lab assignments. Be concise and practical.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
