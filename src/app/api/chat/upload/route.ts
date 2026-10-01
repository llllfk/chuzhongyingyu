import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";
import { uploadFileToCoze, isCozeConfigured } from "@/lib/coze-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 解除默认 1MB 限制，支持较大文件上传
export const maxDuration = 60;

// POST /api/chat/upload - 上传文件到扣子
export async function POST(request: NextRequest) {
  const auth = requireAuth(request.headers, ["student"]);
  if (isNextResponse(auth)) return auth;

  if (!isCozeConfigured()) {
    return NextResponse.json(
      { error: "系统配置中，请联系教师" },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 });
    }

    // 限制文件大小 20MB
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "文件大小不能超过 20MB" },
        { status: 400 },
      );
    }

    const result = await uploadFileToCoze(file, auth.username);

    return NextResponse.json({
      data: {
        file_id: result.id,
        file_name: result.name,
        file_size: result.size,
        url: result.url,
      },
      success: true,
    });
  } catch (err) {
    console.error("文件上传失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "文件上传失败" },
      { status: 500 },
    );
  }
}
