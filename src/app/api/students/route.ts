import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth, isNextResponse } from "@/lib/middleware-auth";
import { hashPassword } from "@/lib/auth";

// GET /api/students?search=xxx&page=1&page_size=20
export async function GET(request: NextRequest) {
  const auth = requireAuth(request.headers, ["teacher"]);
  if (isNextResponse(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("page_size") || "20", 10);

    const client = getSupabaseClient();

    let query = client
      .from("students")
      .select(
        "id, student_no, name, group_name, is_active, created_at, conversations(conversation_id)",
      )
      .eq("is_active", true)
      .order("id", { ascending: false });

    if (search) {
      query = query.or(`student_no.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error } = await query;
    if (error) throw error;

    // 统计总数
    let countQuery = client
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    if (search) {
      countQuery = countQuery.or(
        `student_no.ilike.%${search}%,name.ilike.%${search}%`,
      );
    }
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    const students = (data as unknown[]).map((s) => {
      const item = s as {
        id: number;
        student_no: string;
        name: string;
        group_name: string | null;
        is_active: boolean;
        created_at: string;
        conversations: { conversation_id: string }[];
      };
      return {
        id: item.id,
        student_no: item.student_no,
        name: item.name,
        group_name: item.group_name,
        is_active: item.is_active,
        created_at: item.created_at,
        has_conversation:
          Array.isArray(item.conversations) && item.conversations.length > 0,
      };
    });

    return NextResponse.json({
      data: students,
      total: count || 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error("获取学生列表失败:", err);
    return NextResponse.json({ error: "获取学生列表失败" }, { status: 500 });
  }
}

// POST /api/students 新增学生
export async function POST(request: NextRequest) {
  const auth = requireAuth(request.headers, ["teacher"]);
  if (isNextResponse(auth)) return auth;

  try {
    const body = await request.json();
    const { student_no, name, group_name, password } = body;

    if (!student_no || !name || !password) {
      return NextResponse.json(
        { error: "学号、姓名和初始密码不能为空" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少6位" },
        { status: 400 },
      );
    }

    const client = getSupabaseClient();
    const passwordHash = await hashPassword(password);

    const { data, error } = await client
      .from("students")
      .insert({
        student_no,
        name,
        group_name: group_name || null,
        password_hash: passwordHash,
        is_active: true,
      })
      .select("id, student_no, name, group_name, is_active, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "该学号已存在" }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data, success: true });
  } catch (err) {
    console.error("新增学生失败:", err);
    return NextResponse.json({ error: "新增学生失败" }, { status: 500 });
  }
}
