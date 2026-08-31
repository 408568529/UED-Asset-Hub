// Minimal DPAPI machine-scope primitive. It only protects/unprotects one bounded
// credential-bundle payload; no shell, network, lifecycle, Job, or DATA APIs.
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wincrypt.h>
#include <fstream>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

namespace {
constexpr char kMagic[] = "UEDDPAPI1";
constexpr size_t kMaximumBytes = 64 * 1024;
std::wstring value(int argc, wchar_t* argv[], const std::wstring& name) { for (int i = 1; i + 1 < argc; ++i) if (argv[i] == name) return argv[i + 1]; return L""; }
bool readFile(const std::wstring& name, std::vector<BYTE>* output) { std::ifstream file(std::filesystem::path(name), std::ios::binary); if (!file) return false; file.seekg(0, std::ios::end); const auto size = file.tellg(); if (size < 0 || static_cast<size_t>(size) > kMaximumBytes + sizeof(kMagic)) return false; file.seekg(0); output->resize(static_cast<size_t>(size)); return output->empty() || static_cast<bool>(file.read(reinterpret_cast<char*>(output->data()), output->size())); }
bool writeFile(const std::wstring& name, const std::vector<BYTE>& value) { std::ofstream file(std::filesystem::path(name), std::ios::binary | std::ios::trunc); return static_cast<bool>(file.write(reinterpret_cast<const char*>(value.data()), value.size())); }
bool readStandardInput(std::vector<BYTE>* output) { std::string source((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>()); if (source.empty() || source.size() > kMaximumBytes) return false; output->assign(source.begin(), source.end()); return true; }
}
int wmain(int argc, wchar_t* argv[]) {
  const std::wstring operation = value(argc, argv, L"--operation");
  const std::wstring input = value(argc, argv, L"--input");
  const std::wstring output = value(argc, argv, L"--output");
  if (operation == L"protect") {
    if (output.empty()) return 64;
    std::vector<BYTE> plain; if (!readStandardInput(&plain)) return 65;
    DATA_BLOB source{ static_cast<DWORD>(plain.size()), plain.data() }, encrypted{};
    if (!CryptProtectData(&source, L"UED Asset Hub credential bundle", nullptr, nullptr, nullptr, CRYPTPROTECT_LOCAL_MACHINE, &encrypted)) return 66;
    std::vector<BYTE> file(kMagic, kMagic + sizeof(kMagic) - 1); file.insert(file.end(), encrypted.pbData, encrypted.pbData + encrypted.cbData); LocalFree(encrypted.pbData);
    return writeFile(output, file) ? 0 : 67;
  }
  if (operation == L"unprotect") {
    std::vector<BYTE> file; if (input.empty() || !readFile(input, &file) || file.size() <= sizeof(kMagic) - 1 || std::string(reinterpret_cast<char*>(file.data()), sizeof(kMagic) - 1) != kMagic) return 68;
    DATA_BLOB encrypted{ static_cast<DWORD>(file.size() - (sizeof(kMagic) - 1)), file.data() + sizeof(kMagic) - 1 }, plain{};
    if (!CryptUnprotectData(&encrypted, nullptr, nullptr, nullptr, nullptr, 0, &plain)) return 69;
    if (plain.cbData == 0 || plain.cbData > kMaximumBytes) { LocalFree(plain.pbData); return 70; }
    std::cout.write(reinterpret_cast<char*>(plain.pbData), plain.cbData); LocalFree(plain.pbData); return std::cout.good() ? 0 : 71;
  }
  return 64;
}
