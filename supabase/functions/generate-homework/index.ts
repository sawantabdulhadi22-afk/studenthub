import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Please sign in first." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const publishableKeysJson = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  let anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!anonKey && publishableKeysJson) {
    try { anonKey = JSON.parse(publishableKeysJson).default || ""; } catch { /* use legacy env if available */ }
  }
  if (!anonKey) return json({ error: "Supabase publishable key is not available to the Edge Function." }, 500);
  const aiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  if (!aiKey) return json({ error: "AI service is not configured by the administrator yet." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Your session is invalid. Please log in again." }, 401);

  let body: { questions?: string; detail?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const questions = String(body.questions || "").trim();
  const detail = body.detail === "detailed" ? "detailed" : "concise";
  if (questions.length < 10) return json({ error: "Please provide assignment questions." }, 400);
  if (questions.length > 18000) return json({ error: "Assignment text is too long. Keep it below 18,000 characters." }, 400);

  const { data: reservation, error: reserveError } = await supabase.rpc("reserve_homework_generation");
  if (reserveError) return json({ error: reserveError.message.includes("limit") ? reserveError.message : "Could not reserve a PDF generation. " + reserveError.message }, 429);

  const jobId = reservation.job_id;
  try {
    const prompt = `You are an educational study assistant. Prepare accurate, age-appropriate answers to the student's assignment questions. Detail level: ${detail}. Use clear simple English, correct formulas and units where relevant. Do not invent official exam sources. If a question is ambiguous, say what assumption you used. Return ONLY valid JSON in this exact shape: {"answers":[{"question":"question text","answer":"answer text"}]}. Split the assignment into separate question-answer pairs. Do not use markdown fences.\n\nASSIGNMENT:\n${questions}`;

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: 5000,
      }),
    });
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI provider error (${aiResponse.status}): ${errorText.slice(0, 400)}`);
    }
    const aiData = await aiResponse.json();
    const outputText = aiData.output?.flatMap((item: any) => item.content || [])
      .filter((part: any) => part.type === "output_text")
      .map((part: any) => part.text).join("\n") || "";
    const cleaned = outputText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.answers) || parsed.answers.length === 0) throw new Error("AI returned no answer list.");

    const { error: updateError } = await supabase.from("homework_jobs").update({
      status: "completed",
      generated_answers: parsed.answers,
      question_count: parsed.answers.length,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId).eq("user_id", userData.user.id);
    if (updateError) throw updateError;

    return json({
      job_id: jobId,
      answers: parsed.answers,
      watermark: Boolean(reservation.watermark),
      sequence: reservation.sequence,
      plan: reservation.plan,
    });
  } catch (error) {
    await supabase.from("homework_jobs").update({
      status: "failed",
      error_message: String(error).slice(0, 500),
    }).eq("id", jobId).eq("user_id", userData.user.id);
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Homework generation failed." }, 500);
  }
});
