import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";
import {
  getOrCreateConversation,
  getConversationHistory,
  isCozeConfigured,
} from "@/lib/coze-client";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/chat/history - 获取历史消息
export async function GET(request: NextRequest) {
  const auth = requireAuth(request.headers, ["student"]);
  if (isNextResponse(auth)) return auth;

  if (!isCozeConfigured()) {
    return NextResponse.json(
      { data: [], error: "系统配置中，请联系教师" },
      { status: 503 },
    );
  }

  try {
    const client = getSupabaseClient();
    const { data: convData, error: convError } = await client
      .from("conversations")
      .select("conversation_id")
      .eq("student_id", auth.id)
      .maybeSingle();

    if (convError) throw convError;

    if (!convData) {
      // 还没有历史会话
      return NextResponse.json({ data: [] });
    }

    const messages = await getConversationHistory(convData.conversation_id);
    return NextResponse.json({ data: messages });
  } catch (err) {
    console.error("获取历史消息失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取历史消息失败" },
      { status: 500 },
    );
  }
}
