import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { notes } = await request.json();

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return NextResponse.json(
        { error: "No notes provided" },
        { status: 400 }
      );
    }

    // Combine all notes into a single text for analysis
    const notesText = notes
      .map((n: { date: string; note: string }) => `${n.date}: ${n.note}`)
      .join("\n\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Analyze the following journal entries from this month and provide:
1. A sentiment score from 0-100 (0 = very negative, 50 = neutral, 100 = very positive)
2. A short evocative phrase (3-6 words) that captures the overall vibe/theme of the month

Journal entries:
${notesText}

Respond in JSON format only:
{"score": <number>, "phrase": "<string>"}`,
        },
      ],
    });

    // Extract the text content
    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse the JSON response
    const result = JSON.parse(textContent.text);

    return NextResponse.json({
      score: result.score,
      phrase: result.phrase,
    });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze sentiment" },
      { status: 500 }
    );
  }
}
