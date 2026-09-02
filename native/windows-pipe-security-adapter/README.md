# UED Windows Pipe Security Adapter

Windows-only primitive used by the D2-A service stop-discovery path. It creates exactly one Named Pipe instance with an explicit DACL and `PIPE_REJECT_REMOTE_CLIENTS`, verifies the connected shutdown client's process identity, and relays one bounded protocol request/response through stdio.

## B4A component boundary

B4A proves binary/artifact integrity, the security-descriptor construction contract (SYSTEM plus the named `NT SERVICE\<serviceName>` SID only), absence of broad interactive principals, bounded startup failures, unauthorized interactive caller denial, and pure request/identity functional checks. An interactive `EPERM` or access-denied result is the expected fail-closed assertion, not a product failure.

`PIPE B4A COMPONENT GATE: PASS` does not mean that any caller was authorized. In particular:

```text
AUTHORIZED SERVICE-SID PIPE CONNECTION: DEFERRED TO E2-B4B
SYSTEM POSITIVE ACCESS: DEFERRED TO E2-B4B
REAL SERVICE TOKEN / DACL INTEGRATION: DEFERRED TO E2-B4B
PIPE NATIVE HANDLER/RESPONSE E2E: DEFERRED TO E2-B4B
PIPE RUNTIME INTEGRATION: DEFERRED TO E2-B4B
B4A PASS != real service topology PASS
```

E2-B4B is responsible for real `NT SERVICE\UEDAssetHub` and SYSTEM positive native access, effective DACL read-back under the service token, valid native request/relay/response, wrong caller/parent and remote rejection, SCM/Runtime Control integration, and shutdown convergence.

It intentionally has no Job Object, lifecycle, restart, shell, network, generic filesystem, DATA, or DSH responsibility. Build on Windows x64 with `npm run build:windows-pipe-security-adapter`; never commit the generated `.exe` or manifest.
