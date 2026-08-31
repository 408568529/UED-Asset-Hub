# UED Windows Pipe Security Adapter

Windows-only primitive used by the D2-A service stop-discovery path. It creates exactly one Named Pipe instance with an explicit DACL and `PIPE_REJECT_REMOTE_CLIENTS`, verifies the connected shutdown client's process identity, and relays one bounded protocol request/response through stdio.

It intentionally has no Job Object, lifecycle, restart, shell, network, generic filesystem, DATA, or DSH responsibility. Build on Windows x64 with `npm run build:windows-pipe-security-adapter`; never commit the generated `.exe` or manifest.
