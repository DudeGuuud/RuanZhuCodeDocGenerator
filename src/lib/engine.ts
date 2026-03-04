import { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, PageNumber } from "docx";

export interface ProjectTemplate {
    id: string;
    name: string;
    language: string;
    framework: string;
    extensions: string[];
    excludePatterns: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        id: "nextjs",
        name: "Next.js / React (TS/JS)",
        language: "TypeScript/JavaScript",
        framework: "Next.js",
        extensions: ["ts", "tsx", "js", "jsx", "css"],
        excludePatterns: ["node_modules", ".next", "dist", "build", "public"],
    },
    {
        id: "springboot",
        name: "Spring Boot / Java",
        language: "Java",
        framework: "Spring Boot",
        extensions: ["java", "xml", "properties", "yml"],
        excludePatterns: ["target", ".mvn", ".idea", "bin"],
    },
    {
        id: "python",
        name: "Python (Django/FastAPI)",
        language: "Python",
        framework: "Django/FastAPI",
        extensions: ["py", "html", "css"],
        excludePatterns: ["venv", ".venv", "__pycache__", ".pytest_cache"],
    },
    {
        id: "cpp",
        name: "C++ / System",
        language: "C/C++",
        framework: "CMake/Native",
        extensions: ["cpp", "c", "h", "hpp"],
        excludePatterns: ["build", "bin", "obj", "out"],
    },
    {
        id: "golang",
        name: "Go / Microservices",
        language: "Go",
        framework: "Standard/Gin",
        extensions: ["go", "mod", "sum"],
        excludePatterns: ["vendor", "bin"],
    }
];

export interface CleanOptions {
    appName: string;
    appVersion: string;
    language: string;
    framework: string;
}

export class CoreEngine {
    /**
     * 清洗代码：移除注释和多余空行
     */
    static cleanCode(content: string): string[] {
        const lines = content.split(/\r?\n/);
        const result: string[] = [];
        let inBlockComment = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // 简单的状态机处理块注释
            if (inBlockComment) {
                if (trimmed.includes("*/")) {
                    inBlockComment = false;
                    const afterIdx = trimmed.indexOf("*/") + 2;
                    const remaining = trimmed.substring(afterIdx).trim();
                    if (remaining && !remaining.startsWith("//")) {
                        result.push(line.substring(line.indexOf("*/") + 2));
                    }
                }
                continue;
            }

            if (trimmed.startsWith("/*")) {
                if (!trimmed.includes("*/")) {
                    inBlockComment = true;
                } else {
                    const afterIdx = trimmed.indexOf("*/") + 2;
                    const remaining = trimmed.substring(afterIdx).trim();
                    if (remaining && !remaining.startsWith("//")) {
                        result.push(line.substring(line.indexOf("*/") + 2));
                    }
                }
                continue;
            }

            // 单行注释
            if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

            // 行尾注释
            if (trimmed.includes("//") && !trimmed.includes("://")) {
                const idx = line.indexOf("//");
                const codePart = line.substring(0, idx);
                if (codePart.trim()) result.push(codePart);
                continue;
            }

            if (trimmed.includes("#") && !line.includes("'#'") && !line.includes('"#"')) {
                const idx = line.indexOf("#");
                const codePart = line.substring(0, idx);
                if (codePart.trim()) result.push(codePart);
                continue;
            }

            result.push(line);
        }

        return result;
    }

    /**
     * 生成 Docx Blob
     */
    static async generateDocx(lines: string[], options: CleanOptions): Promise<Blob> {
        const LINES_PER_PAGE = 50;
        const TARGET_PAGES = 30;
        const MAX_LINES = TARGET_PAGES * 2 * LINES_PER_PAGE;

        let finalLines = lines;
        if (lines.length > MAX_LINES) {
            const front = lines.slice(0, TARGET_PAGES * LINES_PER_PAGE);
            const back = lines.slice(-TARGET_PAGES * LINES_PER_PAGE);
            finalLines = [...front, ...back];
        }

        const doc = new Document({
            sections: [
                {
                    properties: {
                        page: {
                            margin: {
                                top: 720, // 0.5 inch
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
                                            size: 18, // 9pt
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
                                        size: 19, // 9.5pt
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
