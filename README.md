<div align="center">

<h1>DeepSeek PDF Summary</h1>
<p>Document-aware summaries and a clear path to follow-up reading.</p>
<p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
<p><a href="#installation-and-configuration">Installation</a> · <a href="#usage">Usage</a> · <a href="#architecture">Architecture</a> · <a href="#storage-and-data-handling">Data handling</a> · <a href="#development">Development</a></p>
<sub>macOS · Raycast · DeepSeek API · MIT License</sub>

</div>

---

Raycast command: **PDF summary by DeepSeek for lzengan**. This is a source-installed macOS Raycast extension with its own summary view, not a native AI Command or Script Command. It runs on demand and calls DeepSeek directly. **No local proxy or background service is required.**

## Why this project

PDF reading often starts with an overview and continues with specific questions. A browser URL does not necessarily give a model access to the file, while text-only extraction can omit figures. Repeated downloads and manual context preparation make the transition from summary to detailed reading cumbersome.

This extension connects those steps: obtain the actual PDF bytes, use DeepSeek's document parsing and reasoning to summarize them in Raycast, then optionally save **the same file used for that summary** and prepare context for a conversation.

It supports reading beyond academic papers. The default Chinese prompt adapts its structure to the material and distinguishes claims from evidence. Parsing and summaries can still omit details; check important conclusions against the original.

## Features

| Action | Result | Additional processing |
| --- | --- | --- |
| Run the summary command | A streaming Chinese summary in Raycast, available to copy | Upload the PDF for parsing and call the model |
| **⌘J: Continue in AI Chat with local PDF** | Save the original; copy summary, source, local paths, and reading instructions; open AI Chat | No extra OCR call; paste and send manually |
| **⌘⇧J: Continue with OCR text** | Add page-by-page OCR text to those materials | Upload the same PDF to the OCR endpoint, with additional charges |

Summarization works independently. Chat handoff is optional: it does not automatically insert messages into chat history or establish that the chat model has read the local PDF.

## Architecture

```text
Browser PDF URL / manually entered direct URL / local PDF
  → Read or download bytes; check size and PDF signature
  → Upload to DeepSeek Files API for document parsing
  → Request a reasoning-enabled summary using the file_id
  → Stream answer text into Raycast
  → Attempt to delete this run's temporary uploaded file

Optional follow-up:
  Same PDF bytes → local PDF Library
  Summary + source + local paths [+ optional OCR text]
    → clipboard → open AI Chat → user pastes and sends
```

1. **Choose a source.** Read active browser tabs, offering a choice when several windows have active tabs. Alternatively, accept a direct HTTP(S) PDF URL or local file. Check supported address types and the `%PDF-` signature so that a login page is not treated as a PDF.
2. **Read and parse.** Read/download a PDF up to 100 MiB. Upload to `https://api.deepseek.com/files` with `purpose: rich_layout_recognition` for text and figure parsing, rather than only extracting text locally.
3. **Summarize.** Send the file ID and [Chinese prompt](assets/prompt.txt) to `/chat/completions`. The model is fixed to `deepseek-flash`, with thinking enabled and `reasoning_effort: high`. Display streamed answer text, not raw reasoning. This request includes neither web search nor Raycast client tools.
4. **Finish or report failure.** Only a nonempty answer ending normally counts as complete. Cancellation, interruption, or a length limit is reported. Once a valid file ID is known, attempt deletion on both success and failure; do not delete unrelated account files.
5. **Hand off on request.** Save locally only when a follow-up action is selected. Reuse the bytes from this summary instead of downloading a potentially changed document again.

## Installation and configuration

Requirements: macOS, Raycast, **Node.js 22.22.2 or newer**, and your own DeepSeek API key with available balance. The project pins Raycast API 1.104.24; use a compatible Node.js LTS release.

### 1. Install the extension

```sh
git clone https://github.com/Johnnyzlee/raycast-deepseek-pdf-summary.git
cd raycast-deepseek-pdf-summary
node --version
npm ci
npm run dev
```

Alternatively, choose **Code → Download ZIP** on GitHub, extract it, and run the npm commands from the directory containing `package.json`. Git is unnecessary for that route.

Keep Raycast open until the build succeeds and the command appears in search. Press **Control-C** to stop the watcher. Normal use does not require a terminal or development process to stay running.

### 2. Supply your own API key

The extension reads the current user's `~/.config/raycast/ai/providers.yaml`; it does not depend on the author's machine or credentials. An existing provider with `id: deepseek` may already be sufficient.

This example contains **only the fields needed for this extension to read a key**, not a complete Raycast AI model configuration. Create the parent directory and file if absent. If it exists, merge the relevant fields without replacing other providers or models.

```yaml
providers:
  - id: deepseek
    api_keys:
      deepseek: YOUR_DEEPSEEK_API_KEY
```

Replace the placeholder locally and never commit your real key. You can restrict permissions with `chmod 600 ~/.config/raycast/ai/providers.yaml`.

Key selection: find the `deepseek` provider, then use the alias named by its `deepseek-flash` model's `provider` field. If no such model is configured, use the first key in `api_keys`. The extension neither rewrites the configuration nor saves a second copy of the key.

**Only the key is reused, not all provider settings.** The endpoint is fixed to `https://api.deepseek.com` and the model to `deepseek-flash`. A custom or localhost URL configured for AI Chat does not change this extension’s direct connection. YAML endpoint or reasoning changes do not alter these requests.

### 3. Connect optional browser and chat features

Automatic tab detection needs [Raycast Browser Extension](https://www.raycast.com/browser-extension). Manual direct URLs and local files remain usable when browser access is unavailable.

Summarization does not require AI Chat. Handoff requires AI Chat to be available in your Raycast setup; reading the saved file also depends on the selected model and file tools. Installation does not unlock account features or change model/tool switches.

## Usage

1. Open a PDF in the browser and run **PDF summary by DeepSeek for lzengan**. A single active tab starts processing immediately; choose the correct tab when several are listed.
2. If detection or downloading fails, choose another PDF and supply its direct URL or a local file. Download authenticated documents yourself first.
3. Read the summary, copy it from the action menu, open the original, or continue in chat.

### Default handoff: save the original for follow-up

After completion, press **⌘J**. The extension saves the file, copies reading materials, and opens AI Chat. **Create a conversation, paste with ⌘V, and send.**

The materials contain the existing summary, original source, absolute local path, `file://` URL, and reading instructions. A path is not an attached file. You can then ask the chat to read that PDF, explain a page, and check its figures.

Reading figures requires actual document/vision support on the chat side. Finder locating a file does not mean its text extraction contains every image. Use a chat-side file tool that can upload and parse the original PDF, or attach the saved file manually if your chat setup supports it.

The summary workflow has already attempted to delete its temporary upload. Later full-document reading requires a fresh read/upload by the chat-side tool and may incur additional charges. This extension does not treat a deleted file ID as persistent context.

If AI Chat does not open, open it manually and paste; the materials may already be on the clipboard. The extension does not insert an assistant message or edit existing chat history.

### Optional handoff: include page-by-page OCR text

Press **⌘⇧J** to additionally request `/v1/tools/ocr` with `text_recognition` and copy the returned page text. This provides text context directly, but **does not include original images** and cannot replace visual reading.

Repeated use in the same summary view reuses prepared OCR materials; exiting discards that text cache. Truncated pages are marked both in an initial warning and on the affected pages. Missing pages, abnormal status, or an entirely textless result prevent handoff. Materials exceeding 200,000 characters are rejected with a message rather than silently truncated. Page numbers count from 1 in file order and may differ from printed numbers.

## Storage and data handling

Summarization alone keeps the downloaded bytes and answer in the current view without automatically saving a local reading copy. Either chat-handoff action creates:

```text
~/Downloads/Raycast PDF Library/
├── Document title--a1b2c3d4e5f67890.pdf
└── Document title--a1b2c3d4e5f67890.pdf.source.json
```

The suffix is the first 16 characters of the content's SHA-256. Matching title and content reuse a file; changed content gets a separate file. If a preexisting file was manually modified and its checksum no longer matches, the extension refuses to overwrite it. Provenance includes title, source list, checksum, byte count, and update time. Files remain until manually removed; copy summaries yourself if you want to retain them. Actions can reveal the saved PDF and copy its path.

| Data or operation | Destination and purpose |
| --- | --- |
| API key | Read from local YAML; used for DeepSeek requests, never sent to the PDF download host |
| PDF download | Request the supplied URL and follow redirects; no browser cookies are read or forwarded |
| Parsing and summary | Send the PDF, prompt, and file ID to official DeepSeek endpoints; this is not offline processing |
| Optional OCR | Send the same PDF to the official OCR endpoint, with additional charges |
| Local storage | Current user's PDF Library, only during handoff; no scheduled cleanup |
| Follow-up chat | Clipboard first; after you send, handled by your selected chat model and service |

There is no author-operated relay or startup service. Newly created library directories and files use restricted permissions, but existing parent-directory permissions are not changed. Source URLs may include query parameters; handoff materials also expose local paths. Review them before sharing.

Temporary-file deletion is **best effort**. Forced termination, network errors, or a server accepting an upload without returning its ID can prevent cleanup. A deletion request is not a guarantee about all provider retention; the provider's policies still apply. Upload only documents you are entitled to send to that service.

## Limitations and troubleshooting

- PDF only: no Word, PowerPoint, or standalone image inputs. Server parsing and model context limits also apply; 100 MiB is the extension's own size limit.
- A browser viewer address may not be a file URL. `blob:` URLs, CAPTCHAs, and login/download landing pages may fail. Download the PDF yourself and choose the local file.
- Parsing may miss figures or scanned content. Encrypted, damaged, or very long files may fail. A summary is not a replacement for the full document.
- Parsing, model tokens, and optional OCR use your DeepSeek balance. Later AI Chat costs and limits depend on its configuration. This extension does not estimate charges.
- For `401`, check the key; for `402`, check balance; for `429`, retry later. Try smaller files after timeouts. Cancellation does not guarantee that already-started API work is free.
- A copied local path is not an automatic attachment. If the model cannot see the document, check its file tools or attachment support.

## Development

Edit the cloned/extracted source. Raycast's `~/.config/raycast/extensions/deepseek-pdf-summary/` is generated installation output, not the source of truth.

```sh
git pull --ff-only             # Git clones with no conflicting local edits
npm ci
npm run typecheck
npm test
npm run build
npm run dev                   # Sync into Raycast; stop watcher after success
```

To change summary style, edit [assets/prompt.txt](assets/prompt.txt) and rebuild with the development command. Model, endpoint, and reasoning changes require editing source request settings, not only YAML.

| File | Responsibility |
| --- | --- |
| [src/summarize-pdf.tsx](src/summarize-pdf.tsx) | Tab detection, file selection, summary UI, and handoff actions |
| [src/core.ts](src/core.ts) | Credentials, PDF validation, official API requests, streaming, and upload cleanup |
| [src/pdf-library.ts](src/pdf-library.ts) | Save original bytes, validate existing files, and record provenance |
| [src/chat-context.ts](src/chat-context.ts) | Follow-up materials, optional OCR, and completeness warnings |
| [assets/prompt.txt](assets/prompt.txt) | Chinese summary instructions |
| [tests/](tests/) | Mocked responses and temporary files; no real API key required |

Tests cover validation, stream fragments, upload/cleanup, OCR completeness, long-context handling, original-file reuse, and provenance. Passing types, tests, and builds does not verify every browser or PDF.

Automated checks do not invoke paid APIs. Browser tab detection, UI rendering, and provider availability require validation in the target environment.

## References and license

- [Raycast Browser Extension API](https://developers.raycast.com/api-reference/browser-extension)
- [DeepSeek document parsing](https://api-docs.deepseek.com/zh-cn/guides/document_parsing/)
- [DeepSeek pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

Code is licensed under the [MIT License](LICENSE). A personal project, not affiliated with Raycast or DeepSeek. Documents and third-party services remain subject to their own rights and terms.
