import { toast } from "../toast";
import { decodeStega } from "./stega";

const DOCUMENT_ID = /^[\w.-]{1,128}$/;

export interface ContentBinding {
  documentId: string;
  path: string;
}

/** Markers select a field; the native store still validates every request. */
export function contentBinding(raw: string): ContentBinding | null {
  const binding = decodeStega(raw)?.weblab;
  if (!binding || typeof binding !== "object") {
    return null;
  }
  const { documentId, path } = binding as Record<string, unknown>;
  if (
    typeof documentId !== "string" ||
    !DOCUMENT_ID.test(documentId) ||
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > 2048
  ) {
    return null;
  }
  return { documentId, path };
}

function bridge() {
  return (
    window as unknown as {
      weblabHost?: {
        content?: {
          edit: (
            binding: ContentBinding
          ) => Promise<{ ok: boolean; message?: string }>;
        };
      };
    }
  ).weblabHost?.content;
}

export function canEditLocalContent(raw: string): boolean {
  return Boolean(bridge() && contentBinding(raw));
}

export function editLocalContent(raw: string): boolean {
  const binding = contentBinding(raw);
  const content = bridge();
  if (!(binding && content)) {
    return false;
  }
  content
    .edit(binding)
    .then((result) => {
      if (!result.ok) {
        toast(result.message ?? "This text could not be opened.", {
          tone: "error",
        });
      }
    })
    .catch(() => toast("This text could not be opened.", { tone: "error" }));
  return true;
}
