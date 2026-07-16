// ============================================================
// TextExtractionService — 文档文本提取服务
//
// 职责：根据文件类型选择合适的解析器，从文档中提取纯文本
// 不负责：上传文件、调用 LLM、校验文档内容
// ============================================================

import type { FileType, ExtractedText } from "@/types";

/** 受支持的文件类型列表 */
const SUPPORTED_TYPES: FileType[] = ["pdf", "docx", "pptx", "txt", "md", "html"];

/** 文件类型的 MIME 对照 */
const MIME_MAP: Record<FileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
};

/**
 * 获取支持的文件类型列表
 *
 * 返回当前版本支持的所有文档格式。
 * 后续扩展文件类型（如 CSV、图片 OCR）时在此处添加。
 */
export function getSupportedTypes(): FileType[] {
  return [...SUPPORTED_TYPES];
}

/**
 * 根据文件扩展名推断 FileType
 *
 * @param fileName 文件名（如 "报告.pdf"）
 * @returns 对应的 FileType
 * @throws Error 如果不支持该文件类型
 */
export function inferFileType(fileName: string): FileType {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "pptx":
    case "ppt":
      return "pptx";
    case "txt":
      return "txt";
    case "md":
    case "markdown":
      return "md";
    case "html":
    case "htm":
      return "html";
    default:
      throw new Error(
        `不支持的文件格式 "${ext || "未知"}"。` +
          `支持的格式：${SUPPORTED_TYPES.join("、")}`
      );
  }
}

/**
 * 从文件中提取纯文本
 *
 * 根据 fileType 自动选择解析器，提取文档中的文本内容。
 * 图片型 PDF 暂不支持（无 OCR），会抛出明确提示。
 *
 * @param buffer 文件二进制数据
 * @param fileType 文件类型
 * @param sourceName 源文件名（仅用于记录）
 * @returns 提取后的文本内容及元信息
 */
export async function extractTextFromFile(
  buffer: Buffer,
  fileType: FileType,
  sourceName: string
): Promise<ExtractedText> {
  let text: string;

  switch (fileType) {
    case "pdf":
      text = await extractFromPdf(buffer);
      break;
    case "docx":
      text = await extractFromDocx(buffer);
      break;
    case "pptx":
      text = await extractFromPptx(buffer);
      break;
    case "txt":
      text = buffer.toString("utf-8");
      break;
    case "md":
      text = await extractFromMarkdown(buffer);
      break;
    case "html":
      text = await extractFromHtml(buffer);
      break;
    default:
      throw new Error(`不支持的文件类型: ${fileType}`);
  }

  // 清洗文本：合并多余空行、去除首尾空白
  text = cleanText(text);

  const paragraphs = text
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);

  return {
    text,
    charCount: text.length,
    paragraphCount: paragraphs.length,
    fileType,
    sourceName,
  };
}

// ===================== 私有解析实现 =====================

/**
 * 从 PDF 中提取文本
 *
 * 使用 pdf-parse 库提取文本内容。
 * 注意：扫描件/图片型 PDF 无法提取文本，会返回空字符串并附带提示。
 */
async function extractFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = require("pdf-parse");
  let pageNumber = 0;
  const data = await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: (options: object) => Promise<{ items: Array<{ str?: string }> }> }) => {
      pageNumber++;
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      return `=== 第 ${pageNumber} 页 ===\n${content.items.map((item) => item.str || "").join(" ")}`;
    },
  });
  const text = data.text || "";

  // 如果提取出的文本极少，可能是扫描件
  if (text.trim().length < 20 && data.numpages > 0) {
    return `${text}\n\n[注意：此 PDF 可能为扫描件，仅提取到 ${data.numpages} 页中的 ${text.length} 个字符。如需完整解析，请使用文字版 PDF。]`;
  }

  return text;
}

/**
 * 从 Word (.docx) 中提取文本
 *
 * 使用 mammoth 库提取纯文本。
 * mammoth 擅长提取正文，但可能丢失页眉页脚。
 */
async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = require("mammoth");
  const result = await mammoth.convertToHtml({ buffer });
  return stripHtml(result.value);
}

/**
 * 从 PowerPoint (.pptx) 中提取文本
 *
 * PPTX 本质是 ZIP 包，内含 XML 格式的幻灯片。
 * 使用 jszip 解压后读取 ppt/slides/slide*.xml 中的文本内容。
 * 文本位于 <a:t> 标签内。
 */
async function extractFromPptx(buffer: Buffer): Promise<string> {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(buffer);

  // 收集所有幻灯片文件（按 slide 编号排序）
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const slideNumber = (value: string) => Number(value.match(/slide(\d+)\.xml$/)?.[1] || 0);
      return slideNumber(a) - slideNumber(b);
    });

  if (slideFiles.length === 0) {
    return "[注意：未能找到 PPTX 中的幻灯片内容。]";
  }

  const slides: string[] = [];

  for (const slideFile of slideFiles) {
    const content = await zip.files[slideFile].async("text");

    // 提取段落文本：先分割 <a:p> 段落块，再从每个块中提取 <a:t> 文本
    const paragraphs: string[] = [];
    const pBlocks = content.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) || [];

    for (const pBlock of pBlocks) {
      const texts: string[] = [];
      const aTRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
      let m: RegExpExecArray | null;
      while ((m = aTRegex.exec(pBlock)) !== null) {
        const t = m[1].trim();
        if (t) texts.push(t);
      }
      if (texts.length > 0) {
        paragraphs.push(texts.join(""));
      }
    }

    if (paragraphs.length > 0) {
      const slideNum = slideFile.match(/(\d+)/)?.[1] || "";
      slides.push(`=== 第 ${slideNum} 页 ===\n` + paragraphs.join("\n"));
    }
  }

  return slides.join("\n\n") || "[注意：PPTX 中未提取到文本内容。]";
}

/**
 * 从 Markdown 中提取文本
 *
 * 使用 marked 库解析 Markdown，然后提取纯文本。
 * 会去除 markdown 标记符号，保留正文内容。
 */
async function extractFromMarkdown(buffer: Buffer): Promise<string> {
  const md = buffer.toString("utf-8");
  return md;
}

/**
 * 从 HTML 中提取文本
 *
 * 去除 HTML 标签、脚本和样式，保留纯文本内容。
 */
async function extractFromHtml(buffer: Buffer): Promise<string> {
  const html = buffer.toString("utf-8");
  return stripHtml(html);
}

// ===================== 工具函数 =====================

/**
 * 去除 HTML 标签，提取纯文本
 *
 * 同时移除 <script> 和 <style> 块，避免干扰。
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // 移除脚本
    .replace(/<h([1-6])[^>]*>/gi, (_, level) => `${"#".repeat(Number(level))} `) // 保留标题层级
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th)[^>]*>/gi, "\n") // 保留结构边界
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // 移除样式
    .replace(/<[^>]+>/g, " ") // 移除 HTML 标签
    .replace(/&nbsp;/g, " ") // 替换空格实体
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ") // 合并行内空白但保留段落
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 清洗提取后的文本
 *
 * - 合并连续空行为两个换行符
 * - 去除每行首尾空白
 * - 去除整个文本的首尾空白
 */
function cleanText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // 最多一个空行
    .trim();
}
