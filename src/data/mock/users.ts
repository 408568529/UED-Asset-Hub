import type { User } from "@/types/user";

export const users: User[] = [
  {
    id: "u-lin",
    name: "林予",
    title: "UED 设计负责人",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
    role: "lead",
    bio: "关注设计资产化、AI 工作流和体验标准化。"
  },
  {
    id: "u-chen",
    name: "陈澈",
    title: "高级体验设计师",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    role: "designer"
  },
  {
    id: "u-qiao",
    name: "乔安",
    title: "设计系统设计师",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    role: "designer"
  }
];
