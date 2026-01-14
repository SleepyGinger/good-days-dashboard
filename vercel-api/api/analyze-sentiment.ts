import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { notes } = req.body;

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: "No notes provided" });
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

    return res.status(200).json({
      grade: result.grade,
      summary: result.summary,
    });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return res.status(500).json({ error: "Failed to analyze sentiment" });
  }
}
