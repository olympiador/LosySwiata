import { NextResponse } from "next/server";

const MAX_PROMPT_LENGTH = 30_000;

type ResponseContent = { type?: string; text?: string };
type ResponseItem = { content?: ResponseContent[] };

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI nie jest jeszcze skonfigurowane na serwerze" }, { status: 503 });

  let prompt = "";
  try {
    const body = await request.json() as { prompt?: unknown };
    if (typeof body.prompt === "string") prompt = body.prompt.trim();
  } catch { /* invalid JSON is handled below */ }
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: "Nieprawidłowe dane kroniki" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_CHRONICLE_MODEL ?? "gpt-5-mini",
        instructions: "Jesteś kronikarzem alternatywnej historii. Pisz po polsku, opieraj się wyłącznie na przekazanych danych i nie dopisuj nieistniejących faktów.",
        input: prompt,
        max_output_tokens: 1800,
      }),
    });
    const payload = await response.json() as { error?: { message?: string }; output?: ResponseItem[] };
    if (!response.ok) throw new Error(payload.error?.message ?? "Usługa AI odrzuciła żądanie");
    const text = payload.output?.flatMap((item) => item.content ?? []).filter((content) => content.type === "output_text").map((content) => content.text ?? "").join("\n").trim();
    if (!text) throw new Error("AI nie zwróciło treści kroniki");
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nie udało się utworzyć kroniki" }, { status: 502 });
  }
}
