import { spawn } from "node:child_process";
import { sha256 } from "./release-artifact-tree.mjs";
// The named mutex covers rechecking the journal head and appending a claim/completion.
export async function withReleaseJournalLock(journalPath, action) {
  if (process.platform !== "win32") throw new Error("Live release journal lock requires Windows");
  const name = "Global\\UED-Release-Journal-" + sha256(Buffer.from(journalPath.toLowerCase()));
  const script = `$ErrorActionPreference='Stop'; $m=[System.Threading.Mutex]::new($false,'${name}'); $locked=$false; try { $locked=$m.WaitOne(30000); if(-not $locked){throw 'journal lock timeout'}; [Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush(); $line=[Console]::ReadLine(); if($line -ne 'RELEASE'){throw 'journal lock owner lost'} } finally {if($locked){$m.ReleaseMutex()};$m.Dispose()}`;
  const child = spawn("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: "C:\\Windows\\System32" } });
  let released = false, output = "", errors = "";
  const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 && released ? resolve() : reject(new Error("Journal mutex process failed: " + errors))); });
  // Attach before awaiting so a process failure cannot become an unhandled rejection.
  closed.catch(() => {});
  child.stderr.on("data", (bytes) => { errors += bytes.toString(); });
  const ready = new Promise((resolve, reject) => { child.stdout.on("data", (bytes) => { output += bytes.toString(); if (output.includes("LOCKED\n") || output.includes("LOCKED\r\n")) resolve(); }); child.once("error", reject); child.once("close", () => reject(new Error("Journal mutex unavailable: " + errors))); });
  await ready;
  try { return await action(); }
  finally { released = true; child.stdin.end("RELEASE\n"); await closed; }
}
// The write path requests append access; the trusted administrator can still replace local logs.
// Node/libuv's generic append access also requests write-attributes/write-EA. Limit this handle
// by opening the existing journal with FILE_APPEND_DATA and FILE_FLAG_WRITE_THROUGH.
// FlushFileBuffers requires GENERIC_WRITE; this append handle deliberately does not request it.
export async function appendProtectedReleaseJournal(file, bytes) {
  if (process.platform !== "win32") throw new Error("Protected journal append requires Windows");
  const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class UedAppendJournal {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool WriteFile(SafeFileHandle handle,byte[] data,uint count,out uint written,IntPtr overlapped);
}
'@;
$p='${file.replaceAll("'", "''")}'; $memory=[IO.MemoryStream]::new(); [Console]::OpenStandardInput().CopyTo($memory); $data=$memory.ToArray(); if($data.Length -eq 0 -or $data.Length -gt 8192){throw 'journal entry size'};
$h=[UedAppendJournal]::CreateFile($p,0x100004,3,[IntPtr]::Zero,3,[uint32]2147483648,[IntPtr]::Zero); if($h.IsInvalid){throw 'append handle unavailable'}; try {$written=[uint32]0; if(-not [UedAppendJournal]::WriteFile($h,$data,$data.Length,[ref]$written,[IntPtr]::Zero) -or $written -ne $data.Length){throw 'journal append incomplete'}; [Console]::Out.Write('APPENDED')} finally {$h.Dispose();$memory.Dispose()}`;
  const child = spawn("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: "C:\\Windows\\System32" } });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += data.toString(); }); child.stderr.on("data", (data) => { stderr += data.toString(); });
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 && stdout === "APPENDED" ? resolve() : reject(new Error("Protected journal append failed: " + stderr))); });
  child.stdin.end(bytes); await done;
}
