export type AttachmentKind = "image" | "video" | "file";

export interface ParsedAttachment {
  file_id: string;
  file_name: string;
  file_size?: number;
  kind: AttachmentKind;
  preview_url?: string;
}

const IMAGE_EXT = /\.(jpe?g|jpe|png|gif|webp|bmp|heic|heif|tiff?|jpg2)$/i;
const VIDEO_EXT = /\.(mp4|avi|mov|webm|mkv|m4v|3gp|3gpp|flv|wmv|rmvb)$/i;

export function getAttachmentKind(
  fileName: string,
  mimeType?: string,
): AttachmentKind {
  if (mimeType?.startsWith("image/") || IMAGE_EXT.test(fileName)) {
    return "image";
  }
  if (mimeType?.startsWith("video/") || VIDEO_EXT.test(fileName)) {
    return "video";
  }
  return "file";
}

/** 解析扣子消息 content（text 或 object_string JSON） */
export function parseMessageContent(
  content: string,
  contentType?: string,
): { text: string; attachments: ParsedAttachment[] } {
  const raw = content?.trim() || "";
  const looksLikeObjectString =
    contentType === "object_string" ||
    (raw.startsWith("[") && raw.includes('"type"'));

  if (!looksLikeObjectString) {
    return { text: content || "", attachments: [] };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { text: content || "", attachments: [] };
    }

    let text = "";
    const attachments: ParsedAttachment[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const type = String(obj.type || "");

      if (type === "text") {
        text = String(obj.text || "");
        continue;
      }

      if (type === "image" || type === "file" || type === "audio") {
        const fileName = String(
          obj.file_name ||
            obj.name ||
            (type === "image" ? "图片" : type === "audio" ? "音频" : "文件"),
        );
        const kind: AttachmentKind =
          type === "image"
            ? "image"
            : getAttachmentKind(fileName, undefined) === "video"
              ? "video"
              : type === "file"
                ? getAttachmentKind(fileName)
                : "file";

        attachments.push({
          file_id: String(obj.file_id || ""),
          file_name: fileName,
          kind,
          preview_url:
            typeof obj.file_url === "string" && obj.file_url
              ? obj.file_url
              : undefined,
        });
      }
    }

    return { text, attachments };
  } catch {
    return { text: content || "", attachments: [] };
  }
}
