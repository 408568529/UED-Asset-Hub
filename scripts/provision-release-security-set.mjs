import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseSecuritySet, protectReleaseSecuritySet, releaseSecuritySetMetadata, secureReleaseSecurityDirectory } from "./release-security-set.mjs";

function argumentsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values[key.slice(2)]) throw new Error("SECURITY_SET_ARGUMENTS_INVALID");
    values[key.slice(2)] = value;
  }
  for (const key of ["staging-root", "source-commit", "source-archive-sha256", "authorization-id"]) if (!values[key]) throw new Error(`SECURITY_SET_ARGUMENT_MISSING:${key}`);
  return values;
}

async function main() {
  const values = argumentsFrom(process.argv.slice(2));
  const stagingRoot = await realpath(path.resolve(values["staging-root"]));
  const authorityRoot = path.join(stagingRoot, "frozen", "release-security-sets");
  await mkdir(authorityRoot, { recursive: true });
  const resolvedAuthorityRoot = await realpath(authorityRoot);
  const authorityRootRelative = path.relative(stagingRoot, resolvedAuthorityRoot);
  if (!authorityRootRelative || authorityRootRelative.startsWith("..") || path.isAbsolute(authorityRootRelative)) throw new Error("SECURITY_SET_PATH_OUTSIDE_STAGING");
  const securitySet = createReleaseSecuritySet({ sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], authorizationId: values["authorization-id"] });
  const authorityDirectory = path.join(resolvedAuthorityRoot, securitySet.securitySetId);
  await mkdir(authorityDirectory, { recursive: false });
  const resolvedAuthorityDirectory = await realpath(authorityDirectory);
  const authorityDirectoryRelative = path.relative(resolvedAuthorityRoot, resolvedAuthorityDirectory);
  if (!authorityDirectoryRelative || authorityDirectoryRelative.startsWith("..") || path.isAbsolute(authorityDirectoryRelative)) throw new Error("SECURITY_SET_PATH_OUTSIDE_STAGING");
  await secureReleaseSecurityDirectory(resolvedAuthorityDirectory);
  const outputPath = path.join(resolvedAuthorityDirectory, "authority.dpapi");
  const protectedAuthority = await protectReleaseSecuritySet(securitySet, outputPath);
  const metadata = releaseSecuritySetMetadata(securitySet, { sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], authorizationId: values["authorization-id"] });
  process.stdout.write(`${JSON.stringify({ ...metadata, path: protectedAuthority.path, protectedAtRest: protectedAuthority.protectedAtRest, provider: protectedAuthority.provider })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "SECURITY_SET_PROVISIONING_FAILED"}\n`);
    process.exitCode = 1;
  });
}
