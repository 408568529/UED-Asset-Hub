export const productionWindowsServiceName = "UEDAssetHub";
export const b4bWindowsServicePrefix = "UEDAssetHub-B4B-";
const validatedB4bSidContexts = new WeakSet();

function fail(message) { throw new Error(`Windows service identity is invalid: ${message}`); }

export function validateWindowsServiceName(value) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value)) fail("service name format");
  return value;
}

export function validateB4bRunSuffix(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{6,46}[A-Za-z0-9])?$/.test(value)) fail("B4B run suffix format");
  return value;
}

export function b4bWindowsServiceName(runSuffix) {
  const suffix = validateB4bRunSuffix(runSuffix);
  return validateWindowsServiceName(`${b4bWindowsServicePrefix}${suffix}`);
}

export function resolveWindowsServiceIdentity({ environment = process.env } = {}) {
  const configuredName = environment.UED_WINDOWS_SERVICE_NAME?.trim() || "";
  const b4bRunId = environment.UED_B4B_RUN_ID?.trim() || "";
  if (!configuredName && !b4bRunId) return { kind: "production", serviceName: productionWindowsServiceName, b4bRunId: null };
  if (!b4bRunId) {
    if (configuredName !== productionWindowsServiceName) fail("non-production service requires a B4B run suffix");
    return { kind: "production", serviceName: productionWindowsServiceName, b4bRunId: null };
  }
  const expected = b4bWindowsServiceName(b4bRunId);
  if (configuredName !== expected) fail("B4B service name does not match its run suffix");
  return { kind: "b4b", serviceName: expected, b4bRunId: validateB4bRunSuffix(b4bRunId) };
}

export async function resolveInstalledB4bServiceSid({ lifecycle, platform = process.platform } = {}) {
  if (platform !== "win32" || lifecycle?.phase !== "INSTALL_IDENTITY" || lifecycle.serviceInstalled !== true || lifecycle.serviceRunning !== false || lifecycle.identity?.kind !== "b4b") fail("SID resolution requires an installed, stopped B4B service");
  const identity = createExpectedB4bIdentity(lifecycle.identity.b4bRunId);
  if (identity.serviceName !== lifecycle.identity.serviceName) fail("SID resolution identity authority");
  const result = await lookupWindowsServiceSid(identity.serviceName);
  const expectedAccount = `NT SERVICE\\${identity.serviceName}`;
  if (result?.serviceName !== identity.serviceName || result?.accountName !== expectedAccount || result?.roundTripAccountName !== expectedAccount || result?.state !== "Stopped" || result?.startMode !== "Manual" || result?.sidType !== "UNRESTRICTED" || !/^S-1-5-80(?:-\d+){1,}$/u.test(result.serviceSid || "")) fail("Windows Service SID readback");
  const context = Object.freeze({ identity, serviceSid: result.serviceSid, accountName: expectedAccount, serviceState: result.state, startMode: result.startMode, sidType: result.sidType });
  validatedB4bSidContexts.add(context);
  return context;
}

export function isValidatedB4bServiceSidContext(value) { return !!value && validatedB4bSidContexts.has(value); }

function createExpectedB4bIdentity(runId) { return resolveWindowsServiceIdentity({ environment: { UED_WINDOWS_SERVICE_NAME: b4bWindowsServiceName(runId), UED_B4B_RUN_ID: runId } }); }

async function lookupWindowsServiceSid(serviceName) {
  const script = `$name = '${serviceName}'
$service = Get-CimInstance Win32_Service -Filter "Name='$name'"
if ($null -eq $service -or $service.State -ne 'Stopped' -or $service.StartMode -ne 'Manual') { throw 'B4B service state is invalid.' }
$accountName = "NT SERVICE\\$name"
$sid = ([Security.Principal.NTAccount]::new($accountName)).Translate([Security.Principal.SecurityIdentifier]).Value
$roundTripAccountName = ([Security.Principal.SecurityIdentifier]::new($sid)).Translate([Security.Principal.NTAccount]).Value
$sidTypeText = (& sc.exe qsidtype $name 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $sidTypeText -notmatch 'UNRESTRICTED') { throw 'B4B Service SID type is not unrestricted.' }
[pscustomobject]@{ serviceName=$service.Name; serviceSid=$sid; accountName=$accountName; roundTripAccountName=$roundTripAccountName; state=$service.State; startMode=$service.StartMode; sidType='UNRESTRICTED' } | ConvertTo-Json -Compress`;
  const child = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const process = child.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true, shell: false });
    let stdout = "";
    process.stdout.setEncoding("utf8"); process.stdout.on("data", (part) => { stdout += part; });
    process.once("error", () => reject(new Error("Windows Service SID lookup is unavailable.")));
    process.once("exit", (code) => { if (code !== 0) return reject(new Error("Windows Service SID lookup failed.")); try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Windows Service SID lookup returned invalid evidence.")); } });
  });
}
