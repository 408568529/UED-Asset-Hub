import { MICRO_STANDARD_ROOT, DATA_DIR, TRAINING_MEDIA_DIR, ASSET_HUB_RUNTIME_DIR } from "@/config/storage";
import { MicroStandardStore } from "./microStandardStore";
export function microStore() {
  if (!MICRO_STANDARD_ROOT) throw Error("微规范尚未完成独立目录配置，请由管理员执行显式迁移。");
  return new MicroStandardStore(MICRO_STANDARD_ROOT, [DATA_DIR, TRAINING_MEDIA_DIR, ASSET_HUB_RUNTIME_DIR, process.env.HALDUR_DESIGN_SKILL_ROOT || "", process.env.AGENT_RUNTIME_DIR || "", process.cwd()]);
}
export const independentMicroStandards = Boolean(MICRO_STANDARD_ROOT);
