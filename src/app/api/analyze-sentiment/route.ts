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
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Analyze the following journal entries from this month and provide:
1. A letter grade for the overall mood (A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F)
2. A brief evocative summary (2-3 sentences) that captures the overall vibe, themes, and emotional arc of the month

Journal entries:
${notesText}

Respond in JSON format only:
{"grade": "<letter>", "summary": "<string>"}`,
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
      grade: result.grade,
      summary: result.summary,
    });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze sentiment" },
      { status: 500 }
    );
  }
}
