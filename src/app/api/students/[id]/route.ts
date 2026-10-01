import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";
import { hashPassword } from "@/lib/auth";

// PUT /api/students/[id] 编辑学生信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request.headers, ["teacher"]);
  if (isNextResponse(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, group_name, is_active } = body;

    const client = getSupabaseClient();
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (group_name !== undefined) updateData.group_name = group_name;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "无有效更新字段" }, { status: 400 });
    }

    const { data, error } = await client
      .from("students")
      .update(updateData)
      .eq("id", parseInt(id, 10))
      .select("id, student_no, name, group_name, is_active, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ data, success: true });
  } catch (err) {
    console.error("更新学生失败:", err);
    return NextResponse.json({ error: "更新学生失败" }, { status: 500 });
  }
}

// DELETE /api/students/[id] 软删除学生
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request.headers, ["teacher"]);
  if (isNextResponse(auth)) return auth;

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from("students")
      .update({ is_active: false })
      .eq("id", parseInt(id, 10));

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("删除学生失败:", err);
    return NextResponse.json({ error: "删除学生失败" }, { status: 500 });
  }
}
