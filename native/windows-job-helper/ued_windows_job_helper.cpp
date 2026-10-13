// Minimal Windows-only process primitive for UED Asset Hub.
// It intentionally has no network listener, filesystem API, shell, PID-kill,
// or restart policy. It owns exactly one component Job for its lifetime.
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <algorithm>
#include <cstdlib>
#include <string>
#include <vector>
#include <iostream>

namespace {
constexpr DWORD kKillOnJobClose = 0x00002000;

std::wstring argumentValue(const std::vector<std::wstring>& values, const std::wstring& name) {
  for (size_t index = 0; index + 1 < values.size(); index++) if (values[index] == name) return values[index + 1];
  return L"";
}

bool allowedComponent(const std::wstring& component) {
  return component == L"assetHub" || component == L"gateway" || component == L"dsh" || component == L"proxy";
}

std::wstring encodeArgument(const std::wstring& value) {
  std::wstring encoded = L"\"";
  size_t backslashes = 0;
  for (wchar_t character : value) {
    if (character == L'\\') {
      backslashes++;
      continue;
    }
    if (character == L'\"') {
      encoded.append(backslashes * 2 + 1, L'\\');
      encoded.push_back(L'\"');
    } else {
      encoded.append(backslashes, L'\\');
      encoded.push_back(character);
    }
    backslashes = 0;
  }
  encoded.append(backslashes * 2, L'\\');
  encoded.push_back(L'\"');
  return encoded;
}

void emit(const char* event, DWORD value = 0) {
  std::cout << "{\"event\":\"" << event << "\",\"value\":" << value << "}" << std::endl;
}
}

int wmain(int argc, wchar_t* argv[]) {
  std::vector<std::wstring> values(argv + 1, argv + argc);
  const auto separator = std::find(values.begin(), values.end(), L"--");
  const std::wstring component = argumentValue(values, L"--component");
  const std::wstring supervisorInstanceId = argumentValue(values, L"--supervisor-instance-id");
  const std::wstring runtimeInstanceId = argumentValue(values, L"--runtime-instance-id");
  const std::wstring generation = argumentValue(values, L"--generation");
  const std::wstring supervisorPidText = argumentValue(values, L"--supervisor-pid");
  const std::wstring jobInstanceId = argumentValue(values, L"--job-instance-id");
  if (!allowedComponent(component) || supervisorPidText.empty() || supervisorInstanceId.empty() || runtimeInstanceId.empty() || generation.empty() || jobInstanceId.empty() || separator == values.end() || separator + 1 == values.end()) return 64;
  const DWORD supervisorPid = wcstoul(supervisorPidText.c_str(), nullptr, 10);
  HANDLE supervisor = OpenProcess(SYNCHRONIZE, FALSE, supervisorPid);
  if (!supervisor) return 65;
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (!job) { CloseHandle(supervisor); return 66; }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = kKillOnJobClose;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) { CloseHandle(job); CloseHandle(supervisor); return 67; }
  std::wstring command = encodeArgument(*(separator + 1));
  for (auto item = separator + 2; item != values.end(); ++item) command += L" " + encodeArgument(*item);
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  if (!CreateProcessW((separator + 1)->c_str(), command.data(), nullptr, nullptr, TRUE, CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, nullptr, nullptr, &startup, &process)) { CloseHandle(job); CloseHandle(supervisor); return 68; }
  if (!AssignProcessToJobObject(job, process.hProcess)) { TerminateProcess(process.hProcess, ERROR_ACCESS_DENIED); WaitForSingleObject(process.hProcess, 2000); CloseHandle(process.hThread); CloseHandle(process.hProcess); CloseHandle(job); CloseHandle(supervisor); return 69; }
  ResumeThread(process.hThread);
  std::cout << "{\"event\":\"spawned\",\"pid\":" << process.dwProcessId << ",\"jobInstanceId\":\"" << std::string(jobInstanceId.begin(), jobInstanceId.end()) << "\"}" << std::endl;
  bool running = true;
  bool rootExited = false;
  while (running) {
    if (WaitForSingleObject(supervisor, 0) == WAIT_OBJECT_0) break;
    DWORD available = 0;
    if (PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE), nullptr, 0, nullptr, &available, nullptr) && available > 0) {
      std::string line; std::getline(std::cin, line);
      const std::string binding = std::string(jobInstanceId.begin(), jobInstanceId.end()) + " " + std::string(supervisorInstanceId.begin(), supervisorInstanceId.end()) + " " + std::string(runtimeInstanceId.begin(), runtimeInstanceId.end()) + " " + std::string(component.begin(), component.end()) + " " + std::string(generation.begin(), generation.end());
      if (line == "query " + binding) {
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
        if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr)) emit("job-query-failed", GetLastError());
        else emit("job-count", accounting.ActiveProcesses);
      } else if (line == "terminate " + binding) {
        if (!TerminateJobObject(job, ERROR_PROCESS_ABORTED)) emit("terminate-failed", GetLastError()); else emit("terminated");
      } else if (line == "shutdown-helper " + binding) {
        running = false;
      } else emit("protocol-rejected");
    }
    DWORD exitCode = STILL_ACTIVE;
    if (!rootExited && (!GetExitCodeProcess(process.hProcess, &exitCode) || exitCode != STILL_ACTIVE)) { emit("root-exit", exitCode); rootExited = true; }
    Sleep(25);
  }
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  CloseHandle(job); // KILL_ON_JOB_CLOSE terminates any still-owned descendants.
  CloseHandle(supervisor);
  return 0;
}
