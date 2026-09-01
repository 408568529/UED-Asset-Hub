# UED Windows Job Helper

This helper is a Windows x64-only kernel primitive. It owns one component Job
and exposes only `query`, `terminate`, and `shutdown-helper` over inherited
standard input. It never accepts a PID, shell command, network request, or file
operation. Build it on Windows with `npm run build:windows-job-helper`.

Child launch uses structured executable and argv inputs only. The helper passes
the executable explicitly as `lpApplicationName` and serializes every UTF-16
argv element with Windows CRT-compatible quoting into a mutable
`lpCommandLine`. Empty values, whitespace, backslashes, literal quotes, and
Unicode remain argv data; the helper never invokes `cmd.exe`, PowerShell, or a
shell.

The generated binary and manifest are deployment artifacts and are intentionally
not committed. A production Host Runner verifies their absolute path, version,
architecture, and SHA-256 before using them.
