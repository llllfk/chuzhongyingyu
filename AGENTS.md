# AGENTS.md

# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **数据库**: PostgreSQL (Supabase)
- **认证**: JWT + bcryptjs

## 目录结构

```
├── public/                          # 静态资源
├── scripts/                         # 构建与启动脚本
├── src/
│   ├── app/                         # 页面路由与 API
│   │   ├── api/                     # API Routes
│   │   │   ├── auth/login/          # 登录接口
│   │   │   ├── auth/change-password/# 修改密码
│   │   │   ├── students/            # 学生管理 CRUD
│   │   │   ├── chat/send/           # 流式对话（SSE）
│   │   │   ├── chat/history/        # 历史消息
│   │   │   └── chat/upload/         # 文件上传
│   │   ├── login/                   # 登录页
│   │   ├── change-password/         # 修改密码页
│   │   ├── teacher/                 # 教师后台
│   │   ├── chat/                    # 学生聊天页
│   │   ├── layout.tsx               # 根布局（含 AuthProvider）
│   │   └── page.tsx                 # 首页（重定向）
│   ├── components/
│   │   ├── ui/                      # shadcn/ui 组件
│   │   └── auth-provider.tsx        # 认证 Context
│   ├── hooks/                       # 自定义 Hooks
│   ├── lib/
│   │   ├── auth.ts                  # JWT + bcrypt 工具
│   │   ├── middleware-auth.ts       # API 鉴权中间件函数
│   │   ├── coze-client.ts           # 扣子 API 代理
│   │   ├── seed.ts                  # 默认教师账号 seed
│   │   └── utils.ts                 # 通用工具函数
│   ├── storage/database/
│   │   ├── supabase-client.ts       # Supabase 客户端
│   │   └── shared/schema.ts         # Drizzle schema
│   ├── instrumentation.ts           # Next.js 启动钩子（seed）
│   └── server.ts                    # 自定义服务端入口
├── next.config.ts                   # Next.js 配置
├── package.json                     # 项目依赖
├── tsconfig.json                    # TypeScript 配置
├── DESIGN.md                        # 设计规范
└── AGENTS.md                        # 本文件
```

## 包管理规范

**仅允许使用 pnpm**，**严禁使用 npm 或 yarn**。

## 核心功能点

### 认证系统
- 统一登录页，账号+密码
- 服务端识别角色（教师/学生），返回 JWT
- 教师默认账号 admin / Admin@2026，首次登录强制改密
- bcrypt 密码哈希，JWT 有效期 7 天
- API 鉴权：Authorization: Bearer {token}
- 教师专属接口校验 role=teacher

### 数据库表
- **teachers**: 教师表（id, username, password_hash, must_change_password）
- **students**: 学生表（id, student_no, name, group_name, password_hash, is_active 软删）
- **conversations**: 会话绑定表（student_id 唯一外键, conversation_id 扣子会话ID）

### 教师后台
- 学生列表（按学号/姓名搜索、分页）
- 新增、编辑、删除（软删）学生
- 重置学生密码
- 显示每个学生会话状态（是否已开始对话）

### 学生聊天
- 聊天气泡 UI，Markdown 渲染
- SSE 流式输出 + 打字中动画
- 附件上传（图片/文档/视频），实时进度
- 历史消息持久化（从扣子会话拉取）
- 合规角标不可省略
- 顶部显示学生姓名 + 退出按钮

### 扣子 API 代理
- 凭证从环境变量读取：COZE_API_TOKEN, COZE_BOT_ID
- 学生首次对话创建会话，绑定 student_id 终身复用
- v3/chat 流式透传 SSE
- v1/files 代理上传，消息用 object_string 格式发送
- v1/conversations/{id}/messages 拉取历史
- 配置缺失时中文友好提示

## 开发规范

### 编码规范
- TypeScript strict 模式
- 禁止隐式 any、禁止 as any
- 数据库字段名 snake_case
- 所有 Supabase 调用检查 error 并 throw

### 安全
- 扣子凭证只存在服务端，严禁前端访问
- 密码 bcrypt 哈希存储
- 接口按角色鉴权
- 软删学生 is_active=false 后无法登录

## 构建与启动

- 开发：`pnpm run dev`（端口由 DEPLOY_RUN_PORT 决定）
- 构建：`pnpm run build`
- 生产启动：`pnpm run start`
- 数据库同步：`coze-coding-ai db upgrade`
