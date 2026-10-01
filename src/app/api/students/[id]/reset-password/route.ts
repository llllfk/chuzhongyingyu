import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";
import { hashPassword } from "@/lib/auth";

// POST /api/students/[id]/reset-password 重置学生密码
// 支持 body 传 { new_password } 或不传（自动生成随机密码）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request.headers, ["teacher"]);
  if (isNextResponse(auth)) return auth;

  try {
    const { id } = await params;

    let newPassword: string;
    try {
      const body = await request.json();
      if (body.new_password) {
        newPassword = body.new_password;
      } else {
        // 自动生成 8 位随机密码
        newPassword = Math.random().toString(36).slice(2, 10);
      }
    } catch {
      // 没有 body 时自动生成
      newPassword = Math.random().toString(36).slice(2, 10);
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "新密码长度至少6位" },
        { status: 400 },
      );
    }

    const client = getSupabaseClient();
    const passwordHash = await hashPassword(newPassword);

    const { error } = await client
      .from("students")
      .update({ password_hash: passwordHash })
      .eq("id", parseInt(id, 10));

    if (error) throw error;

    return NextResponse.json({ success: true, new_password: newPassword });
  } catch (err) {
    console.error("重置密码失败:", err);
    return NextResponse.json({ error: "重置密码失败" }, { status: 500 });
  }
}
