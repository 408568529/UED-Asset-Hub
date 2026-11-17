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
  for (const [name, pattern] of [['document.title', /<title\b[^>]*>[\s\S]*?<\/title\s*>/gi], ['document.heading', /<h1\b[^>]*>[\s\S]*?<\/h1\s*>/gi]]) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length === 1) { const start = matches[0].index; result.push({name,start,end:start+matches[0][0].length,chars:matches[0][0].length}); }
  }
  return result;
}
export function find(text, input = {}) {
  const needle = input.q ?? input.anchor, limit = input.limit ?? 10, after = input.after_offset ?? 0;
  if (typeof needle !== 'string' || !needle.trim() || needle.length > 500) throw Error('q/anchor 必须是1到500字符的明确文字。');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(after) || after < 0) throw Error('定位分页参数无效。');
  const haystack = input.case_sensitive === false ? text.toLowerCase() : text, query = input.case_sensitive === false ? needle.toLowerCase() : needle;
  const matches = []; let from = 0, total = 0, index;
  while ((index = haystack.indexOf(query, from)) >= 0) {
    total++; from = index + Math.max(1, needle.length);
    if (index < after || matches.length >= limit) continue;
    const contextOffset = Math.max(0,index-100);
    matches.push({occurrence:total,offset:index,end:index+needle.length,line:text.slice(0,index).split('\n').length,contextOffset,context:text.slice(contextOffset,index+needle.length+160)});
  }
  return { status: total ? 'matched' : 'not-found', query:needle, totalMatches:total, matches, nextOffset:matches.length===limit && total > matches.at(-1).occurrence ? matches.at(-1).end : null, units:'UTF-16 code units' };
}
export function excerpt(text, input = {}) {
  const max = input.max_chars ?? 8000;
  if (!Number.isInteger(max) || max < 100 || max > 16000) throw Error('max_chars 必须在100到16000之间。');
  let start, end;
  if (input.region) {
    const region = regions(text).find(item => item.name === input.region);
    if (!region) return {status:'region-not-found',availableRegions:regions(text),hint:'该模板没有这个区域名称；使用 html_find 搜索实际文字或业务标记。'};
    start = region.start; end = region.end;
  } else if (input.anchor) {
    const located = find(text,{q:input.anchor,limit:20});
    if (!located.totalMatches) return {...located,hint:'未匹配到该文字；可缩短关键词或使用 html_find，勿猜偏移量。'};
    if (input.occurrence === undefined && located.totalMatches > 1) return {...located,status:'ambiguous',hint:'返回的是候选位置；用 occurrence 选择匹配项，或用 html_find 的 offset 精确读取/修改。'};
    const occurrence = input.occurrence ?? 1;
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > located.totalMatches) throw Error('occurrence 超出实际匹配次数。');
    let index=-1;for(let n=0;n<occurrence;n++)index=text.indexOf(input.anchor,index+1);
    start=Math.max(0,index-100);end=Math.min(text.length,start+max);
  } else {
    start = input.offset ?? 0;
    if (!Number.isInteger(start) || start < 0 || start > text.length) throw Error('读取 offset 无效。');
    end = text.length;
  }
  end=Math.min(end,start+max);
  return {status:'matched',content:text.slice(start,end),offset:start,end,totalCharacters:text.length,truncated:end<text.length,nextOffset:end<text.length?end:null,units:'UTF-16 code units'};
}
