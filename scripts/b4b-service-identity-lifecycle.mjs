import { createB4bIdentity } from "./b4b-service-contract.mjs";
import { isValidatedB4bServiceSidContext } from "./windows-service-identity.mjs";

const phases = Object.freeze(["PRECHECK", "MATERIALIZE", "INSTALL_IDENTITY", "SID_READY", "CREDENTIAL_PROVISION", "ACL_READY", "PRESTART_READY", "START", "RUNNING", "STOPPED", "UNINSTALLED", "CREDENTIAL_CLEANED", "RESIDUALS_CLEAR"]);
const index = (phase) => phases.indexOf(phase);
const fail = (message) => { throw new Error(`B4B service identity lifecycle is invalid: ${message}`); };

export function createB4bServiceLifecycle(runId) { return { identity: createB4bIdentity(runId), phase: "PRECHECK", serviceInstalled: false, serviceRunning: false, serviceSidContext: null }; }
export function isB4bPrestartCredentialGatePassed(gate) {
  return gate?.passed === true && gate.serviceInstalled === true && gate.serviceRunning === false && gate.sidResolution === true && gate.sidType === "UNRESTRICTED" && gate.schema === true && gate.optionalProviderAbsent === true && gate.requiredSecretsPresent === true && gate.dpapiHelperIdentity === true && gate.dpapiProtect === true && gate.dpapiValidation === true && gate.isolatedPath === true && gate.aclApply === true && gate.aclReadback === true && gate.ownershipRecordPersisted === true && gate.ownershipRecordIdentity === true && gate.plaintextResidual === false && gate.secretLeak === false && gate.formalCredentialAccessed === false;
}
export function transitionB4bServiceLifecycle(state, phase, details = {}) {
  if (!state?.identity || !phases.includes(phase) || index(phase) !== index(state.phase) + 1) fail("phase order");
  if (phase === "INSTALL_IDENTITY" && (details.serviceInstalled !== true || details.serviceRunning === true || details.hostStarted === true)) fail("install identity state");
  if (phase === "SID_READY" && (!state.serviceInstalled || !isValidatedB4bServiceSidContext(details.serviceContext) || details.serviceContext.identity.serviceName !== state.identity.serviceName || details.serviceContext.identity.b4bRunId !== state.identity.b4bRunId)) fail("service SID binding");
  if (phase === "CREDENTIAL_PROVISION" && !state.serviceSidContext) fail("SID required before credentials");
  if (phase === "PRESTART_READY" && (!details.credentialGatePassed || state.serviceRunning)) fail("pre-start credential gate");
  if (phase === "PRESTART_READY" && !isB4bPrestartCredentialGatePassed(details.gate)) fail("pre-start credential gate evidence");
  if (phase === "START" && state.phase !== "PRESTART_READY") fail("start before credential gate");
  if (phase === "RUNNING" && details.serviceRunning !== true) fail("running state");
  if (phase === "STOPPED" && (state.phase !== "RUNNING" || details.serviceRunning !== false || details.hostProcessCount !== 0 || details.ownedChildProcessCount !== 0 || details.b4bPipeCount !== 0)) fail("controlled stop convergence");
  if (phase === "UNINSTALLED" && (state.phase !== "STOPPED" || details.serviceExists !== false)) fail("service uninstall convergence");
  if (phase === "CREDENTIAL_CLEANED" && (state.phase !== "UNINSTALLED" || details.protectedBundleResidual !== false || details.credentialDirectoryResidual !== false)) fail("credential cleanup convergence");
  if (phase === "RESIDUALS_CLEAR" && (state.phase !== "CREDENTIAL_CLEANED" || details.serviceExists !== false || details.hostProcessCount !== 0 || details.ownedChildProcessCount !== 0 || details.b4bPipeCount !== 0 || details.formalMutation !== false || details.formalCredentialAccessed !== false || details.forcedTermination !== false)) fail("final residual verification");
  const serviceUninstalled = ["UNINSTALLED", "CREDENTIAL_CLEANED", "RESIDUALS_CLEAR"].includes(phase);
  return { ...state, phase, serviceInstalled: serviceUninstalled ? false : state.serviceInstalled || phase === "INSTALL_IDENTITY", serviceRunning: phase === "RUNNING", serviceSidContext: phase === "SID_READY" ? details.serviceContext : state.serviceSidContext };
}

export async function cleanupB4bPrestartFailure({ lifecycle, hostStarted, removeOwnedCredential, uninstallService, inspectResiduals }) {
  if (!lifecycle?.serviceInstalled || lifecycle.serviceRunning || hostStarted !== false || lifecycle.phase === "RUNNING" || typeof removeOwnedCredential !== "function" || typeof uninstallService !== "function" || typeof inspectResiduals !== "function") fail("pre-start cleanup authority");
  await removeOwnedCredential();
  await uninstallService(lifecycle.identity.serviceName);
  const residuals = await inspectResiduals(lifecycle.identity.serviceName);
  if (residuals.serviceExists || residuals.hostProcessCount !== 0 || residuals.ownedChildProcessCount !== 0 || residuals.b4bPipeExists || residuals.formalMutation) fail("pre-start cleanup residuals");
  return { cleaned: true, hostNeverStarted: true, forcedTermination: false, serviceName: lifecycle.identity.serviceName };
}
export async function cleanupB4bPostStartPreHostBootstrapFailure({ lifecycle, failureEvidence, removeOwnedCredential, uninstallService, inspectResiduals }) {
  const identity = lifecycle?.identity;
  if (lifecycle?.phase !== "START" || !lifecycle.serviceInstalled || lifecycle.serviceRunning || identity?.kind !== "b4b" || typeof removeOwnedCredential !== "function" || typeof uninstallService !== "function" || typeof inspectResiduals !== "function") fail("post-start pre-bootstrap cleanup authority");
  if (failureEvidence?.classification !== "POST_START_REQUEST_PRE_HOST_BOOTSTRAP_FAILURE" || failureEvidence.serviceReachedRunning !== false || failureEvidence.hostBootstrapCompleted !== false || failureEvidence.runtimeControlEstablished !== false || failureEvidence.stopDiscoveryEstablished !== false) fail("post-start pre-bootstrap failure evidence");
  const before = await inspectResiduals(identity.serviceName);
  if (before.serviceExists !== true || before.serviceState !== "Stopped" || before.hostProcessCount !== 0 || before.ownedChildProcessCount !== 0 || before.runtimeControlPresent !== false || before.stopDiscoveryPresent !== false || before.b4bPipeCount !== 0 || before.portOwnerCount !== 0 || before.formalServiceName === identity.serviceName) fail("post-start pre-bootstrap cleanup preconditions");
  const credentialCleanup = await removeOwnedCredential();
  if (credentialCleanup?.protectedBundleResidual !== false || credentialCleanup?.plaintextResidual !== false || credentialCleanup?.credentialDirectoryResidual !== false) fail("post-start pre-bootstrap credential cleanup");
  await uninstallService(identity.serviceName);
  const after = await inspectResiduals(identity.serviceName);
  if (after.serviceExists !== false || after.hostProcessCount !== 0 || after.ownedChildProcessCount !== 0 || after.runtimeControlPresent !== false || after.stopDiscoveryPresent !== false || after.b4bPipeCount !== 0 || after.portOwnerCount !== 0 || after.formalServiceName === identity.serviceName || after.formalMutation !== false || after.protectedBundleResidual !== false || after.plaintextResidual !== false) fail("post-start pre-bootstrap cleanup residuals");
  return { cleaned: true, classification: failureEvidence.classification, serviceName: identity.serviceName, credentialCleanup, forcedTermination: false, hostBootstrapCompleted: false };
}
