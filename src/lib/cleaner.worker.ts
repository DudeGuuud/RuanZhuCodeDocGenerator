/**
 * cleaner.worker.ts
 * Web Worker：接收源码文本，返回清洗后的行数组。
 *
 * cleanCode 逻辑内联在此 Worker 中，避免 Next.js / Turbopack
 * 在 Worker 上下文中解析模块依赖时产生的捆绑问题。
 */

export interface CleanerRequest {
    id: number;
    text: string;
}

export interface CleanerResponse {
    id: number;
    lines: string[];
}

// 预编译换行正则（模块级，只构造一次）
const NEWLINE_RE = /\r?\n/;

function cleanCode(content: string): string[] {
    const lines = content.split(NEWLINE_RE);
    const result: string[] = [];
    let inBlockComment = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (inBlockComment) {
            const closeIdx = trimmed.indexOf("*/");
            if (closeIdx !== -1) {
                inBlockComment = false;
                const remaining = trimmed.substring(closeIdx + 2).trim();
                if (remaining && !remaining.startsWith("//")) {
                    result.push(line.substring(line.indexOf("*/") + 2));
                }
            }
            continue;
        }

        if (trimmed.startsWith("/*")) {
            const closeIdx = trimmed.indexOf("*/", 2);
            if (closeIdx === -1) {
                inBlockComment = true;
            } else {
                const remaining = trimmed.substring(closeIdx + 2).trim();
                if (remaining && !remaining.startsWith("//")) {
                    result.push(line.substring(line.indexOf("*/") + 2));
                }
            }
            continue;
        }

        if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

        if (trimmed.includes("//") && !trimmed.includes("://")) {
            const commentIdx = line.indexOf("//");
            const codePart = line.substring(0, commentIdx);
            if (codePart.trim()) result.push(codePart);
            continue;
        }

        if (trimmed.includes("#") && !line.includes("'#'") && !line.includes('"#"')) {
            const commentIdx = line.indexOf("#");
            const codePart = line.substring(0, commentIdx);
            if (codePart.trim()) result.push(codePart);
            continue;
        }

        result.push(line);
    }

    return result;
}

self.addEventListener("message", (e: MessageEvent<CleanerRequest>) => {
    const { id, text } = e.data;
    const lines = cleanCode(text);
    self.postMessage({ id, lines });
});
