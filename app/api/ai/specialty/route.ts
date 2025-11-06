import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";

// Helper: try to extract JSON from model output safely
function safeJsonParse(content: string): any | null {
  try {
    return JSON.parse(content);
  } catch (_) {
    // Try to find the first JSON object/array in the string
    const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { symptoms } = await req.json();
    if (!symptoms || typeof symptoms !== "string" || symptoms.trim().length === 0) {
      return NextResponse.json({ error: "Missing symptom information" }, { status: 400 });
    }

    // Lấy danh sách chuyên khoa từ DB
    const supabase = await createClient();
    const { data: specialties, error: specErr } = await supabase
      .from("specialty")
      .select("specialty_id, specialty_name")
      .order("specialty_name", { ascending: true });
    if (specErr) {
      return NextResponse.json({ error: "Failed to load specialties" }, { status: 500 });
    }

    // Gọi OpenRouter để recommend
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 500 });
    }

    const systemPrompt = `Bạn là trợ lý y khoa. Dựa trên triệu chứng bệnh nhân mô tả bằng tiếng Việt, hãy đề xuất các chuyên khoa phù hợp để thăm khám. Luôn chọn tối đa 10 chuyên khoa từ danh sách cung cấp và trả về đúng định dạng JSON: {"specialty_ids": [<id1>, <id2>, ...]}. Chỉ dùng các chuyên khoa có trong danh sách.`;
    const userPrompt = `Triệu chứng: "${symptoms.trim()}"\n\nDanh sách chuyên khoa (id, name):\n${specialties
      .map((s) => `- ${s.specialty_id}: ${s.specialty_name}`)
      .join("\n")}\n\nHãy trả lời JSON với key 'specialty_ids' chứa tối đa 10 id phù hợp.`;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: "API AI lỗi", detail: text }, { status: 500 });
    }
    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(content);
    const ids: number[] = Array.isArray(parsed?.specialty_ids) ? parsed.specialty_ids.slice(0, 10) : [];

    // Lọc lại ids theo danh sách hiện có để đảm bảo hợp lệ
    const specSet = new Set(specialties.map((s) => s.specialty_id));
    const validIds = ids.filter((id) => specSet.has(id));

    return NextResponse.json({ specialty_ids: validIds });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}