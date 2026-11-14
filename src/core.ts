import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

export const API = "https://api.deepseek.com";
export const MAX_BYTES = 100 * 1024 * 1024;
export type Source = { url: string; title?: string };
export type RunOptions = {
  source: Source; key: string; prompt: string; signal?: AbortSignal;
  onStage?: (text: string) => void; onText?: (text: string) => void;
  fetcher?: typeof fetch;
};
export function normalizeSource(value: string): string {
  const input = value.trim();
  if (input.startsWith("/")) return pathToFileURL(input).href;
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("请输入完整 PDF 链接，或选择本地 PDF 文件。"); }
  if (["chrome-extension:", "moz-extension:"].includes(url.protocol)) {
    const inner = url.searchParams.get("file") || url.searchParams.get("src");
    if (inner) return normalizeSource(inner);
  }
  if (!["https:", "http:", "file:"].includes(url.protocol))
    throw new Error("这个地址无法直接读取。请下载 PDF 后使用“选择本地 PDF”。");
  if (url.username || url.password) throw new Error("不支持包含账号密码的链接，请下载后选择本地 PDF。");
  if (url.protocol === "file:" && url.hostname && url.hostname !== "localhost") throw new Error("仅支持本机文件。");
  url.hash = "";
  return url.href;
}
export async function configuredKey(): Promise<string> {
  const path = join(homedir(), ".config/raycast/ai/providers.yaml");
  let data;
  try { data = parse(await readFile(path, "utf8")); } catch { throw new Error("无法读取 Raycast 的 providers.yaml，请检查 DeepSeek 配置。"); }
  const provider = data?.providers?.find((p: { id?: string }) => p.id === "deepseek");
  const model = provider?.models?.find((m: { id?: string }) => m.id === "deepseek-flash");
  const alias = model?.provider ?? Object.keys(provider?.api_keys ?? {})[0];
  const key = provider?.api_keys?.[alias];
  if (typeof key !== "string" || !key.trim()) throw new Error("providers.yaml 中没有找到 DeepSeek API Key。");
  return key.trim();
}
export async function pdfBytes(source: Source, fetcher = fetch, signal?: AbortSignal): Promise<Uint8Array> {
  const url = normalizeSource(source.url);
  let data: Uint8Array;
  if (url.startsWith("file:")) {
    const path = fileURLToPath(url);
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error("请选择不超过 100 MiB 的 PDF 文件。");
    data = await readFile(path, { signal });
  } else {
    const response = await fetcher(url, { signal: deadline(signal, 120_000), redirect: "follow", headers: { Accept: "application/pdf", "User-Agent": "DeepSeek-PDF-Summary/1.0" } });
    if (!response.ok) throw new Error(`PDF 下载失败（HTTP ${response.status}）。若需要登录，请下载后选择本地 PDF。`);
    if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); throw new Error("PDF 超过 100 MiB，请选择更小的文件。"); }
    if (!response.body) throw new Error("服务器没有返回 PDF 内容。");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("PDF 超过 100 MiB。"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    data = new Uint8Array(size); let offset = 0;
    for (const c of chunks) { data.set(c, offset); offset += c.length; }
  }
  if (!Buffer.from(data.subarray(0, 1024)).includes(Buffer.from("%PDF-")))
    throw new Error("读取到的内容不是 PDF，可能是登录页或下载入口。请下载实际 PDF 后选择本地文件。");
  return data;
}
function deadline(signal: AbortSignal | undefined, ms: number) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}
function apiError(status: number, stage: string) {
  const hints: Record<number, string> = { 400: "请检查 PDF 是否损坏、加密或超过解析限制。", 401: "API Key 无效。", 402: "DeepSeek 余额不足。", 413: "文件过大。", 429: "请求过于频繁，请稍后重试。", 500: "文件解析或服务暂时异常。", 503: "服务繁忙，请稍后重试。", 504: "解析或生成超时，请使用更小的 PDF。" };
  return new Error(`${stage}失败（HTTP ${status}）。${hints[status] ?? "请稍后重试。"}`);
}
// Accept SSE chunks split at arbitrary UTF-8 and line boundaries.
export async function* events(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
      if (done) { if (buffer.startsWith("data:")) yield buffer.slice(5).trim(); break; }
    }
  } finally { reader.releaseLock(); }
}
export async function summarize(options: RunOptions): Promise<{ text: string; pdfData: Uint8Array; cleanupWarning?: string }> {
  const { source, key, prompt, signal, onStage = () => {}, onText = () => {} } = options;
  const fetcher = options.fetcher ?? fetch;
  let fileId: string | undefined; let text = ""; let cleanupWarning: string | undefined; let pdfData: Uint8Array | undefined;
  const headers = { Authorization: `Bearer ${key}` };
  try {
    onStage("正在读取 PDF…");
    const data = await pdfBytes(source, fetcher, signal); pdfData = data;
    signal?.throwIfAborted();
    onStage("正在上传并解析文字与图表…");
    const form = new FormData();
    form.append("purpose", "rich_layout_recognition");
    form.append("file", new Blob([new Uint8Array(data)], { type: "application/pdf" }), "document.pdf");
    const uploaded = await fetcher(`${API}/files`, { method: "POST", headers, body: form, redirect: "error", signal: deadline(signal, 270_000) });
    if (!uploaded.ok) throw apiError(uploaded.status, "上传解析");
    const file = await uploaded.json() as { id?: string; error?: unknown };
    if (file.error || typeof file.id !== "string" || !/^file-api-[\w-]+$/.test(file.id)) throw new Error("DeepSeek 未返回有效文件 ID，解析未完成。");
    fileId = file.id;
    onStage("正在深度思考并生成摘要…");
    const response = await fetcher(`${API}/chat/completions`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, redirect: "error",
      signal: deadline(signal, 600_000), body: JSON.stringify({
        model: "deepseek-flash", thinking: { type: "enabled" }, reasoning_effort: "high", max_tokens: 12000, stream: true,
        messages: [{ role: "system", content: prompt }, { role: "user", content: [{ type: "file", file_id: fileId }, { type: "text", text: "请按要求总结这份 PDF。" }] }],
      }),
    });
    if (!response.ok) throw apiError(response.status, "生成摘要");
    if (!response.body) throw new Error("DeepSeek 没有返回内容。");
    let finish: string | undefined;
    for await (const event of events(response.body)) {
      if (event === "[DONE]") break;
      let chunk;
      try { chunk = JSON.parse(event); } catch { throw new Error("返回数据不完整，请重试。"); }
      if (chunk.error) throw new Error("DeepSeek 生成过程中发生错误，请重试。");
      for (const choice of chunk.choices ?? []) {
        if (choice.delta?.content) { text += choice.delta.content; onText(text); }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }
    if (finish !== "stop") throw new Error(finish === "length" ? "摘要生成达到长度限制，当前内容不完整。" : "生成中断或被拒绝，当前内容不是完整摘要。");
    if (!text.trim()) throw new Error("DeepSeek 返回了空摘要，请重试。");
  } finally {
    if (fileId) {
      onStage("正在清理本次上传的临时文件…");
      try {
        const deleted = await fetcher(`${API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers, redirect: "error", signal: AbortSignal.timeout(20_000) });
        const result = deleted.ok ? await deleted.json() as { deleted?: boolean } : undefined;
        if (!result?.deleted) throw new Error("cleanup");
      } catch { cleanupWarning = "本次上传文件未能自动清理，请在 DeepSeek 文件管理中检查。"; }
      if (cleanupWarning) onStage(cleanupWarning);
    }
  }
  return { text, pdfData: pdfData!, cleanupWarning };
}
export function sourceTitle(source: Source): string {
  if (source.title) return source.title;
  try { return decodeURIComponent(basename(new URL(source.url).pathname)) || "PDF"; } catch { return "PDF"; }
}
