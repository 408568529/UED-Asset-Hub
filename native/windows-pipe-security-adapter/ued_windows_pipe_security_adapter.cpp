// Minimal Windows-only Named Pipe security primitive for UED Asset Hub.
// It owns one local pipe connection only; it has no lifecycle, Job, shell,
// network, filesystem-management, or arbitrary process-control capability.
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <aclapi.h>
#include <tlhelp32.h>
#include <winternl.h>
#include <algorithm>
#include <cwctype>
#include <iostream>
#include <string>
#include <vector>

namespace {
constexpr DWORD kProtocolBytes = 4096;
constexpr DWORD kPipeRights = FILE_READ_DATA | FILE_WRITE_DATA | FILE_READ_ATTRIBUTES | FILE_WRITE_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE;

std::wstring argumentValue(const std::vector<std::wstring>& values, const std::wstring& name) {
  for (size_t index = 0; index + 1 < values.size(); ++index) if (values[index] == name) return values[index + 1];
  return L"";
}

std::wstring lower(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(), ::towlower);
  return value;
}

bool equalPath(const std::wstring& left, const std::wstring& right) {
  return !left.empty() && !right.empty() && lower(left) == lower(right);
}

bool containsInsensitive(const std::wstring& value, const std::wstring& part) {
  return !part.empty() && lower(value).find(lower(part)) != std::wstring::npos;
}

std::wstring imagePath(HANDLE process) {
  DWORD length = 32768;
  std::vector<wchar_t> buffer(length);
  if (!QueryFullProcessImageNameW(process, 0, buffer.data(), &length)) return L"";
  return std::wstring(buffer.data(), length);
}

std::wstring processCommandLine(HANDLE process) {
  using QueryProcess = NTSTATUS(NTAPI*)(HANDLE, PROCESSINFOCLASS, PVOID, ULONG, PULONG);
  const auto query = reinterpret_cast<QueryProcess>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQueryInformationProcess"));
  if (!query) return L"";
  ULONG size = 0;
  constexpr NTSTATUS kLengthMismatch = static_cast<NTSTATUS>(0xC0000004L);
  NTSTATUS status = query(process, static_cast<PROCESSINFOCLASS>(60), nullptr, 0, &size);
  if (status != kLengthMismatch || size < sizeof(UNICODE_STRING) || size > 1024 * 1024) return L"";
  std::vector<BYTE> buffer(size);
  status = query(process, static_cast<PROCESSINFOCLASS>(60), buffer.data(), size, &size);
  if (status < 0) return L"";
  const auto* text = reinterpret_cast<const UNICODE_STRING*>(buffer.data());
  if (!text->Buffer || text->Length == 0 || text->Length > size) return L"";
  return std::wstring(text->Buffer, text->Length / sizeof(wchar_t));
}

DWORD parentPid(DWORD pid) {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) return 0;
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  DWORD parent = 0;
  if (Process32FirstW(snapshot, &entry)) do { if (entry.th32ProcessID == pid) { parent = entry.th32ParentProcessID; break; } } while (Process32NextW(snapshot, &entry));
  CloseHandle(snapshot);
  return parent;
}

bool processCreationTime(HANDLE process, FILETIME* created) {
  FILETIME ignored{}, exited{}, kernel{}, user{};
  return GetProcessTimes(process, created, &exited, &kernel, &user) != FALSE;
}

bool serviceSid(const std::wstring& serviceName, std::vector<BYTE>* value) {
  DWORD sidSize = 0;
  DWORD domainSize = 0;
  SID_NAME_USE use{};
  const std::wstring account = L"NT SERVICE\\" + serviceName;
  LookupAccountNameW(nullptr, account.c_str(), nullptr, &sidSize, nullptr, &domainSize, &use);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || sidSize == 0) return false;
  value->resize(sidSize);
  std::vector<wchar_t> domain(domainSize + 1);
  return LookupAccountNameW(nullptr, account.c_str(), value->data(), &sidSize, domain.data(), &domainSize, &use) != FALSE;
}

bool createSecurityAttributes(const std::wstring& serviceName, SECURITY_ATTRIBUTES* attributes, PSECURITY_DESCRIPTOR* descriptor, PACL* acl) {
  std::vector<BYTE> service;
  if (!serviceSid(serviceName, &service)) return false;
  SID_IDENTIFIER_AUTHORITY authority = SECURITY_NT_AUTHORITY;
  PSID system = nullptr;
  if (!AllocateAndInitializeSid(&authority, 1, SECURITY_LOCAL_SYSTEM_RID, 0, 0, 0, 0, 0, 0, 0, &system)) return false;
  EXPLICIT_ACCESSW entries[2]{};
  entries[0].grfAccessPermissions = GENERIC_ALL;
  entries[0].grfAccessMode = SET_ACCESS;
  entries[0].grfInheritance = NO_INHERITANCE;
  entries[0].Trustee.TrusteeForm = TRUSTEE_IS_SID;
  entries[0].Trustee.TrusteeType = TRUSTEE_IS_WELL_KNOWN_GROUP;
  entries[0].Trustee.ptstrName = reinterpret_cast<LPWSTR>(system);
  entries[1].grfAccessPermissions = kPipeRights;
  entries[1].grfAccessMode = SET_ACCESS;
  entries[1].grfInheritance = NO_INHERITANCE;
  entries[1].Trustee.TrusteeForm = TRUSTEE_IS_SID;
  entries[1].Trustee.TrusteeType = TRUSTEE_IS_USER;
  entries[1].Trustee.ptstrName = reinterpret_cast<LPWSTR>(service.data());
  if (SetEntriesInAclW(2, entries, nullptr, acl) != ERROR_SUCCESS) { FreeSid(system); return false; }
  *descriptor = static_cast<PSECURITY_DESCRIPTOR>(LocalAlloc(LPTR, SECURITY_DESCRIPTOR_MIN_LENGTH));
  if (!*descriptor || !InitializeSecurityDescriptor(*descriptor, SECURITY_DESCRIPTOR_REVISION) || !SetSecurityDescriptorDacl(*descriptor, TRUE, *acl, FALSE)) { if (*descriptor) LocalFree(*descriptor); LocalFree(*acl); FreeSid(system); return false; }
  attributes->nLength = sizeof(*attributes);
  attributes->lpSecurityDescriptor = *descriptor;
  attributes->bInheritHandle = FALSE;
  FreeSid(system);
  return true;
}

std::string narrow(const std::wstring& value) {
  if (value.empty()) return "";
  const int bytes = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(bytes, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), bytes, nullptr, nullptr);
  return result;
}

std::string jsonString(const std::wstring& value) {
  const std::string source = narrow(value);
  std::string escaped;
  escaped.reserve(source.size());
  for (const unsigned char character : source) {
    if (character == '\\' || character == '"') { escaped.push_back('\\'); escaped.push_back(static_cast<char>(character)); }
    else if (character == '\n') escaped += "\\n";
    else if (character == '\r') escaped += "\\r";
    else if (character == '\t') escaped += "\\t";
    else if (character < 0x20) escaped += "?";
    else escaped.push_back(static_cast<char>(character));
  }
  return escaped;
}

bool inspectClient(HANDLE pipe, const std::wstring& expectedExe, const std::wstring& expectedScript, DWORD expectedParentPid, const std::wstring& expectedParentExe, DWORD* clientPid, FILETIME* creation) {
  if (!GetNamedPipeClientProcessId(pipe, clientPid)) return false;
  HANDLE client = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, *clientPid);
  if (!client) return false;
  const DWORD parent = parentPid(*clientPid);
  HANDLE parentProcess = parent ? OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, parent) : nullptr;
  const bool valid = processCreationTime(client, creation) && equalPath(imagePath(client), expectedExe) && containsInsensitive(processCommandLine(client), expectedScript) && parent == expectedParentPid && parentProcess && equalPath(imagePath(parentProcess), expectedParentExe);
  if (parentProcess) CloseHandle(parentProcess);
  CloseHandle(client);
  return valid;
}

bool readPipeLine(HANDLE pipe, std::string* output) {
  char buffer[512];
  const ULONGLONG deadline = GetTickCount64() + 10'000;
  while (output->size() < kProtocolBytes && GetTickCount64() < deadline) {
    DWORD read = 0;
    if (!ReadFile(pipe, buffer, sizeof(buffer), &read, nullptr)) {
      const DWORD error = GetLastError();
      if (error == ERROR_NO_DATA) { Sleep(20); continue; }
      if (error != ERROR_MORE_DATA) return false;
    }
    if (read == 0) { Sleep(20); continue; }
    output->append(buffer, read);
    if (output->find('\n') != std::string::npos) { output->resize(output->find('\n')); return true; }
  }
  return false;
}

bool writePipeLine(HANDLE pipe, const std::string& value) {
  const std::string line = value + "\n";
  DWORD written = 0;
  return WriteFile(pipe, line.data(), static_cast<DWORD>(line.size()), &written, nullptr) != FALSE && written == line.size();
}
}

int wmain(int argc, wchar_t* argv[]) {
  const std::vector<std::wstring> values(argv + 1, argv + argc);
  const std::wstring endpoint = argumentValue(values, L"--endpoint");
  const std::wstring serviceName = argumentValue(values, L"--service-name");
  const std::wstring expectedExe = argumentValue(values, L"--expected-client-exe");
  const std::wstring expectedScript = argumentValue(values, L"--expected-client-script");
  const std::wstring expectedParentPidText = argumentValue(values, L"--expected-parent-pid");
  const std::wstring expectedParentExe = argumentValue(values, L"--expected-parent-exe");
  const std::wstring expectedFingerprint = argumentValue(values, L"--expected-command-fingerprint");
  const DWORD expectedParentPid = wcstoul(expectedParentPidText.c_str(), nullptr, 10);
  if (endpoint.empty() || serviceName.empty() || expectedExe.empty() || expectedScript.empty() || expectedParentPid == 0 || expectedParentExe.empty() || expectedFingerprint.empty()) return 64;
  SECURITY_ATTRIBUTES attributes{};
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  PACL acl = nullptr;
  if (!createSecurityAttributes(serviceName, &attributes, &descriptor, &acl)) return 65;
  HANDLE pipe = CreateNamedPipeW(endpoint.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1, kProtocolBytes, kProtocolBytes, 10'000, &attributes);
  LocalFree(descriptor);
  LocalFree(acl);
  if (pipe == INVALID_HANDLE_VALUE) return 66;
  const BOOL connected = ConnectNamedPipe(pipe, nullptr) ? TRUE : GetLastError() == ERROR_PIPE_CONNECTED;
  if (!connected) { CloseHandle(pipe); return 67; }
  DWORD mode = PIPE_READMODE_MESSAGE | PIPE_NOWAIT;
  if (!SetNamedPipeHandleState(pipe, &mode, nullptr, nullptr)) { CloseHandle(pipe); return 68; }
  DWORD clientPid = 0;
  FILETIME creation{};
  if (!inspectClient(pipe, expectedExe, expectedScript, expectedParentPid, expectedParentExe, &clientPid, &creation)) { CloseHandle(pipe); return 69; }
  std::string request;
  if (!readPipeLine(pipe, &request)) { CloseHandle(pipe); return 70; }
  ULARGE_INTEGER creationValue{};
  creationValue.LowPart = creation.dwLowDateTime;
  creationValue.HighPart = creation.dwHighDateTime;
  std::cout << "{\"event\":\"request\",\"request\":" << request << ",\"client\":{\"authenticated\":true,\"pid\":" << clientPid << ",\"creationTime\":\"" << creationValue.QuadPart << "\",\"executable\":\"" << jsonString(expectedExe) << "\",\"commandFingerprint\":\"" << jsonString(expectedFingerprint) << "\",\"parentPid\":" << expectedParentPid << ",\"parentExecutable\":\"" << jsonString(expectedParentExe) << "\"}}" << std::endl;
  std::string response;
  if (std::getline(std::cin, response) && response.size() <= kProtocolBytes) writePipeLine(pipe, response);
  FlushFileBuffers(pipe);
  DisconnectNamedPipe(pipe);
  CloseHandle(pipe);
  return 0;
}
