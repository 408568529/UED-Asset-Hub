import { createGracefulCapability } from "./windows-graceful-pipe.mjs";

const endpoint = process.env.UED_GRACEFUL_ENDPOINT;
const token = process.env.UED_GRACEFUL_TOKEN;
const runtimeInstanceId = process.env.UED_RUNTIME_INSTANCE_ID;
const component = process.env.UED_MANAGED_COMPONENT;
const generation = Number(process.env.UED_MANAGED_GENERATION);
if (process.platform === "win32" && endpoint && token && runtimeInstanceId && component && Number.isInteger(generation)) {
  const capability = createGracefulCapability({ runtimeInstanceId, component, generation, endpoint, token, onShutdown: () => process.emit("SIGTERM") });
  await capability.start();
}
