// LinkHub Carty natural voice — Supabase Edge Function
// Deploy as: carty-tts
//
// Required Supabase secret:
//   OPENAI_TTS_API_KEY
//
// The OpenAI key is NEVER sent to the browser.
// The browser only calls this Supabase function using the normal anon key.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_TEXT_LENGTH = 1800;
const MODEL = "gpt-4o-mini-tts";
const VOICE = "marin";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!text) return json({ error: "Missing text" }, 400);
    if (text.length > MAX_TEXT_LENGTH) {
      return json({ error: `Text is too long. Maximum is ${MAX_TEXT_LENGTH} characters.` }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_TTS_API_KEY");
    if (!apiKey) return json({ error: "Voice service is not configured." }, 500);

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: text,
        instructions:
          "Speak as Carty, a friendly and confident shopping assistant. " +
          "Use natural conversational pacing, clear pronunciation, gentle emphasis, " +
          "and a warm modern tone. Do not sound robotic or overly formal.",
        response_format: "mp3",
        speed: 0.98,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("OpenAI TTS error", response.status, detail.slice(0, 500));
      return json({ error: "Voice generation failed." }, 502);
    }

    const audioBytes = new Uint8Array(await response.arrayBuffer());
    return json({
      audio_base64: bytesToBase64(audioBytes),
      mime_type: "audio/mpeg",
    });
  } catch (error) {
    console.error("carty-tts error", error);
    return json({ error: "Voice generation failed." }, 500);
  }
});
