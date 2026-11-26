import { SAMPLE_GRID_SERIES_STATE } from "../public/js/pro-data.js";

const GRID_ENDPOINTS = {
  "central-data": "https://api-op.grid.gg/central-data/graphql",
  "series-state": "https://api-op.grid.gg/live-data-feed/series-state/graphql",
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function handleCoach(req, env) {
  if (req.method === "OPTIONS") return jsonResp({}, 204);
  if (req.method !== "POST") return jsonResp({ error: "POST required" }, 405);
  let body;
  try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }
  const question = String(body.question || "").trim().slice(0, 600);
  if (!question) return jsonResp({ error: "Question required" }, 400);

  const systemPrompt = `You are StratosDraft's League of Legends Hard Fearless Draft Assistant Coach for Cloud9.
Answer strictly from the live draft telemetry, Bradley-Terry win probabilities, Save-or-Burn Monte Carlo recommendations, and GRID scouting context provided below.
Be concise (4-6 crisp tactical bullet points), cite exact percentages and champion names from the JSON, and never invent champions or stats outside the context.`;

  try {
    const res = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `LIVE DRAFT CONTEXT:\n${JSON.stringify(body.context || {}, null, 2)}\n\nCOACH QUESTION: ${question}` },
      ],
      max_tokens: 520,
      temperature: 0.2,
    });
    const answer = res?.choices?.[0]?.message?.content || res?.response || "Unable to produce coach note.";
    return jsonResp({ ok: true, answer });
  } catch (err) {
    return jsonResp({ ok: false, error: `Workers AI unavailable: ${String(err).slice(0, 140)}` }, 502);
  }
}

async function handleGridProxy(req) {
  if (req.method === "OPTIONS") return jsonResp({}, 204);
  if (req.method !== "POST") return jsonResp({ error: "POST required" }, 405);
  let body;
  try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }
  const target = GRID_ENDPOINTS[body.endpoint];
  if (!target) return jsonResp({ error: "Endpoint must be central-data or series-state." }, 400);
  const apiKey = String(body.apiKey || "").trim();
  if (!apiKey) {
    return jsonResp({
      mode: "demo_grid_schema_preview",
      note: "No x-api-key provided; returning authentic GRID v2 Series-State sample payload. Supply your hackathon GRID API key to query live GRID GraphQL directly.",
      sample: SAMPLE_GRID_SERIES_STATE,
    });
  }
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ query: String(body.query || ""), variables: body.variables || {} }),
    });
    const text = await upstream.text();
    try { return jsonResp(JSON.parse(text), upstream.status); }
    catch { return jsonResp({ status: upstream.status, raw: text.slice(0, 2000) }, upstream.status); }
  } catch (err) {
    return jsonResp({ error: `GRID upstream error: ${String(err)}` }, 502);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return jsonResp({ ok: true, service: "stratosdraft-c9", format: "Hard Fearless Bo5/Bo3" });
    }
    if (url.pathname === "/api/grid/sample-series") {
      return jsonResp(SAMPLE_GRID_SERIES_STATE);
    }
    if (url.pathname === "/api/grid/query") {
      return handleGridProxy(req);
    }
    if (url.pathname === "/api/coach") {
      return handleCoach(req, env);
    }
    const assetUrl = new URL(req.url);
    if (url.pathname === "/") assetUrl.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(assetUrl.toString(), req));
  },
};
