// Literal template anchors: no model-provided regex or execution on the server.
export function regions(text) {
  const result = [];
  for (const [name, from, to] of [
    ['list.rows', 'const rows=[', '\nconst defaults='],
    ['list.columns', 'const defaults=[', '\nconst columns='],
    ['page.heading', '<div class="hd-page-heading">', '<div class="stack">'],
    ['page.scene', '<section id="composition"', '<script'],
    ['page.behavior', "window.typicalTable=", '\nrender();reflow();']
  ]) {
    const start = text.indexOf(from), end = start < 0 ? -1 : text.indexOf(to, start + from.length);
    if (start >= 0 && end > start && text.indexOf(from, start + 1) < 0) result.push({ name, start, end, chars: end - start });
  }
  return result;
}
export function excerpt(text, input = {}) {
  const max = input.max_chars ?? 8000;
  if (!Number.isInteger(max) || max < 100 || max > 16000) throw Error('max_chars 必须在100到16000之间。');
  let start, end;
  if (input.region) {
    const region = regions(text).find(item => item.name === input.region);
    if (!region) throw Error('当前模板没有该稳定锚点；请使用更精确的文字 anchor。');
    start = region.start; end = region.end;
  } else if (input.anchor) {
    if (typeof input.anchor !== 'string' || input.anchor.length > 500 || !input.anchor.trim()) throw Error('anchor 必须是1到500字符的明确文字。');
    const index = text.indexOf(input.anchor);
    if (index < 0 || text.indexOf(input.anchor, index + 1) >= 0) throw Error('anchor 不存在或有多个匹配，请缩小到唯一文字。');
    start = Math.max(0, index - 500); end = Math.min(text.length, index + max - 500);
  } else {
    start = input.offset ?? 0;
    if (!Number.isInteger(start) || start < 0 || start > text.length) throw Error('读取 offset 无效。');
    end = text.length;
  }
  end = Math.min(end, start + max);
  return { content: text.slice(start, end), offset: start, end, totalCharacters: text.length, truncated: end < text.length, nextOffset: end < text.length ? end : null, units: 'UTF-16 code units' };
}
