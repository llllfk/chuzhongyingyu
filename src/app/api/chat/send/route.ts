import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";
import {
  getOrCreateConversation,
  streamChat,
  isCozeConfigured,
} from "@/lib/coze-client";

// POST /api/chat/send - 发送消息，流式返回
export async function POST(request: NextRequest) {
  const auth = requireAuth(request.headers, ["student"]);
  if (isNextResponse(auth)) return auth;

  // 检查配置
  if (!isCozeConfigured()) {
    return NextResponse.json(
      { error: "系统配置中，请联系教师" },
      { status: 503 },
    );
  }

  try {
    const { content, attachments } = (await request.json()) as {
      content?: string;
      attachments?: Array<{ file_id: string; file_name: string }>;
    };

    if (!content && (!attachments || attachments.length === 0)) {
      return NextResponse.json(
        { error: "消息内容不能为空" },
        { status: 400 },
      );
    }

    const conversationId = await getOrCreateConversation(auth.id);

    // 构造消息
    const additionalMessages: Array<Record<string, unknown>> = [];

    if (attachments && attachments.length > 0) {
      // 有附件时使用 object_string 数组格式
      const contentArray: Array<{ type: string; [key: string]: unknown }> = [];

      attachments.forEach((att) => {
        contentArray.push({
          type: "file",
          file_id: att.file_id,
          file_name: att.file_name,
        });
      });

      if (content && content.trim()) {
        contentArray.push({
          type: "text",
          text: content,
        });
      }

      additionalMessages.push({
        role: "user",
        content: JSON.stringify(contentArray),
        content_type: "object_string",
      });
    } else {
      additionalMessages.push({
        role: "user",
        content: content,
        content_type: "text",
      });
    }

    // 一个学生固定一个 user_id（学号），配合固定 conversation_id 保证会话连续
    const stream = await streamChat(
      conversationId,
      auth.username,
      additionalMessages as Array<{
        role: string;
        content: string;
        content_type?: string;
      }>,
    );

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("聊天请求失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "聊天请求失败" },
      { status: 500 },
    );
  }
}
