import { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, PageNumber } from "docx";

export interface ProjectTemplate {
    id: string;
    name: string;
    language: string;
    framework: string;
    extensions: string[];
    excludePatterns: string[];
    /** 预编译的排除路径正则，避免每次过滤文件时重复 includes() 扫描 */
    excludeRegex: RegExp;
    /** 预构建的扩展名 Set，O(1) hash 查找替代 O(n) includes() */
    extensionSet: Set<string>;
}

/** 在模块级预编译，避免 cleanCode 每次调用时重复构造 RegExp 对象 */
const NEWLINE_RE = /\r?\n/;

function buildTemplate(t: Omit<ProjectTemplate, "excludeRegex" | "extensionSet">): ProjectTemplate {
    return {
        ...t,
        excludeRegex: new RegExp(
            t.excludePatterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
            "i"
        ),
        extensionSet: new Set(t.extensions),
    };
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    buildTemplate({
        id: "nextjs",
        name: "Next.js / React (TS/JS)",
        language: "TypeScript/JavaScript",
        framework: "Next.js",
        extensions: ["ts", "tsx", "js", "jsx", "css"],
        excludePatterns: ["node_modules", ".next", "dist", "build", "public"],
    }),
    buildTemplate({
        id: "springboot",
        name: "Spring Boot / Java",
        language: "Java",
        framework: "Spring Boot",
        extensions: ["java", "xml", "properties", "yml"],
        excludePatterns: ["target", ".mvn", ".idea", "bin"],
    }),
    buildTemplate({
        id: "python",
        name: "Python (Django/FastAPI)",
        language: "Python",
        framework: "Django/FastAPI",
        extensions: ["py", "html", "css"],
        excludePatterns: ["venv", ".venv", "__pycache__", ".pytest_cache"],
    }),
    buildTemplate({
        id: "cpp",
        name: "C++ / System",
        language: "C/C++",
        framework: "CMake/Native",
        extensions: ["cpp", "c", "h", "hpp"],
        excludePatterns: ["build", "bin", "obj", "out"],
    }),
    buildTemplate({
        id: "golang",
        name: "Go / Microservices",
        language: "Go",
        framework: "Standard/Gin",
        extensions: ["go", "mod", "sum"],
        excludePatterns: ["vendor", "bin"],
    }),
];

export interface CleanOptions {
    appName: string;
    appVersion: string;
    language: string;
    framework: string;
}

export class CoreEngine {
    /**
     * 清洗代码：移除注释和多余空行。
     *
     * 优化点：
     * - NEWLINE_RE 在模块级预编译，避免每次 split 重新构造 RegExp
     * - 块注释的 indexOf 只调用一次，closeIdx 缓存复用，消除二次查找
     */
    static cleanCode(content: string): string[] {
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

            // 单行注释
            if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

            // 行尾 // 注释（排除 URL 中的 ://）
            if (trimmed.includes("//") && !trimmed.includes("://")) {
                const commentIdx = line.indexOf("//");
                const codePart = line.substring(0, commentIdx);
                if (codePart.trim()) result.push(codePart);
                continue;
            }

            // 行尾 # 注释（Python/Shell），避免误触字符串中的 #
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

    /**
     * 生成 Docx Blob。
     *
     * 优化：截断逻辑改用 concat 替代 [...front, ...back] spread，
     * 后者在超大数组时会炸掉调用栈（V8 约 125k 参数限制）。
     */
    static async generateDocx(lines: string[], options: CleanOptions): Promise<Blob> {
        const LINES_PER_PAGE = 50;
        const TARGET_PAGES = 30;
        const MAX_LINES = TARGET_PAGES * 2 * LINES_PER_PAGE;

        let finalLines = lines;
        if (lines.length > MAX_LINES) {
            const front = lines.slice(0, TARGET_PAGES * LINES_PER_PAGE);
            const back = lines.slice(-TARGET_PAGES * LINES_PER_PAGE);
            finalLines = front.concat(back); // 无调用栈限制
        }

        const doc = new Document({
            sections: [
                {
                    properties: {
                        page: {
                            margin: {
                                top: 720,
                                bottom: 720,
                                left: 720,
                                right: 720,
                            },
                        },
                    },
                    headers: {
                        default: new Header({
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `${options.appName} (版本: ${options.appVersion}) - 源代码文档`,
                                            size: 18,
                                            color: "666666",
                                        }),
                                    ],
                                    alignment: AlignmentType.CENTER,
                                }),
                            ],
                        }),
                    },
                    footers: {
                        default: new Footer({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({
                                            children: [PageNumber.CURRENT],
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    },
                    children: finalLines.map(
                        (line) =>
                            new Paragraph({
                                spacing: { line: 240 },
                                children: [
                                    new TextRun({
                                        text: line,
                                        font: "Consolas",
                                        size: 19,
                                    }),
                                ],
                            })
                    ),
                },
            ],
        });

        return await Packer.toBlob(doc);
    }
}
