/**
 * worker-pool.ts
 *
 * Worker 脚本以 Blob URL 内联方式创建，完全绕开 Turbopack / webpack
 * 对 new URL('./file.ts', import.meta.url) 的模块解析问题，
 * 在开发模式（Turbopack）和生产模式（webpack）下均可正常运行。
 */

const WORKER_SCRIPT = /* javascript */`
const NEWLINE_RE = /\\r?\\n/;

function cleanCode(content) {
    const lines = content.split(NEWLINE_RE);
    const result = [];
    let inBlockComment = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (inBlockComment) {
            const closeIdx = trimmed.indexOf('*/');
            if (closeIdx !== -1) {
                inBlockComment = false;
                const remaining = trimmed.substring(closeIdx + 2).trim();
                if (remaining && !remaining.startsWith('//')) {
                    result.push(line.substring(line.indexOf('*/') + 2));
                }
            }
            continue;
        }

        if (trimmed.startsWith('/*')) {
            const closeIdx = trimmed.indexOf('*/', 2);
            if (closeIdx === -1) {
                inBlockComment = true;
            } else {
                const remaining = trimmed.substring(closeIdx + 2).trim();
                if (remaining && !remaining.startsWith('//')) {
                    result.push(line.substring(line.indexOf('*/') + 2));
                }
            }
            continue;
        }

        if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

        if (trimmed.includes('//') && !trimmed.includes('://')) {
            const commentIdx = line.indexOf('//');
            const codePart = line.substring(0, commentIdx);
            if (codePart.trim()) result.push(codePart);
            continue;
        }

        if (trimmed.includes('#') && !line.includes("'#'") && !line.includes('"#"')) {
            const commentIdx = line.indexOf('#');
            const codePart = line.substring(0, commentIdx);
            if (codePart.trim()) result.push(codePart);
            continue;
        }

        result.push(line);
    }

    return result;
}

self.addEventListener('message', (e) => {
    const { id, text } = e.data;
    const lines = cleanCode(text);
    self.postMessage({ id, lines });
});
`;

interface PendingTask {
    resolve: (lines: string[]) => void;
    reject: (err: Error) => void;
}

interface WorkerResponse {
    id: number;
    lines: string[];
}

export class WorkerPool {
    private readonly workers: Worker[];
    private readonly idle: Worker[];
    private readonly queue: Array<{ data: { id: number; text: string } } & PendingTask> = [];
    private readonly pending = new Map<Worker, PendingTask>();
    private nextId = 0;
    private readonly blobUrl: string;

    constructor(size: number) {
        const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
        this.blobUrl = URL.createObjectURL(blob);

        this.workers = Array.from({ length: size }, () => new Worker(this.blobUrl));
        this.idle = [...this.workers];

        for (const worker of this.workers) {
            worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
                const task = this.pending.get(worker);
                if (!task) return;
                this.pending.delete(worker);
                this.idle.push(worker);
                task.resolve(e.data.lines);
                this.dispatch();
            });
            worker.addEventListener("error", (e: ErrorEvent) => {
                // 阻止错误冒泡到全局，由 Promise reject 链统一处理
                e.preventDefault();
                const task = this.pending.get(worker);
                if (!task) return;
                this.pending.delete(worker);
                this.idle.push(worker);
                task.reject(new Error(e.message || "Worker error"));
                this.dispatch();
            });
        }
    }

    private dispatch(): void {
        if (this.queue.length === 0 || this.idle.length === 0) return;
        const worker = this.idle.pop()!;
        const task = this.queue.shift()!;
        this.pending.set(worker, task);
        worker.postMessage(task.data);
    }

    /** 提交一个文件文本，返回清洗后的行数组 */
    run(text: string): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            const id = this.nextId++;
            this.queue.push({ data: { id, text }, resolve, reject });
            this.dispatch();
        });
    }

    /** 关闭所有 Worker，释放线程和 Blob URL */
    terminate(): void {
        for (const worker of this.workers) worker.terminate();
        URL.revokeObjectURL(this.blobUrl);
    }
}
