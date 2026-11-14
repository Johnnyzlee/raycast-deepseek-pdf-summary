import test from "node:test";
import assert from "node:assert/strict";
import { API, events, MAX_BYTES, normalizeSource, pdfBytes, summarize } from "../src/core";

function sse(value: string) { return new Response(value, { headers: { "Content-Type": "text/event-stream" } }); }
test("rejects browser-only protocols; strips page fragments", () => {
  assert.equal(normalizeSource("https://example.org/a.pdf#page=2"), "https://example.org/a.pdf");
  assert.throws(() => normalizeSource("javascript:alert(1)"));
  assert.throws(() => normalizeSource("blob:https://example.org/abc"));
});
test("SSE preserves Unicode split across bytes and recognizes CRLF", async () => {
  const bytes = new TextEncoder().encode('data: {"text":"中文"}\r\n\r\ndata: [DONE]\n');
  const stream = new ReadableStream<Uint8Array>({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } });
  const result = []; for await (const e of events(stream)) result.push(e);
  assert.deepEqual(result, ['{"text":"中文"}', '[DONE]']);
});
test("rejects login HTML and oversized downloads before upload", async () => {
  await assert.rejects(pdfBytes({ url: "https://example.org/a.pdf" }, async () => new Response("<html>login</html>")), /不是 PDF/);
  await assert.rejects(pdfBytes({ url: "https://example.org/a.pdf" }, async () => new Response("", { headers: { "content-length": String(MAX_BYTES + 1) } })), /100 MiB/);
});
test("uploads PDF in correct field order, summarizes by file ID, cleans only its own upload", async () => {
  const requests: string[] = []; const snippets: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "https://example.org/a.pdf") { assert.equal(init?.headers && "Authorization" in init.headers, false); return new Response("%PDF-1.4\nfixture"); }
    if (url === `${API}/files`) {
      const form = init?.body as FormData;
      assert.deepEqual(Array.from(form.keys()), ["purpose", "file"]);
      assert.equal(form.get("purpose"), "rich_layout_recognition");
      return Response.json({ id: "file-api-test" });
    }
    if (url === `${API}/chat/completions`) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.messages[1].content[0].file_id, "file-api-test");
      assert.equal(body.thinking.type, "enabled"); assert.equal(body.tools, undefined);
      return sse('data: {"choices":[{"delta":{"content":"摘要"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n');
    }
    assert.equal(url, `${API}/files/file-api-test`); assert.equal(init?.method, "DELETE");
    return Response.json({ deleted: true });
  };
  const result = await summarize({ source: { url: "https://example.org/a.pdf" }, key: "test", prompt: "总结", fetcher, onText: (t) => snippets.push(t) });
  assert.equal(result.text, "摘要"); assert.deepEqual(snippets, ["摘要"]); assert.equal(requests.length, 4);
});
test("an interrupted response fails, but the uploaded file is still cleaned", async () => {
  let cleaned = false;
  const fetcher: typeof fetch = async (input, init) => {
    if (init?.method === "DELETE") { cleaned = true; return Response.json({ deleted: true }); }
    if (String(input).endsWith("/files")) return Response.json({ id: "file-api-test" });
    if (String(input).endsWith("/chat/completions")) return sse('data: {"choices":[{"delta":{"content":"半段"}}]}\n\n');
    return new Response("%PDF-1.4\nfixture");
  };
  await assert.rejects(summarize({ source: { url: "https://example.org/a.pdf" }, key: "test", prompt: "总结", fetcher }), /生成中断/);
  assert.equal(cleaned, true);
});
