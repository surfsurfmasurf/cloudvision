import express from "express";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

// OpenAI: Ephemeral token endpoint
app.post("/api/openai/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: "gpt-4o-realtime-preview",
            voice: "shimmer",
            instructions:
              "You are a friendly assistant. Respond naturally in the same language the user speaks.",
          },
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error("OpenAI token error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Gemini: proxy the API key
app.get("/api/gemini/key", (req, res) => {
  res.json({ key: process.env.GEMINI_API_KEY });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`  OpenAI Realtime (WebRTC): http://localhost:${PORT}/openai.html`);
  console.log(`  Gemini Live (WebSocket):  http://localhost:${PORT}/gemini.html`);
});
