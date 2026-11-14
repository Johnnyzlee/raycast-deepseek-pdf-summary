import { Action, ActionPanel, BrowserExtension, Clipboard, Detail, Form, Icon, List, Toast, environment, open, showToast } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { configuredKey, normalizeSource, sourceTitle, summarize, Source } from "./core";
import { AI_CHAT_URL, buildChatContext, buildLocalChatContext, coverageWarning, extractForChat } from "./chat-context";
import { LocalPDF, savePDF } from "./pdf-library";

function Input({ note, onChoose }: { note?: string; onChoose: (s: Source) => void }) {
  const [error, setError] = useState<string>();
  return <Form actions={<ActionPanel><Action.SubmitForm title="解析并总结 PDF" icon={Icon.Document} onSubmit={(v: { url: string; files: string[] }) => {
    try { const input = v.files?.[0] ? pathToFileURL(v.files[0]).href : v.url; onChoose({ url: normalizeSource(input) }); }
    catch (e) { setError((e as Error).message); }
  }} /></ActionPanel>}>
    <Form.Description title="DeepSeek PDF 总结" text={note || "输入 PDF 链接，或选择本地 PDF。运行后会将文件上传到 DeepSeek，按你的总结要求生成中文摘要。"} />
    <Form.TextField id="url" title="PDF 链接" placeholder="https://example.com/paper.pdf" error={error} onChange={() => setError(undefined)} />
    <Form.FilePicker id="files" title="本地 PDF" allowMultipleSelection={false} canChooseDirectories={false} />
    <Form.Description text="需要登录的链接请先下载，再选择本地文件。默认解析文字与图表，使用现有 DeepSeek API Key。" />
  </Form>;
}

function Summary({ source, onBack }: { source: Source; onBack: () => void }) {
  const [text, setText] = useState(""); const [stage, setStage] = useState("准备读取 PDF…");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(true); const [warning, setWarning] = useState("");
  const [pdfData, setPdfData] = useState<Uint8Array>();
  const [chatBusy, setChatBusy] = useState(false); const [chatNote, setChatNote] = useState("");
  const chatContext = useRef<{ local?: string; ocr?: string }>({});
  const [localPDF, setLocalPDF] = useState<LocalPDF>();
  const chatCoverage = useRef("");
  const chatLock = useRef(false); const chatAbort = useRef<AbortController | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    let mounted = true;
    async function run() {
      try {
        const key = await configuredKey();
        const prompt = await readFile(join(environment.assetsPath, "prompt.txt"), "utf8");
        abort.signal.throwIfAborted();
        const result = await summarize({ source, key, prompt, signal: abort.signal,
          onText: (t) => { if (mounted) setText(t); }, onStage: (s) => { if (mounted) setStage(s); } });
        if (mounted) { setPdfData(result.pdfData); setWarning(result.cleanupWarning ?? ""); setStage("总结完成"); }
      } catch (e) {
        if (mounted) setError(abort.signal.aborted ? "已取消。" : e instanceof Error && e.name === "TimeoutError" ? "处理超时，请稍后重试，或使用更小的 PDF。" : e instanceof Error ? e.message : "处理失败，请重试。");
      } finally { if (mounted) setBusy(false); }
    }
    void run();
    return () => { mounted = false; abort.abort(); chatAbort.current?.abort(); };
  }, [source.url]);
  async function continueInChat(includeOCR = false) {
    if (chatLock.current || !pdfData) return;
    chatLock.current = true; setChatBusy(true);
    const abort = new AbortController(); chatAbort.current = abort;
    try {
      setChatNote("正在将这份 PDF 保存到本地阅读文件夹…");
      const local = await savePDF(source, pdfData);
      setLocalPDF(local);
      abort.signal.throwIfAborted();
      chatContext.current.local = buildLocalChatContext(source, text, local);
      if (includeOCR && !chatContext.current.ocr) {
        setChatNote("正在准备逐页原文，完成后将复制原文和摘要并打开 AI Chat…");
        const pages = await extractForChat(pdfData, await configuredKey(), fetch, abort.signal);
        chatCoverage.current = coverageWarning(pages);
        chatContext.current.ocr = buildChatContext(source, text, pages, local);
      }
      abort.signal.throwIfAborted();
      await Clipboard.copy(includeOCR ? chatContext.current.ocr! : chatContext.current.local);
      setChatNote(`${includeOCR && chatCoverage.current ? chatCoverage.current + "\n\n" : ""}PDF 已保存：\n${local.path}\n\n摘要、原始地址和本地路径${includeOCR ? "、OCR 文字" : ""}已复制。在 AI Chat 新建对话，粘贴并发送；需要核对原文时，让 Finder 工具读取这个本地路径。`);
      await showToast({ style: Toast.Style.Success, title: "本地 PDF 与阅读资料已准备好", message: "在 AI Chat 粘贴并发送；阅读原文时使用 Finder 文件工具。" });
      await open(AI_CHAT_URL);
    } catch (e) {
      const message = abort.signal.aborted ? "已取消准备原文。" : e instanceof Error ? e.message : "未能准备原文，请重试。";
      setChatNote(message);
      await showToast({ style: Toast.Style.Failure, title: "未完成 AI Chat 交接", message });
    } finally { chatLock.current = false; setChatBusy(false); }
  }
  const status = error ? `> **未完成：** ${error}\n\n` : busy ? `*${stage}*\n\n` : "";
  const markdown = `${status}${text}${warning ? `\n\n> ${warning}` : ""}${chatNote ? `\n\n---\n\n${chatNote}` : ""}`;
  return <Detail isLoading={busy || chatBusy} navigationTitle={sourceTitle(source)} markdown={markdown} actions={<ActionPanel>
    {!busy && !error && pdfData && !chatBusy && <Action title="在 AI Chat 中继续（本地 PDF）" icon={Icon.Message} shortcut={{ modifiers: ["cmd"], key: "j" }} onAction={() => continueInChat(false)} />}
    {!busy && !error && pdfData && !chatBusy && <Action title="在 AI Chat 中继续（附 OCR 文字）" icon={Icon.Document} shortcut={{ modifiers: ["cmd", "shift"], key: "j" }} onAction={() => continueInChat(true)} />}
    {localPDF && <Action.ShowInFinder title="显示已保存的 PDF" path={localPDF.path} />}
    {localPDF && <Action.CopyToClipboard title="复制本地 PDF 路径" content={localPDF.path} />}
    {chatBusy && <Action title="取消准备原文" icon={Icon.XMarkCircle} onAction={() => chatAbort.current?.abort()} />}
    {text && <Action.CopyToClipboard title={busy || error ? "复制当前内容（未完成）" : "复制摘要"} content={text} />}
    {busy && <Action title="取消生成" icon={Icon.XMarkCircle} onAction={() => controller.current?.abort()} />}
    {!busy && !chatBusy && <Action title="选择其他 PDF" icon={Icon.Document} onAction={onBack} />}
    <Action.OpenInBrowser title="打开原 PDF" url={source.url} />
  </ActionPanel>} />;
}

export default function Command() {
  const [loading, setLoading] = useState(true); const [source, setSource] = useState<Source>();
  const [tabs, setTabs] = useState<BrowserExtension.Tab[]>([]); const [note, setNote] = useState<string>();
  useEffect(() => {
    let mounted = true;
    async function detect() {
      try {
        if (!environment.canAccess(BrowserExtension)) {
          if (mounted) setNote("暂时无法访问 Raycast 浏览器扩展。可以直接粘贴当前 PDF 的地址，或选择本地 PDF。");
          return;
        }
        const active = (await BrowserExtension.getTabs()).filter((t) => t.active);
        if (!mounted) return;
        if (active.length === 1) setSource({ url: normalizeSource(active[0].url), title: active[0].title });
        else if (active.length > 1) setTabs(active);
        else setNote("没有找到活动浏览器标签页。请打开 PDF，或在这里输入链接、选择文件。");
      } catch { if (mounted) setNote("无法取得当前 PDF 地址。请粘贴浏览器地址，或选择已下载的 PDF。"); }
      finally { if (mounted) setLoading(false); }
    }
    void detect(); return () => { mounted = false; };
  }, []);
  if (loading) return <Detail isLoading markdown="正在获取当前浏览器标签页…" />;
  if (source) return <Summary key={source.url} source={source} onBack={() => { setSource(undefined); setTabs([]); }} />;
  if (tabs.length) return <List navigationTitle="选择要总结的 PDF 标签页" searchBarPlaceholder="检测到多个浏览器窗口，请选择 PDF">
    {tabs.map((tab) => <List.Item key={tab.id} title={tab.title || "浏览器标签页"} subtitle={tab.url} icon={Icon.Document} actions={<ActionPanel>
      <Action title="解析并总结 PDF" onAction={() => { try { setSource({ url: normalizeSource(tab.url), title: tab.title }); } catch (e) { setNote((e as Error).message); setTabs([]); } }} />
      <Action title="输入链接或选择本地 PDF" onAction={() => setTabs([])} />
    </ActionPanel>} />)}
  </List>;
  return <Input note={note} onChoose={setSource} />;
}
