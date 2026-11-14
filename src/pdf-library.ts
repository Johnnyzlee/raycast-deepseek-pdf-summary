import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Source, sourceTitle } from "./core";

export const PDF_LIBRARY = join(homedir(), "Downloads", "Raycast PDF Library");
export type LocalPDF = { path: string; fileUrl: string; originalUrl: string; sha256: string };

function filename(source: Source, digest: string): string {
  const title = sourceTitle(source).replace(/\.pdf$/i, "").normalize("NFC")
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_").replace(/^\.+|[. ]+$/g, "").trim();
  // Keep Unicode titles readable while staying under common filename byte limits.
  let short = "";
  for (const char of title) { if (Buffer.byteLength(short + char) > 140) break; short += char; }
  return `${short || "PDF"}--${digest.slice(0, 16)}.pdf`;
}

async function atomicWrite(path: string, data: string | Uint8Array) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, data, { mode: 0o600, flag: "wx" }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}

export async function savePDF(source: Source, data: Uint8Array, directory = PDF_LIBRARY): Promise<LocalPDF> {
  if (!Buffer.from(data.subarray(0, 1024)).includes(Buffer.from("%PDF-"))) throw new Error("当前内容不是 PDF，无法保存原文。");
  const digest = createHash("sha256").update(data).digest("hex");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, filename(source, digest));
  let existing: Buffer | undefined;
  try { existing = await readFile(path); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (existing && createHash("sha256").update(existing).digest("hex") !== digest)
    throw new Error("同名本地文件内容发生了变化，为避免覆盖已停止保存。请先移走该文件再重试。");
  if (!existing) await atomicWrite(path, data);
  const metadataPath = `${path}.source.json`;
  let origins: string[] = [];
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    if (Array.isArray(metadata.sources)) origins = metadata.sources.filter((s: unknown) => typeof s === "string");
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT" && !(e instanceof SyntaxError)) throw e; }
  await atomicWrite(metadataPath, JSON.stringify({ title: sourceTitle(source), sources: [...new Set([...origins, source.url])], sha256: digest, bytes: data.byteLength, updatedAt: new Date().toISOString() }, null, 2));
  return { path, fileUrl: pathToFileURL(path).href, originalUrl: source.url, sha256: digest };
}

export function localPDFContext(local: LocalPDF): string {
  return [
    "## PDF 原文件位置",
    `原始地址：${local.originalUrl}`,
    `本地绝对路径（供 Finder 文件工具读取）：\n${local.path}`,
    `本地文件 URL：\n${local.fileUrl}`,
    "本地 PDF 是生成摘要时使用的同一份文件，包含原始页面和图表。上述路径只是文件位置，不代表你已经读取了文件。",
    "当我要求阅读原文、查看具体页面或核对图表时，请使用可用的 Finder／文件读取工具读取上述本地绝对路径，不要把网页 URL 当成已上传的文件。若工具不可用或读取失败，请明确说明，并请我把此 PDF 作为附件添加；不要声称已读原文。",
  ].join("\n\n");
}
