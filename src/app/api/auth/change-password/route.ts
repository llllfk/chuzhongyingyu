import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { comparePassword, hashPassword } from "@/lib/auth";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";

export async function POST(request: NextRequest) {
  const authResult = requireAuth(request.headers);
  if (isNextResponse(authResult)) return authResult;

  try {
    const { old_password, new_password } = await request.json();

    if (!old_password || !new_password) {
      return NextResponse.json({ error: "请输入旧密码和新密码" }, { status: 400 });
    }

    if (new_password.length < 6) {
      return NextResponse.json({ error: "新密码长度至少6位" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const userId = authResult.id;

    if (authResult.role === "teacher") {
      const { data: teacher, error } = await client
        .from("teachers")
        .select("password_hash")
        .eq("id", userId)
        .single();

      if (error || !teacher) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      const valid = await comparePassword(old_password, teacher.password_hash);
      if (!valid) {
        return NextResponse.json({ error: "旧密码错误" }, { status: 400 });
      }

      const newHash = await hashPassword(new_password);
      const { error: updateError } = await client
        .from("teachers")
        .update({ password_hash: newHash, must_change_password: false })
        .eq("id", userId);

      if (updateError) {
        return NextResponse.json({ error: "修改密码失败" }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else {
      const { data: student, error } = await client
        .from("students")
        .select("password_hash")
        .eq("id", userId)
        .single();

      if (error || !student) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      const valid = await comparePassword(old_password, student.password_hash);
      if (!valid) {
        return NextResponse.json({ error: "旧密码错误" }, { status: 400 });
      }

      const newHash = await hashPassword(new_password);
      const { error: updateError } = await client
        .from("students")
        .update({ password_hash: newHash })
        .eq("id", userId);

      if (updateError) {
        return NextResponse.json({ error: "修改密码失败" }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }
  } catch {
    return NextResponse.json({ error: "修改密码失败" }, { status: 500 });
  }
}
