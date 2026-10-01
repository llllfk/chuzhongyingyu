import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { comparePassword, signToken, hashPassword } from "@/lib/auth";
import { seedDefaultTeacher } from "@/lib/seed";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 首次访问时确保默认教师账号存在
    await seedDefaultTeacher();

    // 先尝试在教师表查找
    const { data: teacher, error: teacherError } = await client
      .from("teachers")
      .select("id, username, password_hash, must_change_password")
      .eq("username", username)
      .maybeSingle();

    if (teacherError) {
      return NextResponse.json({ error: "服务器错误" }, { status: 500 });
    }

    if (teacher) {
      const valid = await comparePassword(password, teacher.password_hash);
      if (!valid) {
        return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
      }
      const token = signToken({
        role: "teacher",
        id: teacher.id,
        username: teacher.username,
      });
      return NextResponse.json({
          token,
          role: "teacher",
          must_change_password: teacher.must_change_password,
        });
    }

    // 再尝试在学生表查找
    const { data: student, error: studentError } = await client
      .from("students")
      .select("id, student_no, name, password_hash, is_active")
      .eq("student_no", username)
      .maybeSingle();

    if (studentError) {
      return NextResponse.json({ error: "服务器错误" }, { status: 500 });
    }

    if (!student) {
      return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
    }

    if (!student.is_active) {
      return NextResponse.json({ error: "账号已被禁用，请联系教师" }, { status: 403 });
    }

    const valid = await comparePassword(password, student.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
    }

    const token = signToken({
      role: "student",
      id: student.id,
      username: student.student_no,
      name: student.name,
    });

    return NextResponse.json({
      token,
      role: "student",
      name: student.name,
      student_no: student.student_no,
    });
  } catch (e: any) {
    console.error("login error:", e?.message || e);
    return NextResponse.json({ error: "登录失败" }, { status: 500 });
  }
}
