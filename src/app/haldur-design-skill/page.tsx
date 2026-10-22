import { HaldurDesignSkillWorkbench } from "@/components/haldur/HaldurDesignSkillWorkbench";
import { hasAdminSession } from "@/lib/adminAuth";

export default async function HaldurDesignSkillPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  return <HaldurDesignSkillWorkbench initialFile={(await searchParams).file} canManage={await hasAdminSession()} />;
}
