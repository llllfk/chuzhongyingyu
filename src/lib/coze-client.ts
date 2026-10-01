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
// 调用扣子 API 创建一个新会话
async function createCozeConversation(): Promise<string> {
  if (!COZE_API_TOKEN) {
    throw new Error("BOT_TOKEN 未配置");
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

  return conversationId;
}

// 内存缓存：同一进程内避免重复查询数据库，作为会话唯一性的二级保证
const conversationCache = new Map<number, string>();

// 获取学生的会话ID，没有则创建（保证一个学生只有一个会话，并发安全）
export async function getOrCreateConversation(
  studentId: number | string,
): Promise<string> {
  const sid = Number(studentId);
  if (isNaN(sid)) throw new Error(`无效的学生ID: ${studentId}`);

  // 先查内存缓存
  const cached = conversationCache.get(sid);
  if (cached) return cached;

  const client = getSupabaseClient();

  // 第一步：先查询数据库是否已存在会话
  const { data, error } = await client
    .from("conversations")
    .select("conversation_id")
    .eq("student_id", sid)
    .limit(1);

  if (error) {
    throw new Error(`查询会话失败: ${error.message}`);
  }

  if (data && data.length > 0 && data[0].conversation_id) {
    conversationCache.set(sid, data[0].conversation_id);
    return data[0].conversation_id;
  }

  // 没有则创建扣子会话
  const conversationId = await createCozeConversation();

  // upsert 写入（冲突时不覆盖，保证一个学生只有一个会话）
  const { error: upsertError } = await client
    .from("conversations")
    .upsert(
      { student_id: sid, conversation_id: conversationId },
      { onConflict: "student_id", ignoreDuplicates: true },
    );

  if (upsertError) {
    // upsert 失败则回退查询
    const { data: existing } = await client
      .from("conversations")
      .select("conversation_id")
      .eq("student_id", sid)
      .limit(1);
    if (existing && existing.length > 0 && existing[0].conversation_id) {
      conversationCache.set(sid, existing[0].conversation_id);
      return existing[0].conversation_id;
    }
    throw new Error(`保存会话失败: ${upsertError.message}`);
  }

  // 再查一次确认最终值（ignoreDuplicates 时 upsert 不返回数据）
  const { data: result } = await client
    .from("conversations")
    .select("conversation_id")
    .eq("student_id", sid)
    .limit(1);

  const finalId =
    result && result.length > 0 && result[0].conversation_id
      ? result[0].conversation_id
      : conversationId;

  conversationCache.set(sid, finalId);
  return finalId;
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

  // 只保留用户和助手的文字消息，按 created_at 正序排列（与聊天展示顺序一致）
  // 过滤掉工具调用等中间消息，仅保留 answer 类型的助手消息和 user 消息
  const messages = (data.data || [])
    .filter((m) => {
      if (m.role === "user") return true;
      // 助手消息只保留 type=answer 的最终回复，排除 follow_up、tool_call 等中间消息
      if (m.role === "assistant" || m.type === "answer") return true;
      return false;
    })
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      created_at: m.created_at || Date.now(),
    }))
    .sort((a, b) => a.created_at - b.created_at);

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

// 获取 Bot 开场白信息（开场白文字 + 建议问题）
export async function getBotIntro(): Promise<{
  intro_message: string;
  suggested_questions: string[];
}> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_API_TOKEN 未配置");
  }
  if (!COZE_BOT_ID) {
    return { intro_message: "", suggested_questions: [] };
  }

  const response = await fetch(`${COZE_API_BASE}/v1/bots/${COZE_BOT_ID}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${COZE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`获取 Bot 信息失败: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    bot?: {
      description?: string;
      prompt?: string;
      onboarding_info?: {
        prologue?: string;
        suggested_questions?: string[];
      };
    };
    data?: {
      description?: string;
      prompt?: string;
      onboarding_info?: {
        prologue?: string;
        suggested_questions?: string[];
      };
      prologue?: string;
      suggestion_questions?: string[];
    };
  };

  const botData = (data.bot || data.data || {}) as {
    description?: string;
    prompt?: string;
    onboarding_info?: {
      prologue?: string;
      suggested_questions?: string[];
    };
    prologue?: string;
    suggestion_questions?: string[];
  };
  if (!botData) {
    return { intro_message: "", suggested_questions: [] };
  }

  // 开场白兼容多种字段名
  const intro_message =
    botData.onboarding_info?.prologue ||
    botData.prologue ||
    botData.description ||
    "";

  // 建议问题兼容多种字段名
  const suggested_questions =
    botData.onboarding_info?.suggested_questions ||
    botData.suggestion_questions ||
    [];

  return { intro_message, suggested_questions };
}
