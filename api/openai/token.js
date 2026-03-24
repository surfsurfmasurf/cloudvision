export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    res.status(500).json({ error: err.message });
  }
}
