import { HaldurDesignSkillWorkbench } from "@/components/haldur/HaldurDesignSkillWorkbench";
import { hasAdminSession } from "@/lib/adminAuth";

export default async function HaldurDesignSkillPage() {
  return <HaldurDesignSkillWorkbench canManage={await hasAdminSession()} />;
}
