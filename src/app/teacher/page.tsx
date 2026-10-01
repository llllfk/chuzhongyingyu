"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Search,
  UserPlus,
  LogOut,
  Edit,
  Trash2,
  KeyRound,
  Loader2,
  Users,
  MessageCircle,
  MessageSquareOff,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "sonner";

interface Student {
  id: number;
  student_no: string;
  name: string;
  group_name: string | null;
  is_active: boolean;
  created_at: string;
  has_conversation: boolean;
}

export default function TeacherPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    student_no: "",
    name: "",
    group_name: "",
    password: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [resetPassword, setResetPassword] = useState("");

  const pageSize = 10;

  const fetchStudents = useCallback(async () => {
    const token = localStorage.getItem("edu_ai_token");
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/students?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStudents(data.data || []);
        setTotal(data.total || 0);
      }
    } catch {
      toast.error("获取学生列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "teacher")) {
      router.replace("/login");
      return;
    }
    if (user) {
      fetchStudents();
    }
  }, [user, authLoading, router, fetchStudents]);

  const handleAddStudent = async () => {
    const token = localStorage.getItem("edu_ai_token");
    if (!token) return;
    if (!formData.student_no || !formData.name || !formData.password) {
      toast.error("请填写必填项");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("学生添加成功");
        setAddDialogOpen(false);
        setFormData({ student_no: "", name: "", group_name: "", password: "" });
        fetchStudents();
      } else {
        toast.error(data.error || "添加失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditStudent = async () => {
    const token = localStorage.getItem("edu_ai_token");
    if (!token || !selectedStudent) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/students/${selectedStudent.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          group_name: formData.group_name || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("更新成功");
        setEditDialogOpen(false);
        fetchStudents();
      } else {
        toast.error(data.error || "更新失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setFormLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const token = localStorage.getItem("edu_ai_token");
    if (!token || !selectedStudent) return;
    if (!resetPassword || resetPassword.length < 6) {
      toast.error("新密码至少6位");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch(
        `/api/students/${selectedStudent.id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ new_password: resetPassword }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success("密码重置成功");
        setResetDialogOpen(false);
        setResetPassword("");
      } else {
        toast.error(data.error || "重置失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteStudent = async () => {
    const token = localStorage.getItem("edu_ai_token");
    if (!token || !selectedStudent) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/students/${selectedStudent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("已删除学生");
        setDeleteDialogOpen(false);
        fetchStudents();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setFormLoading(false);
    }
  };

  const openEditDialog = (student: Student) => {
    setSelectedStudent(student);
    setFormData({
      student_no: student.student_no,
      name: student.name,
      group_name: student.group_name || "",
      password: "",
    });
    setEditDialogOpen(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster />
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">教师管理后台</h1>
              <p className="text-xs text-slate-500">学生管理</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:inline">
              {user.username}
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl">学生列表</CardTitle>
                <CardDescription>
                  共 {total} 名学生
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="搜索学号/姓名"
                    className="pl-9"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 whitespace-nowrap">
                      <UserPlus className="w-4 h-4 mr-2" />
                      新增
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>新增学生</DialogTitle>
                      <DialogDescription>
                        填写学生信息，初始密码由教师设置
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>学号 *</Label>
                        <Input
                          value={formData.student_no}
                          onChange={(e) =>
                            setFormData({ ...formData, student_no: e.target.value })
                          }
                          placeholder="请输入学号"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>姓名 *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          placeholder="请输入姓名"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>分组</Label>
                        <Input
                          value={formData.group_name}
                          onChange={(e) =>
                            setFormData({ ...formData, group_name: e.target.value })
                          }
                          placeholder="选填，如 A班"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>初始密码 *</Label>
                        <Input
                          type="password"
                          value={formData.password}
                          onChange={(e) =>
                            setFormData({ ...formData, password: e.target.value })
                          }
                          placeholder="至少6位"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
                        取消
                      </Button>
                      <Button
                        onClick={handleAddStudent}
                        disabled={formLoading}
                        className="bg-gradient-to-r from-teal-500 to-blue-500"
                      >
                        {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        确认添加
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>学号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead className="hidden md:table-cell">分组</TableHead>
                    <TableHead>对话状态</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-500" />
                      </TableCell>
                    </TableRow>
                  ) : students.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                        暂无学生数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-mono text-sm">
                          {student.student_no}
                        </TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {student.group_name || "-"}
                        </TableCell>
                        <TableCell>
                          {student.has_conversation ? (
                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                              <MessageCircle className="w-3 h-3 mr-1" />
                              已开始
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400">
                              <MessageSquareOff className="w-3 h-3 mr-1" />
                              未开始
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {student.is_active ? (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-200">
                              正常
                            </Badge>
                          ) : (
                            <Badge variant="destructive">已禁用</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(student)}
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedStudent(student);
                                setResetDialogOpen(true);
                              }}
                              title="重置密码"
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            {student.is_active && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedStudent(student);
                                  setDeleteDialogOpen(true);
                                }}
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (page > 1) setPage(page - 1);
                        }}
                        className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-4 text-sm text-slate-600">
                        第 {page} / {totalPages} 页
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (page < totalPages) setPage(page + 1);
                        }}
                        className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑学生信息</DialogTitle>
            <DialogDescription>
              学号不可修改
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>学号</Label>
              <Input value={formData.student_no} disabled />
            </div>
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>分组</Label>
              <Input
                value={formData.group_name}
                onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                placeholder="选填"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleEditStudent}
              disabled={formLoading}
              className="bg-gradient-to-r from-teal-500 to-blue-500"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码对话框 */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置学生密码</DialogTitle>
            <DialogDescription>
              为 {selectedStudent?.name} 设置新的登录密码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>新密码</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="至少6位"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={formLoading}
              className="bg-gradient-to-r from-teal-500 to-blue-500"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除学生？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后 {selectedStudent?.name} 将无法登录，对话历史保留。
              <br />此操作可通过再次添加同学号学生恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              disabled={formLoading}
              className="bg-red-500 hover:bg-red-600"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
