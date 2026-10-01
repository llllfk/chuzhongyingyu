"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  LogOut,
  User,
  Bot,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Film,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Toaster, toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ file_id: string; file_name: string; file_size: number }>;
  isStreaming?: boolean;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  file_id?: string;
  error?: string;
}

export default function ChatPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [configError, setConfigError] = useState("");
  const [introMessage, setIntroMessage] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 鉴权 & 加载历史消息
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "student") {
      router.replace("/login");
      return;
    }
    loadHistory();
  }, [user, authLoading, router]);

  const loadHistory = async () => {
    const token = localStorage.getItem("edu_ai_token");
    if (!token) return;
    try {
      const res = await fetch("/api/chat/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.status === 503) {
        setConfigError(data.error || "系统配置中，请联系教师");
        return;
      }
      if (res.ok && data.data && data.data.length > 0) {
        const history: ChatMessage[] = data.data.map((m: { role: string; content: string }, i: number) => ({
          id: `hist-${i}`,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        }));
        setMessages(history);
      } else if (res.ok || res.status === 503) {
        // 无历史消息时加载开场白
        loadIntro(token);
      }
    } catch (err) {
      console.error("加载历史消息失败:", err);
    }
  };

  const loadIntro = async (token: string) => {
    try {
      const res = await fetch("/api/chat/intro", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.intro_message) {
        setIntroMessage(data.intro_message);
      }
      if (data.suggested_questions && data.suggested_questions.length > 0) {
        setSuggestedQuestions(data.suggested_questions);
      }
    } catch (err) {
      console.error("加载开场白失败:", err);
    }
  };

  // SSE 解析
  const parseSSE = useCallback((line: string): { event?: string; data?: string } | null => {
    if (line.startsWith("event:")) {
      return { event: line.slice(6).trim() };
    }
    if (line.startsWith("data:")) {
      return { data: line.slice(5).trim() };
    }
    return null;
  }, []);

  const handleSend = async () => {
    if (isLoading) return;
    const text = input.trim();
    const hasFiles = uploadingFiles.some((f) => f.file_id);

    if (!text && !hasFiles) return;

    const token = localStorage.getItem("edu_ai_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    // 构造用户消息
    const userAttachments = uploadingFiles
      .filter((f) => f.file_id)
      .map((f) => ({
        file_id: f.file_id!,
        file_name: f.file.name,
        file_size: f.file.size,
      }));

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      attachments: userAttachments.length > 0 ? userAttachments : undefined,
    };

    const assistantMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setUploadingFiles([]);
    setIsLoading(true);
    setIntroMessage("");
    setSuggestedQuestions([]);

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: text,
          attachments: userAttachments,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "请求失败");
      }

      if (!response.body) {
        throw new Error("响应为空");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      // 记录已开始的消息id与本地气泡的映射，防止多条中间消息相互覆盖
      const messageIdMap = new Map<string, string>();
      // 最终的answer消息id，用于conversation.chat.completed时确认哪条是最终回复
      let finalAnswerId = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const parsed = parseSSE(line);
          if (!parsed) continue;

          if (parsed.event) {
            currentEvent = parsed.event;
            continue;
          }

          if (parsed.data !== undefined) {
            if (parsed.data === "[DONE]") {
              continue;
            }

            try {
              const json = JSON.parse(parsed.data);
              // 扣子 v3/chat SSE 格式
              if (currentEvent === "conversation.message.delta") {
                const msgId = json.id || json.message_id || "";
                const content = json.content || json.delta?.content || "";
                if (!content) continue;

                // 只处理 answer 类型的消息增量（用户消息、工具消息等忽略）
                const msgType = json.type || "answer";
                if (msgType !== "answer") continue;

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + content }
                      : m,
                  ),
                );
              } else if (currentEvent === "conversation.message.completed") {
                const msgType = json.type || "answer";
                // 只保留最终的 answer 消息作为完整内容；中间工具调用等消息不覆盖流式累加结果
                if (msgType === "answer") {
                  finalAnswerId = json.id || json.message_id || "";
                  // 注意：不使用 json.content 整体替换，保留流式累加的内容
                  // 仅用于标记消息完整性（流式累加已包含完整内容）
                }
              } else if (currentEvent === "conversation.chat.completed") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, isStreaming: false } : m,
                  ),
                );
              } else if (currentEvent === "conversation.error") {
                const errMsg = json.msg || json.error?.msg || "对话出错了";
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: `⚠️ ${errMsg}`, isStreaming: false }
                      : m,
                  ),
                );
              }
            } catch {
              // 非 JSON 数据，忽略
            }
          }
        }
      }

      // 流结束后确保标记为非 streaming
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, isStreaming: false } : m,
        ),
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `❌ ${errorMsg}`, isStreaming: false }
            : m,
        ),
      );
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const token = localStorage.getItem("edu_ai_token") || "";

    Array.from(files).forEach((file) => {
      const tempId = `up-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const uploading: UploadingFile = {
        id: tempId,
        file,
        progress: 0,
      };

      setUploadingFiles((prev) => [...prev, uploading]);

      // 上传文件
      uploadFile(file, token, tempId);
    });

    e.target.value = "";
  };

  const uploadFile = async (file: File, token: string, tempId: string) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/chat/upload");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === tempId ? { ...f, progress } : f)),
          );
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status === 200 && data.success) {
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.id === tempId
                  ? { ...f, progress: 100, file_id: data.data.file_id }
                  : f,
              ),
            );
          } else {
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.id === tempId
                  ? { ...f, error: data.error || "上传失败" }
                  : f,
              ),
            );
            toast.error(`${file.name}: ${data.error || "上传失败"}`);
          }
        } catch {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === tempId ? { ...f, error: "上传失败" } : f,
            ),
          );
        }
      };

      xhr.onerror = () => {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === tempId ? { ...f, error: "网络错误" } : f,
          ),
        );
      };

      xhr.send(formData);
    } catch {
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === tempId ? { ...f, error: "上传失败" } : f)),
      );
    }
  };

  const removeUploadingFile = (id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (type.startsWith("video/")) return <Film className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Toaster />

      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-800">
                AI 学习助手
              </h1>
              <p className="text-xs text-slate-500">{user.name || user.username}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            退出
          </Button>
        </div>
      </header>

      {/* 合规角标 */}
      <div className="bg-slate-50 border-b border-slate-100 text-center py-1.5 flex-shrink-0">
        <p className="text-xs text-slate-400">内容由AI生成，仅供参考</p>
      </div>

      {/* 配置错误提示 */}
      {configError && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">系统暂不可用</p>
              <p className="text-sm text-amber-600">{configError}</p>
            </div>
          </div>
        </div>
      )}

      {/* 聊天内容区 */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-100 to-blue-100 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-teal-500" />
              </div>
              {introMessage ? (
                <div className="max-w-md mx-auto">
                  <h2 className="text-lg font-medium text-slate-700 mb-3">
                    AI 学习助手
                  </h2>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-600 leading-relaxed text-left shadow-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {introMessage}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-medium text-slate-700 mb-2">
                    欢迎使用 AI 学习助手
                  </h2>
                  <p className="text-sm text-slate-400 max-w-xs mx-auto">
                    有任何学习问题都可以问我，我会尽力帮助你
                  </p>
                </>
              )}
              {suggestedQuestions.length > 0 && (
                <div className="mt-6 space-y-2 max-w-md mx-auto">
                  <p className="text-xs text-slate-400 mb-3">你可以问：</p>
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(q);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:border-teal-300 hover:bg-teal-50/50 transition-colors"
                    >
                      <span className="text-teal-500 mr-2">💬</span>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-2.5 max-w-[85%] sm:max-w-[75%] ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* 头像 */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-teal-400 to-blue-500"
                      : "bg-slate-200"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-slate-600" />
                  )}
                </div>

                {/* 消息气泡 */}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-teal-500 to-blue-500 text-white rounded-tr-sm"
                      : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {/* 附件列表 */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.file_id}
                          className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                            msg.role === "user"
                              ? "bg-white/20"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{att.file_name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 文字内容 */}
                  {msg.content && (
                    <div
                      className={`prose prose-sm max-w-none ${
                        msg.role === "user" ? "prose-invert" : "prose-slate"
                      }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* 打字中指示器 */}
                  {msg.isStreaming && !msg.content && (
                    <div className="flex items-center gap-1 py-1">
                      <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s] opacity-60" />
                      <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s] opacity-60" />
                      <span className="w-2 h-2 bg-current rounded-full animate-bounce opacity-60" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* 上传中文件列表 */}
      {uploadingFiles.length > 0 && (
        <div className="bg-white border-t border-slate-100 px-4 py-2 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
            {uploadingFiles.map((f) => (
              <div
                key={f.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                  f.error
                    ? "bg-red-50 border-red-200 text-red-600"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                {getFileIcon(f.file.type)}
                <span className="max-w-32 truncate">{f.file.name}</span>
                {!f.error && (
                  <span className="text-slate-400">
                    {f.progress}%
                  </span>
                )}
                {f.error && <span className="text-red-500">失败</span>}
                <button
                  onClick={() => removeUploadingFile(f.id)}
                  className="ml-1 hover:bg-black/5 rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className="bg-white border-t border-slate-200 p-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-teal-300 focus-within:ring-2 focus-within:ring-teal-100 transition-all">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-500 hover:text-teal-600 hover:bg-teal-50 flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="上传附件"
            >
              <Paperclip className="w-5 h-5" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 py-2 text-sm resize-none"
              disabled={isLoading || !!configError}
            />
            <Button
              type="button"
              size="icon"
              className="rounded-xl bg-gradient-to-br from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 flex-shrink-0 text-white shadow-md"
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && uploadingFiles.every((f) => !f.file_id)) || !!configError}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            支持图片、文档、视频等附件
          </p>
        </div>
      </div>
    </div>
  );
}
