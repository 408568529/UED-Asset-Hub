/* Trusted viewer: supplied markup is parsed in an inert document and only
   executed inside the opaque-origin child, never in this document. */
(async () => {
  const query = new URLSearchParams(location.search), entry = query.get("path") || "";
  if (query.has("embedded")) document.body.dataset.embedded = "true";
  const status = document.getElementById("status"), host = document.getElementById("preview");
  document.getElementById("name").textContent = entry.split("/").pop();
  document.getElementById("download").href = "/api/haldur-design-skill/files?path=" + encodeURIComponent(entry);
  const warnings = new Set(), urls = [], cache = new Map();
  let total = 0, count = 0, navigationBlocked = false;
  const directory = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : "";
  const warn = message => warnings.add(message);
  addEventListener("securitypolicyviolation", event => {
    if (event.effectiveDirective === "frame-src") { navigationBlocked = true; status.textContent = "已阻止预览内不允许的页面跳转。可关闭后重新打开文件，或下载原文件。"; }
  });
  function objectURL(bytes, type) { const url = URL.createObjectURL(new Blob([bytes], { type })); urls.push(url); return url; }
  addEventListener("pagehide", () => urls.forEach(url => URL.revokeObjectURL(url)), { once: true });
  function resolve(value, from) {
    if (value.startsWith("data:")) {
      if (!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i.test(value)) throw new Error("不支持的 data URI");
      return { data: value };
    }
    if (!value || /[\\\u0000-\u001f]/.test(value)) throw new Error("资源路径无效");
    if (decodeURIComponent(value.split(/[?#]/)[0]).split("/").some(x => x === ".." || x.includes("%"))) throw new Error("资源路径越界或重复编码");
    const url = new URL(value, "https://skill.invalid/" + from);
    if (url.origin !== "https://skill.invalid" || /^[a-z][\w+.-]*:/i.test(value) || value.startsWith("/")) throw new Error("外部或绝对资源已阻止");
    const path = decodeURIComponent(url.pathname.slice(1));
    if (directory && !path.startsWith(directory)) throw new Error("资源超出入口目录");
    return { path, hash: url.hash };
  }
  async function read(path) {
    if (cache.has(path)) return cache.get(path);
    if (++count > 128) throw new Error("资源数超过 128 项预览预算");
    const promise = (async () => {
      const response = await fetch("/api/haldur-design-skill/preview?entry=" + encodeURIComponent(entry) + "&path=" + encodeURIComponent(path), { cache: "no-store", redirect: "error" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "读取失败");
      total += data.size; if (total > 16 * 1024 * 1024) throw new Error("资源总量超过 16 MiB 预览预算");
      return data;
    })();
    cache.set(path, promise); return promise;
  }
  async function resource(value, from, kind) {
    try {
      const ref = resolve(value, from);
      if (ref.data) { if (kind !== "image") throw new Error("此处不允许 data URI"); return ref.data; }
      const data = await read(ref.path);
      if (kind === "image" && !data.mime.startsWith("image/")) throw new Error("不是图像资源");
      if (kind === "script" && data.mime !== "text/javascript") throw new Error("不是普通 JS 文件");
      if (kind === "style" && data.mime !== "text/css") throw new Error("不是 CSS 文件");
      if (kind === "style") return css(data.content, ref.path);
      const bytes = data.base64 ? Uint8Array.from(atob(data.base64), c => c.charCodeAt(0)) : data.content;
      const base64 = data.base64 || btoa(Array.from(new TextEncoder().encode(bytes), byte => String.fromCharCode(byte)).join(""));
      return `data:${data.mime};base64,${base64}` + (ref.hash || "");
    } catch (error) { warn(`${value}：${error.message}`); return kind === "style" ? "" : "data:,"; }
  }
  async function css(source, from) {
    if (/@import/i.test(source)) warn(`${from}：不支持 CSS @import，请使用显式 stylesheet`);
    const sheet = new CSSStyleSheet(); sheet.replaceSync(source);
    return cssURLs([...sheet.cssRules].map(rule => rule.cssText).join("\n"), from);
  }
  async function cssURLs(source, from) {
    // Limited URL rewriting after CSSOM parsing; CSP, not this rewrite, enforces network denial.
    const pattern = /url\(\s*(?:"([^"\\]*)"|'([^'\\]*)'|([^)'"\\]*))\s*\)/gi;
    let result = "", last = 0;
    for (const match of source.matchAll(pattern)) {
      result += source.slice(last, match.index);
      const value = (match[1] ?? match[2] ?? match[3]).trim();
      result += value.startsWith("#") ? match[0] : `url("${await resource(value, from, "image")}")`;
      last = match.index + match[0].length;
    }
    return result + source.slice(last);
  }
  try {
    const data = await read(entry);
    if (data.mime.startsWith("image/")) {
      const image = document.createElement("img"); image.alt = data.name;
      image.src = objectURL(Uint8Array.from(atob(data.base64), c => c.charCodeAt(0)), data.mime);
      image.addEventListener("error", () => { status.textContent = "图像无法显示，请下载原文件。"; });
      host.append(image); status.textContent = ""; return;
    }
    if (data.mime !== "text/html") throw new Error("此格式暂不支持预览");
    const content = new DOMParser().parseFromString(data.content, "text/html");
    content.querySelectorAll("base,meta[http-equiv],iframe,frame,object,embed").forEach(node => { node.remove(); warn("已阻止文档导航指令或嵌套页面"); });
    const preparedStyles = new Set();
    for (const link of content.querySelectorAll("link")) {
      if (link.rel.toLowerCase() !== "stylesheet") { link.remove(); continue; }
      const style = document.createElement("style"); style.textContent = await resource(link.getAttribute("href") || "", entry, "style"); preparedStyles.add(style); link.replaceWith(style);
    }
    for (const style of content.querySelectorAll("style")) if (!preparedStyles.has(style)) style.textContent = await css(style.textContent, entry);
    for (const node of content.querySelectorAll("[style]")) node.setAttribute("style", await cssURLs(node.getAttribute("style"), entry));
    for (const script of content.querySelectorAll("script")) {
      if (script.type && !["text/javascript", "application/javascript"].includes(script.type)) { script.remove(); warn("模块脚本不在本轮支持范围内"); continue; }
      if (script.hasAttribute("src")) {
        const url = await resource(script.getAttribute("src"), entry, "script");
        script.removeAttribute("integrity"); script.removeAttribute("crossorigin"); script.setAttribute("src", url);
      }
    }
    for (const image of content.querySelectorAll("img,source")) {
      if (image.hasAttribute("src")) image.setAttribute("src", await resource(image.getAttribute("src"), entry, "image"));
      if (image.hasAttribute("srcset")) {
        const raw = image.getAttribute("srcset");
        if (raw.includes("data:")) { image.removeAttribute("srcset"); warn("data URI srcset 暂不支持，请使用 src"); }
        else {
          const parts = [];
          for (const item of raw.split(",")) { const [url, descriptor = ""] = item.trim().split(/\s+/); parts.push(`${await resource(url, entry, "image")} ${descriptor}`.trim()); }
          image.setAttribute("srcset", parts.join(", "));
        }
      }
    }
    for (const a of content.querySelectorAll("a[href]")) {
      if (!a.getAttribute("href").startsWith("#")) { a.removeAttribute("href"); a.removeAttribute("target"); warn("已阻止预览内页面跳转，请使用宿主新标签按钮"); }
    }
    const policy = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' blob:; img-src blob: data:; font-src blob: data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
    content.querySelectorAll("meta[charset]").forEach(node => node.remove());
    const charset = content.createElement("meta"); charset.setAttribute("charset", "utf-8"); content.head.prepend(charset);
    const meta = content.createElement("meta"); meta.httpEquiv = "Content-Security-Policy"; meta.content = policy; content.head.prepend(meta);
    const markup = "<!doctype html>" + content.documentElement.outerHTML;
    const frame = document.createElement("iframe"); frame.title = data.name; frame.sandbox = "allow-scripts"; frame.referrerPolicy = "no-referrer";
    // Defer visibility until the browser has executed ordinary deferred scripts;
    // the load event is a presentation gate, not a claim that arbitrary JS succeeded.
    frame.style.visibility = "hidden";
    frame.addEventListener("load", () => { frame.style.visibility = "visible"; if (!navigationBlocked) status.textContent = [...warnings].join("\n"); }, { once: true });
    // srcdoc also works in WebKit-based embedded browsers where sandboxed blob
    // navigation can stall. Without allow-same-origin the child remains opaque;
    // the existing child CSP and parent navigation policy are unchanged.
    frame.srcdoc = markup; host.append(frame); status.textContent = "正在加载隔离文档…";
  } catch (error) { status.textContent = "无法预览：" + error.message + "。可下载原文件。"; }
})();
