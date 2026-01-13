import Anthropic from "@anthropic-ai/sdk";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { notes } = await req.json();

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return new Response(JSON.stringify({ error: "No notes provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const anthropic = new Anthropic();

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

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Extract JSON from response, handling potential markdown code blocks
    let jsonText = textContent.text.trim();
    console.log("Raw Claude response:", jsonText);

    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let result;
    try {
      result = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("JSON parse error. Text was:", jsonText);
      // Try to extract with regex as fallback
      const gradeMatch = jsonText.match(/"grade"\s*:\s*"([^"]+)"/);
      const summaryMatch = jsonText.match(/"summary"\s*:\s*"([^"]+)"/);
      if (gradeMatch && summaryMatch) {
        result = { grade: gradeMatch[1], summary: summaryMatch[1] };
      } else {
        throw parseError;
      }
    }

    return new Response(
      JSON.stringify({
        grade: result.grade,
        summary: result.summary,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to analyze sentiment" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
