import test from "node:test";
import assert from "node:assert/strict";
import { buildChatContext, coverageWarning, extractForChat, readPages } from "../src/chat-context";
import { API } from "../src/core";

test("sorts all OCR pages and preserves original page numbers", () => {
  const pages = readPages({ page_count: 2, pages: [{ index: 1, text: "第二页", finish_reason: "stop" }, { index: 0, text: "第一页", finish_reason: "stop" }] });
  const text = buildChatContext({ url: "https://example.com/a.pdf", title: "论文" }, "已有摘要", pages);
  assert.ok(text.includes("已有摘要") && text.includes("第一页") && text.includes("第二页"));
  assert.ok(text.indexOf("PDF 第 1 页") < text.indexOf("PDF 第 2 页"));
  assert.ok(text.includes("未包含原始图片"));
});
test("refuses missing, empty, and duplicate OCR pages", () => {
  for (const input of [
    { page_count: 2, pages: [{ index: 0, text: "x" }] },
    { page_count: 2, pages: [{ index: 0, text: "x" }, { index: 0, text: "x" }] },
    { page_count: 1, pages: [{ index: 0, text: "" }] },
  ]) assert.throws(() => readPages(input));
});
test("truncated OCR is explicitly marked in context and on affected pages", () => {
  const pages = readPages({ page_count: 1, pages: [{ index: 0, text: "部分原文", finish_reason: "length" }] });
  assert.match(coverageWarning(pages), /第 1 页 OCR 被截断/);
  const context = buildChatContext({ url: "https://example.com/a.pdf" }, "摘要", pages);
  assert.match(context, /第 1 页（OCR 截断，内容不完整）/);
  assert.match(context, /只有部分文字/);
});
test("does not silently truncate large documents", () => {
  assert.throws(() => buildChatContext({ url: "https://example.com/a.pdf" }, "摘要", [{ index: 0, text: "中".repeat(200_001) }]), /未截断/);
});
test("OCR uses the exact original PDF bytes and no Files API retention", async () => {
  let calls = 0;
  const data = new TextEncoder().encode("%PDF-test-original-snapshot");
  const pages = await extractForChat(data, "test-key", async (url, init) => {
    calls++; assert.equal(String(url), `${API}/v1/tools/ocr`);
    const form = init?.body as FormData;
    assert.equal(form.get("purpose"), "text_recognition");
    assert.deepEqual(new Uint8Array(await (form.get("file") as Blob).arrayBuffer()), data);
    return Response.json({ page_count: 1, pages: [{ index: 0, text: "已识别", finish_reason: "stop" }] });
  });
  assert.equal(calls, 1); assert.equal(pages[0].text, "已识别");
});
