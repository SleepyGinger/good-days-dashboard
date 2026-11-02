import type { IncomingMessage, ServerResponse } from "node:http";
import { createSentimentService } from "../lib/sentiment-service.js";

const handleSentiment = createSentimentService();

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const response = await handleSentiment(req);
  res.statusCode = response.status;
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  if (response.body === null) return res.end();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(response.body));
}
