import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { savePDF } from "../src/pdf-library";
import { buildChatContext, buildLocalChatContext } from "../src/chat-context";

test("saves exact PDF snapshot, encoded file URL and original source; reuses existing file", async () => {
  const root = await mkdtemp(join(tmpdir(), "raycast-pdf-library-"));
  try {
    const data = new TextEncoder().encode("%PDF-1.4\noriginal bytes\n%%EOF");
    const source = { title: "中文 论文.pdf", url: "https://example.com/download?id=42#page=2" };
    const saved = await savePDF(source, data, root);
    assert.deepEqual(new Uint8Array(await readFile(saved.path)), data);
    assert.equal(fileURLToPath(saved.fileUrl), saved.path);
    assert.equal(saved.originalUrl, source.url);
    const again = await savePDF(source, data, root);
    assert.equal(again.path, saved.path);
    assert.equal((await readdir(root)).filter((n) => n.endsWith(".pdf")).length, 1);
    const metadata = JSON.parse(await readFile(`${saved.path}.source.json`, "utf8"));
    assert.deepEqual(metadata.sources, [source.url]);
    const context = buildLocalChatContext(source, "已有摘要", saved);
    for (const piece of [source.url, saved.path, saved.fileUrl, "已有摘要", "Finder", "不代表你已经读取了文件"])
      assert.ok(context.includes(piece));
    const ocr = buildChatContext(source, "已有摘要", [{ index: 0, text: "原文" }], saved);
    assert.ok(ocr.includes(saved.path) && ocr.includes("原文"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("sanitizes path traversal and preserves different versions without overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "raycast-pdf-library-"));
  try {
    const source = { title: "../../坏标题/论文.pdf", url: "https://example.com/a.pdf" };
    const a = await savePDF(source, new TextEncoder().encode("%PDF-1.4\nversion A"), root);
    const b = await savePDF(source, new TextEncoder().encode("%PDF-1.4\nversion B"), root);
    assert.equal(dirname(a.path), root); assert.equal(dirname(b.path), root); assert.notEqual(a.path, b.path);
    await writeFile(a.path, "user modified file");
    await assert.rejects(savePDF(source, new TextEncoder().encode("%PDF-1.4\nversion A"), root), /避免覆盖/);
    assert.equal(await readFile(a.path, "utf8"), "user modified file");
    await assert.rejects(savePDF(source, new TextEncoder().encode("<html>login</html>"), root), /不是 PDF/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
