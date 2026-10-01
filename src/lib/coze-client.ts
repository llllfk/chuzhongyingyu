import 'server-only';
import { getSupabaseClient } from "@/storage/database/supabase-client";

const COZE_API_BASE = process.env.COZE_API_BASE_URL || "https://api.coze.cn";
const COZE_API_TOKEN = process.env.BOT_TOKEN || "";
const COZE_BOT_ID = process.env.BOT_ID || "";

export function isCozeConfigured(): boolean {
  return !!COZE_API_TOKEN && !!COZE_BOT_ID;
}

export function getBotId(): string {
  return COZE_BOT_ID;
}

// 创建扣子会话
export async function createConversation(studentId: number): Promise<string> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_API_TOKEN 未配置");
  }

  const response = await fetch(`${COZE_API_BASE}/v1/conversation/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COZE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`创建会话失败: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    data?: { id: string };
    conversation_id?: string;
  };

  const conversationId = data.data?.id || data.conversation_id;
  if (!conversationId) {
    throw new Error("创建会话返回数据异常");
  }

  // 写入数据库
  const client = getSupabaseClient();
  const { error } = await client
    .from("conversations")
    .insert({ student_id: studentId, conversation_id: conversationId });

  if (error) {
    throw new Error(`保存会话失败: ${error.message}`);
  }

  return conversationId;
}

// 获取学生的会话ID，没有则创建
export async function getOrCreateConversation(
  studentId: number,
): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("conversations")
    .select("conversation_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) {
    throw new Error(`查询会话失败: ${error.message}`);
  }

  if (data) {
    return data.conversation_id;
  }

  return createConversation(studentId);
}

// 获取会话历史消息
export async function getConversationHistory(
  conversationId: string,
): Promise<Array<{ role: string; content: string; created_at: number }>> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_API_TOKEN 未配置");
  }

  const response = await fetch(
    `${COZE_API_BASE}/v1/conversations/${conversationId}/messages`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${COZE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`获取历史消息失败: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    data?: Array<{
      role: string;
      content: string;
      type?: string;
      created_at?: number;
    }>;
  };

  // 只保留用户和助手的文字消息
  const messages = (data.data || [])
    .filter((m) => m.type === "answer" || m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      created_at: m.created_at || Date.now(),
    }));

  return messages;
}

// 流式对话 - 返回 ReadableStream
export async function streamChat(
  conversationId: string,
  userId: string,
  additionalMessages: Array<{
    role: string;
    content: string;
    content_type?: string;
  }>,
): Promise<ReadableStream<Uint8Array>> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_API_TOKEN 未配置");
  }
  if (!COZE_BOT_ID) {
    throw new Error("COZE_BOT_ID 未配置");
  }

  const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COZE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bot_id: COZE_BOT_ID,
      conversation_id: conversationId,
      user_id: userId,
      stream: true,
      auto_save_history: true,
      additional_messages: additionalMessages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`对话请求失败: ${response.status} ${text}`);
  }

  if (!response.body) {
    throw new Error("响应体为空");
  }

  return response.body;
}

// 上传文件到扣子
export async function uploadFileToCoze(
  file: File,
  userId: string,
): Promise<{ id: string; name: string; size: number; url?: string }> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_API_TOKEN 未配置");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("user_id", userId);

  const response = await fetch(`${COZE_API_BASE}/v1/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COZE_API_TOKEN}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`上传文件失败: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    data?: { id: string; name: string; size: number; url?: string };
  };

  if (!data.data) {
    throw new Error("上传文件返回数据异常");
  }

  return data.data;
}
