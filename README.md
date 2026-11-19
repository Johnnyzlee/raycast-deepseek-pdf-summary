# DeepSeek PDF Summary for Raycast

**从浏览器或本地 PDF 出发，用 DeepSeek 图文解析生成中文摘要，再带着摘要和原文件继续追问。**

简体中文（主文档） · [English](README.en.md)

Raycast 命令：**PDF summary by DeepSeek for lzengan**。这是一个从源码安装的 macOS Raycast Extension，有自己的摘要界面；不是原生 AI Command 或 Script Command。按需运行，直接请求 DeepSeek 官方 API，**不需要本地转发服务，也不需要先安装 Adapter**。

## 为什么做它

阅读 PDF 时，我通常先想弄清楚它在讲什么，再决定深入哪个问题。把浏览器链接直接发给聊天模型不一定能读到文件；只提取文字，又可能丢掉图表中的信息。读完摘要后，如果还要重新下载、找文件、复制背景，阅读过程就被打断了。

这个扩展把这些步骤连接起来：取得真正的 PDF 字节，调用 DeepSeek 的图文解析与深度思考，在 Raycast 显示摘要；需要继续阅读时，把**生成这份摘要时使用的同一份原文件**保存到固定目录，并准备好聊天材料。

它面向快速理解和后续核对，不限于论文。默认中文提示词会根据材料类型组织重点，区分观点与证据，不要求所有 PDF 都套用论文框架。解析和摘要仍可能遗漏细节，重要结论应回到原文件核对。

## 下载之后能做什么

| 操作 | 得到什么 | 额外处理 |
| --- | --- | --- |
| 运行总结命令 | Raycast 中逐步显示的中文摘要，可复制 | 上传 PDF 图文解析，并调用模型 |
| **⌘J：在 AI Chat 中继续（本地 PDF）** | 保存原文件，复制摘要、来源 URL、本地路径和阅读说明，打开 AI Chat | 不额外调用 OCR；需要手动粘贴并发送 |
| **⌘⇧J：在 AI Chat 中继续（附 OCR 文字）** | 在上述材料中增加逐页 OCR 文字 | 额外上传同一份 PDF 到 OCR 接口并计费 |

摘要可以单独使用。AI Chat 交接是可选步骤；它不把结果自动写入聊天历史，也不意味着聊天模型已经读取了本地 PDF。

## 程序实际上在做什么

```text
浏览器 PDF 地址 / 手动输入的直链 / 本地 PDF
  → 下载或读取文件，检查大小与 PDF 标记
  → 上传 DeepSeek Files API，进行图文解析
  → 用返回的 file_id 请求深度思考摘要
  → 在 Raycast 流式显示正文
  → 尝试删除本次上传的临时文件

需要继续追问时：
  同一份 PDF 字节 → 本地 PDF Library
  摘要 + 来源 + 本地路径 [+ 可选 OCR 文字]
    → 剪贴板 → 打开 AI Chat → 由用户粘贴、发送
```

1. **选定来源。** 自动取浏览器活动标签页；多个窗口有活动标签页时列出候选项。也可手动输入 HTTP(S) PDF 直链或选择本地文件。代码只接受支持的地址类型，并检查文件头中的 `%PDF-`，避免把登录页面当作 PDF。
2. **取得并解析文件。** 下载或读取不超过 100 MiB 的 PDF。向 `https://api.deepseek.com/files` 上传文件，`purpose` 为 `rich_layout_recognition`，以便解析文字与图表，而非仅在本机抽取文本。
3. **生成摘要。** 向 `/chat/completions` 发送文件 ID 和 [中文提示词](assets/prompt.txt)，固定使用 `deepseek-flash`，开启 `thinking`，`reasoning_effort` 为 `high`。界面流式显示回答正文，不展示原始思考过程；本次请求不启用联网搜索或 Raycast 本地工具。
4. **处理完成与异常。** 只有正常结束且非空的回答才视为完整摘要。生成中可取消；中断或达到长度限制时会提示不完整。取得有效文件 ID 后，无论成功或失败都会尝试删除本次临时上传，不会删除账号里的其他文件。
5. **按需交接。** 只有选择继续追问时才保存 PDF，并把阅读材料放到剪贴板。交接复用本次摘要的文件字节，不重新下载可能已经变化的网页文件。

## 安装与配置

需要 macOS、Raycast、**Node.js 22.22.2 或更新版本**，以及自己的 DeepSeek API Key 和可用余额。当前固定的 Raycast API 版本为 1.104.24，建议使用满足要求的 Node.js LTS。

### 1. 安装扩展

```sh
git clone https://github.com/Johnnyzlee/raycast-deepseek-pdf-summary.git
cd raycast-deepseek-pdf-summary
node --version
npm ci
npm run dev
```

也可以选择 GitHub 的 **Code → Download ZIP**，解压后进入包含 `package.json` 的目录，执行相同的 npm 命令；此方式不需要 Git。

保持 Raycast 打开，等待构建成功，确认能搜索到命令，再按 **Control-C** 停止开发监听。日常使用无需终端或开发进程常驻。

### 2. 配置自己的密钥

扩展读取当前用户的 `~/.config/raycast/ai/providers.yaml`，不依赖作者电脑上的目录或凭据。如果已经配置了 `id: deepseek`，通常不必另设密钥。

下面仅展示**本扩展读取密钥所需的字段**，不是完整的 Raycast AI 模型配置。没有文件时可创建父目录和文件；已有配置时请合并，保留其他 provider 和模型，不要用此片段覆盖整份配置。

```yaml
providers:
  - id: deepseek
    api_keys:
      deepseek: YOUR_DEEPSEEK_API_KEY
```

在自己的电脑上替换占位符，不要提交真实密钥。可通过 `chmod 600 ~/.config/raycast/ai/providers.yaml` 限制配置文件权限。

读取规则是：找到 `deepseek` provider，优先使用其 `deepseek-flash` 模型的 `provider` 字段所指向的 Key；没有该模型配置时，使用 `api_keys` 中的第一个 Key。扩展不会改写配置文件或另外保存密钥。

**这里复用的是密钥，不是整套模型配置。** 摘要地址固定为 `https://api.deepseek.com`，模型固定为 `deepseek-flash`。即使你的 AI Chat 通过 Adapter 使用本地地址，本扩展仍直连官方接口；修改 YAML 中的地址或思考参数不会改变本扩展的请求。

### 3. 按需连接浏览器和 AI Chat

自动取址需要 [Raycast Browser Extension](https://www.raycast.com/browser-extension)。浏览器接口不可用时，仍可手动提供 PDF 直链或本地文件。

生成摘要不依赖 AI Chat。若使用继续追问功能，需要你当前的 Raycast 配置能够使用 AI Chat；读取本地原文还取决于所选模型与文件工具。安装此扩展不会解锁账号功能，也不会自动更改模型或插件开关。

## 日常使用

1. 在浏览器打开 PDF，运行 **PDF summary by DeepSeek for lzengan**。单个活动标签页会直接开始处理；多窗口时选择对应标签页。
2. 如果取址失败或下载到的不是 PDF，可选择其他 PDF，粘贴实际直链或选择本地文件。需要登录的文件建议先自行下载。
3. 等待摘要生成，在动作菜单复制摘要、打开原 PDF，或进入后续阅读。

### 默认交接：保存原文，继续追问

摘要完成后按 **⌘J**。扩展保存文件、复制阅读材料并打开 AI Chat；**新建对话，按 ⌘V 粘贴，然后发送**。

材料包括已有摘要、原始来源、本地绝对路径、`file://` URL 和原文阅读说明。它只提供位置，不会自动附加文件。可以随后要求：“请读取上面的本地 PDF，解释第 3 页的方法，并核对图中的信息。”

要读到图表，聊天端需要真正支持 PDF 图文解析。Finder 能找到文件，不代表其文字读取结果包含全部图像；可以配合 [DeepSeek Raycast Adapter](https://github.com/Johnnyzlee/raycast-deepseek-adapter)，由本地工具定位文件，再调用 DeepSeek 原生文件阅读。若聊天端支持手动附件，也可以自行附加保存的 PDF。

摘要流程的临时文件已经尝试删除；后续原文阅读需要聊天端重新读取或上传文件，可能另外计费。本扩展不会把一个已失效的文件 ID 当作长期可用的上下文。

如果 AI Chat 没有自动打开，可手动打开并粘贴；准备好的内容可能已经在剪贴板中。扩展不会自动插入 assistant 消息或修改既有聊天历史。

### 可选交接：附带逐页 OCR 文字

按 **⌘⇧J** 会额外请求 `/v1/tools/ocr`，使用 `text_recognition`，把逐页文字一起复制。适合希望聊天直接获得文字上下文的情况；**这些文字不包含原始图像**，不能代替图表阅读。

同一个摘要视图内重复使用会复用已准备的 OCR 材料；退出后不保留这份文字缓存。页面截断会在资料开头和对应页标记；缺页、异常状态或整份文档无文字时不交接。组装材料超过 200,000 字符时会拒绝复制并提示，不会静默删掉后半部分。页码按 PDF 文件顺序从 1 开始，可能不同于印刷页码。

## 本地文件与数据去向

仅生成摘要时，下载的 PDF 和摘要保留在当前视图内，不自动保存为本地资料。选择任一种 AI Chat 交接后，会创建：

```text
~/Downloads/Raycast PDF Library/
├── 文档标题--a1b2c3d4e5f67890.pdf
└── 文档标题--a1b2c3d4e5f67890.pdf.source.json
```

后缀是内容 SHA-256 的前 16 位。相同标题和内容复用文件，内容改变则分开保存；若已有文件被手动改过且校验不符，会拒绝覆盖。来源记录包含标题、来源列表、校验值、字节数和更新时间。PDF 与来源记录会保留，直到你手动清理；摘要需要自行复制保存。动作菜单提供显示文件和复制本地路径。

| 数据或操作 | 去向与用途 |
| --- | --- |
| API Key | 从本机 YAML 读取，只用于 DeepSeek API 请求；不会发给 PDF 下载站 |
| PDF 下载 | 请求提供的 URL，可跟随重定向；不读取或携带浏览器 Cookie |
| PDF 图文解析和摘要 | PDF、提示词与文件 ID 发送到 DeepSeek 官方接口；不是离线处理 |
| 可选 OCR | 同一份 PDF 再发送到官方 OCR 接口，产生额外费用 |
| 本地保存 | 只在交接时写入当前用户的 PDF Library，无自动定时清理 |
| 后续聊天 | 先放入剪贴板；你发送后，内容由所选聊天模型和服务处理 |

本扩展没有作者运营的中转服务器，也不安装开机服务。新建资料目录和文件使用受限权限，但不会替你修改已有父目录权限。来源 URL 可能含有查询参数，材料也含有本地路径；分享来源记录或聊天内容前应检查。

临时文件删除是**尽力清理**：强制终止进程、网络故障、服务端已接受上传但未返回 ID 等情况可能无法完成。删除请求也不等于对服务提供方所有数据留存作出保证，具体由其政策决定。仅上传你有权发送给该服务的文件。

## 限制与常见问题

- 当前只处理 PDF，不接受 Word、PowerPoint 或图片文件；服务端解析和模型上下文限制仍适用，100 MiB 是本扩展的大小上限。
- 网页阅读器地址不一定是文件直链。`blob:`、验证码、登录下载入口等可能失败；先下载再选本地文件即可绕过“无法直接取到 PDF”的问题。
- 图文解析不保证识别所有图表或扫描件。加密、损坏、超长文件可能失败；摘要不是完整原文的替代品。
- 解析、模型 Token 和可选 OCR 消耗自己的 DeepSeek 余额。后续 AI Chat 的费用与限制由其配置决定；本扩展不计算费用估算。
- `401` 通常需检查 Key，`402` 检查余额，`429` 等待后重试。超时可换更小的 PDF；取消不保证已经发生的 API 调用不计费。
- 本地路径交接不等于自动上传附件；若模型说看不到文件，请检查聊天端的文件工具或手动附件能力。

## 修改、检查和更新

在克隆或解压的源码目录修改。Raycast 的 `~/.config/raycast/extensions/deepseek-pdf-summary/` 是生成的安装目录，不应当作源码维护。

```sh
git pull --ff-only             # Git 克隆且没有冲突的本地修改时
npm ci
npm run typecheck
npm test
npm run build
npm run dev                   # 把更新同步到 Raycast；成功后可停止监听
```

修改摘要风格，编辑 [assets/prompt.txt](assets/prompt.txt)，再重新开发构建。修改模型、接口或思考参数，需要编辑源码中的请求设置，不能只改 YAML。

| 文件 | 职责 |
| --- | --- |
| [src/summarize-pdf.tsx](src/summarize-pdf.tsx) | 浏览器取址、选择文件、摘要界面与交接动作 |
| [src/core.ts](src/core.ts) | 读取密钥、校验 PDF、官方 API 调用、流式响应和临时文件清理 |
| [src/pdf-library.ts](src/pdf-library.ts) | 保存原始字节、校验文件和记录来源 |
| [src/chat-context.ts](src/chat-context.ts) | 组织追问材料、可选 OCR 和完整性提示 |
| [assets/prompt.txt](assets/prompt.txt) | 中文摘要写作要求 |
| [tests/](tests/) | 使用模拟响应和临时目录的自动检查，无需真实 API Key |

测试覆盖文件校验、流式分片、上传与清理、OCR 完整性、超长材料处理、原文件复用及来源记录等。类型、测试和构建通过不代表所有浏览器和 PDF 都经过实测。

此前开发过程中已用公开论文验证过下载、图文摘要、临时文件删除与 OCR；15 页 OCR 样例的第 13 页截断，交接材料会标记不完整。这是历史验证记录，不是每次文档更新都重新调用服务；浏览器自动取址和实际 UI 渲染仍需要使用者在自己的环境中确认。

## 同一套 Raycast 阅读工具

三个项目可以独立使用，根据材料和任务选择：

| 项目 | 适合做什么 |
| --- | --- |
| [Webpage to Markdown](https://github.com/Johnnyzlee/raycast-webpage2md) | 将已打开的网页保存为本地 Markdown 和图片，不调用 AI |
| **本项目** | 从 PDF 图文生成中文摘要，再交接到 AI Chat |
| [DeepSeek Raycast Adapter](https://github.com/Johnnyzlee/raycast-deepseek-adapter) | 在同一个 AI Chat 中衔接本地工具、原生联网与文件图文问答 |

[个人 Raycast 工作流](https://johnnyzlee.github.io/blogs/arsenal/raycast-workflow.html)记录这套工具的使用背景和配置。

## 参考与许可

- [Raycast Browser Extension API](https://developers.raycast.com/api-reference/browser-extension)
- [DeepSeek 文件解析](https://api-docs.deepseek.com/zh-cn/guides/document_parsing/)
- [DeepSeek 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

代码采用 [MIT License](LICENSE)。个人项目，与 Raycast 或 DeepSeek 无隶属关系。上传的文档和第三方服务仍适用各自的权利与使用条件。
