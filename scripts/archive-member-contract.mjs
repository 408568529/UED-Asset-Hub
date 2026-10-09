import path from "node:path";

export function validateArchiveMemberPath(member) {
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  if (!member || path.win32.isAbsolute(member) || path.posix.isAbsolute(member) || member.includes("\\")) throw new Error("source archive tree is unsafe.");
  for (const part of member.split("/")) {
    if (!part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/u.test(part) || /[. ]$/u.test(part) || reserved.test(part)) throw new Error("source archive tree is unsafe.");
  }
  return member;
}
