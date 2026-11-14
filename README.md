# PDF summary by DeepSeek for lzengan

macOS 上的 Raycast 扩展：读取当前浏览器中的 PDF，用 DeepSeek 图文解析与深度思考生成中文摘要，再将摘要和本地 PDF 路径交给 Raycast AI Chat 继续追问。按需运行，无本地转发、无常驻服务。

这是可从源码安装的完整扩展，不是原生 AI Command，也不是 Script Command。

## 安装与 API Key

需要 macOS、Raycast，以及 Node.js **22.22.2 或更新版本**（本项目固定使用 `@raycast/api` 1.104.24）。DeepSeek API 需要可用余额，文档解析和模型调用单独计费。

```sh
git clone https://github.com/Johnnyzlee/raycast-deepseek-pdf-summary.git
cd raycast-deepseek-pdf-summary
npm ci
npm run dev
```

保持 Raycast 打开，等待构建成功且命令出现在 Raycast 中，再按 Control-C 停止开发监听。之后日常运行命令不需要终端或开发进程常驻。也可以下载 GitHub Release 的源代码 ZIP，解压后在源码目录执行 `npm ci` 和 `npm run dev`。

此扩展从本机 `~/.config/raycast/ai/providers.yaml` 读取密钥：查找 `id: deepseek` 的 provider；优先使用 `deepseek-flash` 模型的 `provider` 字段对应的 API Key，否则使用该 provider 的第一个 Key。不会将你的配置文件上传到 GitHub。

如果已经配置了 DeepSeek，通常无需修改。以下仅展示**扩展读取密钥所需的字段**，不是完整的 Raycast AI 模型配置模板。请合并到已有配置中，不要覆盖其他 providers 或模型设置；没有该文件时，可创建父目录和此文件供扩展读取。

```yaml
providers:
  - id: deepseek
    api_keys:
      deepseek: YOUR_DEEPSEEK_API_KEY
```

在本机把占位符替换为自己的 Key，妥善限制配置文件的读取权限，不要把真实密钥提交到仓库。扩展固定直连 `https://api.deepseek.com`，摘要使用 `deepseek-flash`，不会跟随 YAML 中的自定义地址或其他模型。

自动取得浏览器标签页需要 [Raycast Browser Extension](https://www.raycast.com/browser-extension)。无法取得标签页时，可以粘贴 PDF 直链或选择本地 PDF。AI Chat 交接需要你能使用 Raycast AI Chat；读取本地原文还取决于聊天模型及 Finder／文件工具的支持。

## 使用

1. 在浏览器中打开 PDF，并切到该标签页。
2. 唤出 Raycast，搜索 **PDF summary by DeepSeek for lzengan**（也可搜索 `PDF` 或 `DeepSeek`）。
3. 运行命令，等待下载、图文解析和深度思考总结。摘要会逐步显示在 Raycast 中。
4. 在动作菜单中选择 **复制摘要**。生成中可以选择 **取消生成**。

## 在 Raycast AI Chat 中继续追问

摘要完成后，按 **⌘J**，或在动作菜单中选择 **在 AI Chat 中继续（本地 PDF）**。

1. 将刚才用于生成摘要的同一份 PDF 保存到 `~/Downloads/Raycast PDF Library/`。不会重新下载可能已经变化的网页文件。
2. 将 **已有摘要、原始网址、本地绝对路径、file:// URL 和原文阅读说明** 一起复制到剪贴板，并打开 Raycast AI Chat。
3. 在 AI Chat 中新建对话，按 **⌘V** 粘贴并发送。需要阅读原文时，要求 Finder／文件读取工具读取材料中的本地绝对路径，例如：“请用 Finder 读取上面的本地 PDF，解释第 3 页的方法。”

请在聊天中选择支持 Finder 工具的模型并启用该工具。写入一个本地路径并不等于模型已经读取了文件；如果 Finder 不可用，可以把保存的 PDF 手动作为附件加入。此命令不会修改你的模型或插件开关。

文件名包含标题和内容校验值，相同标题和相同内容复用同一文件，内容变化会保存为另一份文件。每份 PDF 旁边有 `.source.json`，记录原始网址、内容校验值和文件大小。本地文件会保留，退出命令不会删除；不再需要时可手动清理。摘要页面还有 **显示已保存的 PDF** 和 **复制本地 PDF 路径** 动作。

当前版本的扩展 API 没有公开的原生聊天记录导入接口，因此这里不是把外部生成结果写成一条原生 assistant 消息；需要你粘贴并发送一次。若聊天窗口未自动打开，手动运行 Raycast 的 **AI Chat** 命令即可，准备好的内容仍在剪贴板上。

默认的本地 PDF 交接不调用第二次 OCR，因此不产生额外 OCR 费用。摘要与路径会留在剪贴板和你发送的聊天中，PDF 保存在上述本地文件夹。

### 可选：同时携带 OCR 文字

按 **⌘⇧J**，或选择 **在 AI Chat 中继续（附 OCR 文字）**，会在保存本地 PDF 的基础上额外调用 DeepSeek OCR，将逐页文字一并复制。此步骤额外产生一次 OCR 费用。同一个摘要视图中重复使用该动作会复用已准备的 OCR 结果；退出命令后不保留文字缓存。

后续聊天依据的是 **逐页 OCR 文字和已有摘要**，原始图像不会随文字传入。图表细节可能丢失，追问时应以可识别的文字为准。个别页面 OCR 被截断时，会在资料开头和对应页明确标记，不能把这些页面视为完整原文。OCR 返回缺页、异常状态或整份文档没有文字时不会交接；材料超过 200,000 字符时会明确提示，不会偷偷截断。

浏览器取址使用 Raycast BrowserExtension 接口。多个窗口都有活动标签页时，会列出候选标签页让你选择，避免误读其他窗口。浏览器接口不可用时，可直接粘贴 PDF 链接或选择本地文件。

## 已配置的行为

- 读取 `~/.config/raycast/ai/providers.yaml` 中 `deepseek` provider 的 API Key，不另存密钥。
- 所有模型请求直连 `https://api.deepseek.com`。
- Files API 使用 `rich_layout_recognition`，识别文字与图表。
- 使用 `deepseek-flash`，开启深度思考，思考强度为 `high`。
- 总结依据 PDF，不启用联网搜索或其他插件。
- 摘要使用面向快速理解的中文总结提示词，保存在 `assets/prompt.txt`。
- 仅生成摘要时不保存 PDF；进入 AI Chat 继续阅读时，将原始 PDF 和来源信息保存到 `~/Downloads/Raycast PDF Library/`。摘要需要手动复制保留。
- 对于已获得文件 ID 的本次上传，在成功或失败后尝试删除临时上传文件，不处理账号中的其他文件。若进程被强行终止，或上传中断时服务端已完成解析但尚未返回 ID，自动清理无法保证完成。

## 限制

- 支持可直接下载的 HTTP(S) PDF 链接，以及本机 PDF 文件；最大 100 MiB，服务端解析最多 1,000 页，实际还受解析时间和模型上下文限制。
- 不读取浏览器 Cookie。登录、验证码、临时 `blob:` 地址或下载入口页面可能无法直接下载；请先保存 PDF，然后在命令里选择本地文件。
- 浏览器中的 PDF 可被下载，不代表所有图表都能被服务端识别。总结只应依据成功解析的内容。
- 使用你的 DeepSeek 余额，产生文档解析与模型 Token 费用。
- 此命令先在独立 Raycast 视图显示摘要，可通过上面的动作把摘要和原文交接到 AI Chat；不会自动修改已有聊天历史。

## 验证记录

- TypeScript 检查和 Raycast 构建通过。
- 12 项自动测试覆盖：PDF 类型/大小校验、UTF-8 流式响应分片、上传字段顺序、文件 ID 引用、错误响应、临时文件清理、OCR 页码与完整性、不完整页标记、超长原文拒绝截断、原始 PDF 快照复用、本地保存字节一致性、路径编码、来源记录、文件版本隔离和防止覆盖修改后的文件。
- 真实 OCR 验证取得公开论文的 15 页文字；其中第 13 页出现截断，已验证交接材料会明确标出该页不完整。
- 真实请求已验证公开论文 `https://arxiv.org/pdf/1706.03762` 的下载、图文解析、深度思考总结与临时文件删除。
- 已确认命令构建产物安装在 Raycast 扩展目录；未能通过界面控制工具验证浏览器取址和实际 UI 渲染。

## 修改与重新安装

请在克隆或解压的源码目录修改和重新构建。Raycast 的 `~/.config/raycast/extensions/deepseek-pdf-summary/` 是生成的安装目录，不作为源码编辑。

在本目录运行：

```sh
npm install
npm run typecheck
npm test
npm run dev
```

看到 `built extension successfully` 后按 Control-C 停止开发监听。命令仍保留在 Raycast 中，日常使用不需要开发进程运行。

修改总结风格时编辑 `assets/prompt.txt`，然后重新运行 `npm run dev` 完成同步。

## 官方资料

- [Raycast Browser Extension API](https://developers.raycast.com/api-reference/browser-extension)
- [DeepSeek 文件解析](https://api-docs.deepseek.com/zh-cn/guides/document_parsing/)
- [DeepSeek 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

## 源码结构

- `src/summarize-pdf.tsx`：Raycast 界面、浏览器取址与 AI Chat 交接。
- `src/core.ts`：密钥读取、PDF 下载、上传解析、流式摘要及临时文件清理。
- `src/pdf-library.ts`：原始 PDF 本地保存、文件校验与来源记录。
- `src/chat-context.ts`：追问资料组织与可选 OCR。
- `assets/prompt.txt`：中文总结提示词。
- `tests/`：不需要真实密钥的自动测试。

## 许可

[MIT](LICENSE)。上传的 PDF 内容及第三方服务仍适用各自的权利与使用条件。
