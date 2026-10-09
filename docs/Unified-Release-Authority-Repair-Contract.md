# Unified Release Authority Repair Contract

## Authorization and lifecycle

Approved baseline: G-036B / Run006 audit, approved Approval Root Architecture Addendum, implementation authorization v2 and Resume Authorization. The approved 2026-10-09 Trusted Operator contract supersedes only the Addendum’s dual-identity approval and administrator-resistant Journal claims; its receipt/matrix obligations remain. This work permits implementation and isolated focused regressions only. It does not permit commit, push, V5 freeze/authority/Approval/Security creation, admission dry run, Constructor, Pre-R3, Formal A/B, promotion, service installation or production writes.

Authority creation → LogicalReleaseAuthority v1 → explicit trusted-operator ReleaseAuthorityApproval v2 → separately protected execution permission → ExecutionBinding v1 → readonly admission → Constructor. Constructor has no approval producer import, publication or missing-record fallback.

## Identity and receipt boundaries

An immutable Source retains its creator Run and exact creation timestamp. A new execution has a distinct `executionRunId`. `inputAuthorityIdentity` contains stable Source, ToolchainCore, EnvironmentProfile, DependencyCore, Native, DSH and shared Security authority. Creation provenance and execution observations do not enter that stable identity.

New typed receipts: FrozenSourceAuthority v1, ToolchainReceipt v3, EnvironmentReceipt v2, DependencyReceipt v1, NativeBuildReceipt v1 and its receipt set. Legacy mixed Toolchain/Environment bytes remain historical; new typed projections do not reinterpret the old mixed digest as a stable core identity. Source receipt derives the entire extended V4 manifest and ustar archive, including inventory, classifications, summary, exclusions, revisions, original creator/time, lock and frozen identity.

Approval exact fields: `schemaVersion`, `policyVersion`, `approvalIdentity`, `logicalReleaseAuthoritySha256`, `inputAuthorityIdentity`, `approvedReceipts`, `approvalProvenance`. Live schema version is 2; policy is `ued-trusted-operator-release-v1`; provenance is exact `method=trusted-operator-review-v1`, `operatorPrincipal`, `reviewedAt`. Old schema v1/policy `ued-release-authority-approval-v1` is rejected in new live admission; historical bytes remain unchanged. Identity hashes canonical JSON of the body excluding `approvalIdentity`. Record bytes are canonical UTF-8 JSON plus LF. Duplicate/unknown/missing keys and altered serialization fail.

The ten approved raw receipt slots are Source manifest/creation, Toolchain, Environment, Dependency, Native manifest/creation, DSH bundle authority/provenance and Security protected artifact. Approval ↔ LRA ↔ Binding ↔ actual receipt bytes must all agree. Domain validators additionally derive Source archive facts, Native PE/member/source/tool/argv facts, Dependency byte tree and DSH materialization/closure facts. Pure schema/self-digest functions grant no trust.

## Trusted Operator admission

Only one live policy is supported: a specifically configured Windows administrator may explicitly review, publish records/permission plans and execute. This contract trusts that administrator. It does not independently prevent self-approval, replacement of local records, code/provider changes or Journal rewriting by a malicious administrator. Hash chains detect corruption and accidental changes, not an administrator who rewrites the complete chain.

Host configuration remains at `C:\ProgramData\UED-Release-Authority\trust-config.json`; no new account, service or external approval system is required. Exact fields: schemaVersion=2, policyVersion, approvalRoot, permissionRoot, operatorPrincipal, consumerCodeRoot. operatorPrincipal is an exact Windows user SID. Actual OS token observation checks SID, account/SID resolution, enabled Administrator role, TokenElevation and TokenIntegrityLevel (high or above). Missing, inconsistent, lower-integrity or mismatched observations fail. Caller-provided observations cannot create a branded live admission; non-Windows live admission is rejected.

Code, Node/Git providers, records and every ancestor reject effective ordinary-account modification of protected targets, replacement/deletion or ACL takeover of an existing ancestor, untrusted owners and links. Windows `InheritOnly` ACEs are not effective on the current directory; create-only grants on an ancestor do not by themselves replace an existing protected child. The volume root may be owned by the resolved `NT SERVICE\\TrustedInstaller` identity. Final code/record/config targets remain strict; unsafe ancestor `DeleteChild`, `Delete`, `WriteDac`, `WriteOwner` or generic all rights fail. The configured operator, SYSTEM and Administrators may write. The local record directories are selected operator records, not an independent trust root. Roots remain disjoint from execution locators and code. Records require canonical raw bytes, actual receipt/domain membership and unchanged file identity while reading. Explicit producer publication is exclusive (`wx`); Constructor/Serial never create missing approval or permission records. WeakSet-branded contexts still reject caller-forged grants.

Execution permission plan exact fields: schemaVersion, planIdentity, permissionDigest, approvalIdentity, logicalReleaseAuthoritySha256, experimentId, executions. Each execution fixes Run, label, raw binding SHA, phase, budget=1, resume=never and journal identity. `permissionDigest` hashes the permission body excluding planIdentity/permissionDigest and each execution's bindingSha256 **and journalIdentity**. Journal header identity then derives from experimentId, budget and permissionDigest. Full planIdentity seals the completed plan including raw binding hashes and journal identities. This ordering avoids a hash cycle; permissionDigest alone does not seal the full plan.

Journals live under the operator permission root. Explicit publication creates the header exclusively and excludes ordinary-account writers; operator/SYSTEM/Administrators may retain full access. A Global Windows mutex covers latest-head recheck and append. The append provider requests FILE_APPEND_DATA/SYNCHRONIZE and FILE_FLAG_WRITE_THROUGH, verifies complete WriteFile and closes the handle. It does not request overwrite access or call FlushFileBuffers. These are application write-path guarantees; the administrator can still overwrite/delete files outside that path. Chain, budget, replay, concurrency, failure consumption and write failures remain fail-closed; failed execution retains its started claim and artifacts. Actual Windows token/ACL/concurrency/storage integration remains pending.

## W0–W3 replacement contract

| Gate | New live acceptance | Replaced old guarantee |
| --- | --- | --- |
| W0 | Windows/NTFS/isolated roots; exact configured operator SID plus actual high-integrity elevated Administrator token. Default PATH tool versions are discovery only. | Distinct nonadmin Consumer prerequisite |
| W1 | Actual operator/config binding; owners/ancestor ACL reject ordinary writers; code/providers/record links and execution-root overlaps reject. | Consumer cannot replace approver/config/code/provider |
| W2 | Explicit operator record, actual LRA/ten raw receipts/Binding selection; missing, malformed, duplicate/unknown keys, wrong SID, raw serialization, membership or binding reject. | Independent approval and consumer cannot invoke producer |
| W3 | Actual mutex competition, chain, append write path/write-through, budget, replay, failed claim/artifact preservation. | Administrator cannot overwrite/truncate/delete Journal |

The replaced dual-identity assertions are `SUPERSEDED_BY_TRUSTED_OPERATOR_CONTRACT`; they are not PASS results. Replacement fixture evidence is `verify-trusted-operator-contract.mjs`, `verify-release-approval-contract.mjs`, `verify-release-authority-boundaries.mjs` and `verify-release-consumer-isolation.mjs`. Positive OS integration is still required in separate isolated Windows gates. W4 verifies exact approved Node/npm/Dependency independently of default PATH; W5 verifies explicit MSVC/SDK identities independently of PATH visibility; W6/W7 DSH/Security/history/Serial obligations remain.

## Constructor, Candidate and evidence

Before claiming a budget or writing execution directories, admission validates operator record selections, actual receipt/domain projections, Security epoch, exact Node/npm bytes and locators. Existing temp/output directories are rejected and retained. npm code is invoked only after approved npm byte checks. Native current Run and offline DSH bindings must match their selected raw hashes. Bundle DSH performs isolated verify/unbundle, complete reachable object-set comparison and source materialization checks.

Candidate v4 requires a branded trusted context. Source snapshot/lock/classification/eligibility, original runtime module bytes, six Native members, DSH identity, Dependency tree, shared Security metadata, rb1 seed, generated server output and `.next/BUILD_ID` are cross-checked against the approved inputs. External execution evidence v3 binds Approval/LRA/plan/permission/journal plus expected Run/label/phase/receipts/output. Evidence v2 and older Candidate versions remain historical readable formats, without live approval.

Artifact-set self-reference exclusions do not exclude files from A/B comparison. Complete Candidate/runtime inventories compare paths, sizes, hashes and actual bytes, including manifests and sidecars; semantic JSON equality is insufficient.

## Native preparation

Three release-native builders call actual compiler/linker capture. The producer records executable hashes/actual versions, SDK Include/Lib inventories, controlled INCLUDE/LIB, normalized argv, frozen Source inputs, PE AMD64/PE32+ imports/output, original creator and external logs. Delay imports and unknown non-system runtime DLLs fail. New component local gate v2 captures actual argv/inspection; historical v1, nb1/nb2/nb3 bytes are unchanged. Separate receipt-set production verifies all three roles and the original aggregate/member/source bindings. Constructor and explicit operator review consume the selected set. No actual MSVC invocation was performed in this implementation run.

## Serial and historical preservation

Serial A/B uses identical LRA/Approval/Security, distinct Runs/raw bindings and one canonical workspace. Mutable roots must be disjoint from all nine approved historical roots before any observation write. Observation journal is exclusively created. A Candidate, full runtime snapshot and evidence are byte-sealed before retaining A temp under its evidence root and starting B. B completion revalidates A seals and compares complete Candidate/runtime bytes. Failed attempts remain available.

The nine historical selections are sourceV3, sourceV4, nativeNb1, nativeNb2, nativeNb3, dshRetry003, preR3V4Candidate, failedFormalAV4 and historicalSecuritySet. A explicit operator-selected baseline requires nonempty exact inventories; missing roots, links, baseline mismatches and before/after changes fail. Old empty inventories remain invalid historical evidence. No original nine-root preservation PASS is claimed without accessing those exact roots.

## Coverage and validation limits

Coverage source of truth is all applicable V001–V012 matrix entries. Audit has 1467 rows and 425 violation-marked rows. The reproducible V001(4)+V003(45)=49 subset is not an exact-49 closure gate. Coverage ledger retains original artifact/field/audit line, disposition, successor and duplicate relationships, producer/consumer semantics, code and regression references. Historical instances are never rewritten to satisfy new live contracts.

Current-host fixtures exercise schemas, membership, Source derivation, Native/DSH projections, provenance, replay, raw comparison, Serial selection, history inventory and consumer isolation. They do not establish real trusted-operator admission, MSVC capture, DPAPI behavior, Windows journal concurrency/durability, original retry-003 closure or all nine actual historical-root inventories. Those gates remain pending. Completion flags and per-violation results belong to the implementation report; `UNIFIED_REPAIR_PASS=false` until separately authorized release validation.

## Source identity transition

This contract and its implementation change future V5 Frozen Source bytes/identity. LRA stable core, ExecutionBinding, Candidate v4 and execution evidence v3 layouts remain unchanged; new approvalIdentity changes because schema/policy/provenance changed. No historical V3/V4, nb1–nb3, retry-003, Pre-R3 Candidate, failed Formal A or Security bytes are migrated, re-signed or relabeled. The old implementation closure remains a historical record, not proof that new Windows gates passed.
