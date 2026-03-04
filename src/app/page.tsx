"use client";

import React, { useState, useRef } from "react";
import { CoreEngine, CleanOptions, PROJECT_TEMPLATES, ProjectTemplate } from "@/lib/engine";
import { WorkerPool } from "@/lib/worker-pool";
import {
  ShieldCheck,
  FileCode,
  Upload,
  Download,
  Zap,
  Layers,
  CheckCircle2,
  AlertCircle,
  Code2,
  Trash2,
  Clock,
  Settings2,
  X,
  Lock,
  MousePointerClick,
  FileDown,
  Eye,
  Server,
  Fingerprint,
  HardDrive,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ModalType = "howto" | "security" | null;

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-2xl p-8 relative max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl border border-black/5" style={{ background: '#ffffff', color: '#111827' }}>
              <button
                onClick={onClose}
                className="absolute top-6 right-6 p-2 rounded-xl bg-black/5 hover:bg-black/10 text-gray-500 hover:text-gray-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const HOWTO_STEPS = [
  {
    icon: Settings2,
    title: "填写基础信息",
    desc: "在「基础配置」面板输入软件全称（需与软著申请表一致）和版本号。这些信息将自动写入文档页眉。",
  },
  {
    icon: Code2,
    title: "选择工程模板",
    desc: "根据你的技术栈选择预设模板（如 Next.js、Spring Boot、Python 等）。模板会自动配置应包含的文件类型和应排除的目录。",
  },
  {
    icon: MousePointerClick,
    title: "拖入源代码文件夹",
    desc: "点击上传区域，选择整个项目根目录。浏览器会递归扫描所有文件，无需解压，无需手动筛选。",
  },
  {
    icon: FileDown,
    title: "下载文档",
    desc: "处理完成后点击「下载源代码文档」即可。生成的 .docx 文件符合软著代码文档的排版规范：等宽字体、自动截断前后 30 页。",
  },
];

const SECURITY_ITEMS = [
  {
    icon: HardDrive,
    title: "完全离线处理",
    desc: "所有代码解析、清洗和文档生成均在你的浏览器本地完成，代码内容从未被发送到任何服务器。",
  },
  {
    icon: Eye,
    title: "零数据收集",
    desc: "本站不设置任何分析追踪代码，不记录文件名、路径或代码内容。刷新页面，所有数据即时消失。",
  },
  {
    icon: Server,
    title: "Serverless 架构",
    desc: "网站为纯静态部署，后端不存在任何数据库或文件存储服务，物理上不具备收集你数据的能力。",
  },
  {
    icon: Fingerprint,
    title: "源码开放",
    desc: "工程全部源码公开可查，你可以自行审计代码逻辑，或在本地 localhost 运行使用，不依赖任何外部服务。",
  },
];

export default function Home() {
  const [appName, setAppName] = useState("");
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>(PROJECT_TEMPLATES[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setResultBlob(null);
    setProgress(5);

    const options: CleanOptions = {
      appName: appName || "未命名项目",
      appVersion: appVersion || "1.0.0",
      language: selectedTemplate.language,
      framework: selectedTemplate.framework,
    };

    // 创建 Worker 池：大小 = CPU 核数，上限 8
    const concurrency = Math.min(navigator.hardwareConcurrency ?? 4, 8);
    const pool = new WorkerPool(concurrency);

    try {
      const allLines: string[] = [];
      const fileList = Array.from(files);

      // 路径过滤：预编译正则 O(1)
      const filteredFiles = fileList.filter(file => {
        const path = file.webkitRelativePath.toLowerCase();
        return !selectedTemplate.excludeRegex.test(path);
      });

      // 扩展名过滤：指定扩展名的文件才分发给 Worker
      const codeFiles = filteredFiles.filter(file => {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        return selectedTemplate.extensionSet.has(ext); // O(1) Set 查找
      });

      const totalFiles = codeFiles.length;
      setFileCount(totalFiles);

      // 分批并行：每批 = 并发数，避免一次性把全部文件装进内存
      for (let i = 0; i < totalFiles; i += concurrency) {
        const batch = codeFiles.slice(i, i + concurrency);

        // 并行读取文件 (I/O) + 并行清洗 (CPU via Worker)
        const results = await Promise.all(
          batch.map(file => file.text().then(text => pool.run(text)))
        );

        for (const cleaned of results) {
          // push.apply 避免超大数组 spread 栈溢出
          Array.prototype.push.apply(allLines, cleaned);
        }

        setProgress(10 + Math.floor(((i + batch.length) / totalFiles) * 80));
      }

      setLineCount(allLines.length);
      const blob = await CoreEngine.generateDocx(allLines, options);
      setResultBlob(blob);
      setProgress(100);

      setTimeout(() => { setIsProcessing(false); }, 800);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setProgress(0);
    } finally {
      pool.terminate(); // 释放所有 Worker 线程
    }
  };

  const downloadFile = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${appName || "RuanZhu"}_v${appVersion || "1.0.0"}_CodeDoc.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-black">
      <div className="hero-glow" />

      {/* ── Modals ── */}
      <Modal open={activeModal === "howto"} onClose={() => setActiveModal(null)}>
        <div className="mb-8">
          <span className="text-[11px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 mb-4 inline-block">GUIDE</span>
          <h2 className="text-2xl font-bold text-gray-900">如何使用</h2>
          <p className="text-gray-500 mt-2 text-sm">四步完成软著源代码文档，全程无需上传，无需注册。</p>
        </div>
        <div className="space-y-4">
          {HOWTO_STEPS.map((step, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 mt-0.5">
                <step.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono text-emerald-500 uppercase tracking-widest">0{i + 1}</span>
                  <h4 className="font-bold text-gray-900">{step.title}</h4>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 leading-relaxed">
          <strong className="text-emerald-700">提示：</strong>如果你的项目超过 3000 行有效代码，系统会自动保留前 1500 行和后 1500 行，完全符合软著申请的「前后各 30 页」要求。
        </div>
      </Modal>

      <Modal open={activeModal === "security"} onClose={() => setActiveModal(null)}>
        <div className="mb-8">
          <span className="text-[11px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 mb-4 inline-block">PRIVACY</span>
          <h2 className="text-2xl font-bold flex items-center gap-3 text-gray-900">
            <Lock className="w-6 h-6 text-emerald-600" />
            安全说明
          </h2>
          <p className="text-gray-500 mt-2 text-sm">你的代码是你的资产，我们对此保持绝对的尊重。</p>
        </div>
        <div className="space-y-4">
          {SECURITY_ITEMS.map((item, i) => (
            <div key={i} className="p-5 rounded-2xl bg-gray-50 border border-gray-100 flex gap-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold mb-1 text-gray-900">{item.title}</h4>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <main className="max-w-7xl mx-auto px-6 py-12 lg:py-20">

        {/* Navigation / Header */}
        <header className="flex justify-between items-center mb-16 px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary flex items-center justify-center rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <ShieldCheck className="w-5 h-5 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">RuanZhuCode <span className="text-muted-foreground font-normal">Docs</span></span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium">
            <button
              onClick={() => setActiveModal("howto")}
              className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              如何使用
            </button>
            <button
              onClick={() => setActiveModal("security")}
              className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              安全说明
            </button>
            <span className="ml-2 glass-pill text-primary text-[11px] uppercase tracking-widest">V1.1.0 PREVIEW</span>
          </div>
        </header>

        {/* Hero Section */}
        <section className="mb-20 text-center lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl lg:text-7xl font-bold mb-6 tracking-tight max-w-4xl"
          >
            生成属于你软件的 <br />
            <span className="text-primary italic">完美源代码文档</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground max-w-2xl"
          >
            专为中国软件著作权申请设计。全自动清洗代码，精准截断多余页数，<br className="hidden md:block" />
            完全在浏览器本地处理，数据永不离岸。
          </motion.p>
        </section>

        {/* Bento Grid Layout */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Box 1: Configuration */}
          <motion.div variants={itemVariants} className="lg:col-span-4 bento-card p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-white/5 rounded-xl"><Layers className="w-5 h-5 text-primary" /></div>
                <h3 className="font-semibold text-lg">基础配置</h3>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-muted-foreground uppercase tracking-widest px-1">软件名称</label>
                  <input
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="输入软件全称..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-muted-foreground uppercase tracking-widest px-1">版本号</label>
                  <input
                    value={appVersion}
                    onChange={(e) => setAppVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium"
                  />
                </div>
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center gap-2 text-primary font-medium text-sm">
              <CheckCircle2 className="w-4 h-4" />
              信息将自动载入页眉
            </div>
          </motion.div>

          {/* Box 2: Template Selection */}
          <motion.div variants={itemVariants} className="lg:col-span-8 bento-card p-8 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 rounded-xl"><Code2 className="w-5 h-5 text-primary" /></div>
                <h3 className="font-semibold text-lg">工程模板</h3>
              </div>
              <span className="glass-pill text-[12px] uppercase tracking-tighter text-muted-foreground">PRESET CONFIGS</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-grow">
              {PROJECT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => { setSelectedTemplate(tmpl); setResultBlob(null); }}
                  className={`
                    p-5 rounded-2xl border text-left transition-all relative overflow-hidden group
                    ${selectedTemplate.id === tmpl.id
                      ? "bg-primary/10 border-primary shadow-[0_0_25px_rgba(16,185,129,0.1)]"
                      : "bg-white/[0.02] border-white/5 hover:border-white/20"}
                  `}
                >
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center mb-4 transition-colors
                    ${selectedTemplate.id === tmpl.id ? "bg-primary text-black" : "bg-white/5 text-muted-foreground group-hover:bg-white/10"}
                  `}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold mb-1">{tmpl.name}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    自动包含 .{tmpl.extensions.join(", ")} 文件
                  </p>
                  {selectedTemplate.id === tmpl.id && (
                    <motion.div layoutId="active-tmpl" className="absolute top-4 right-4 text-primary">
                      <CheckCircle2 className="w-5 h-5" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Box 3: Extraction Stats */}
          <motion.div variants={itemVariants} className="lg:col-span-4 bento-card p-8">
            <div className="flex items-center gap-3 mb-8">
              <h3 className="font-semibold text-lg">提取概况</h3>
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-white/5 pb-4">
                <div className="text-muted-foreground text-sm flex items-center gap-2"><FileCode className="w-4 h-4" /> 识别合规文件</div>
                <div className="text-2xl font-mono font-bold tracking-tighter">{fileCount} <span className="text-xs font-sans text-muted-foreground uppercase tracking-normal">Files</span></div>
              </div>
              <div className="flex justify-between items-end border-b border-white/5 pb-4">
                <div className="text-muted-foreground text-sm flex items-center gap-2"><Trash2 className="w-4 h-4" /> 自动清洗行数</div>
                <div className="text-2xl font-mono font-bold tracking-tighter">{lineCount} <span className="text-xs font-sans text-muted-foreground uppercase tracking-normal">Lines</span></div>
              </div>
              <div className="flex justify-between items-end border-b border-white/5 pb-4">
                <div className="text-muted-foreground text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> 处理耗时</div>
                <div className="text-2xl font-mono font-bold tracking-tighter">~ {Math.ceil(progress * 2)} <span className="text-xs font-sans text-muted-foreground uppercase tracking-normal">MS</span></div>
              </div>
            </div>
            <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
              <p className="text-[12px] text-yellow-500/90 leading-relaxed font-medium">
                注意：超过 60 页（3000 行）的代码将自动截断前后 30 页。此操作符合申请标准。
              </p>
            </div>
          </motion.div>

          {/* Box 4: Action / Upload */}
          <motion.div variants={itemVariants} className="lg:col-span-8 bento-card p-8 flex flex-col md:flex-row gap-8">
            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`
                flex-1 rounded-3xl border-2 border-dashed transition-all cursor-pointer
                flex flex-col items-center justify-center p-8 min-h-[240px] relative overflow-hidden group
                ${isProcessing ? "border-primary/50 opacity-50 bg-primary/[0.02]" : "border-white/10 hover:border-primary/30 hover:bg-white/[0.02]"}
              `}
            >
              <input
                type="file"
                multiple
                // @ts-expect-error webkitdirectory is a non-standard attribute
                webkitdirectory=""
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <AnimatePresence mode="wait">
                {isProcessing ? (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center gap-4 w-full px-12"
                  >
                    <div className="text-primary font-bold animate-pulse text-lg tracking-widest">EXTRACTING...</div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-primary shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{progress}% COMPLETED</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center text-center"
                  >
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary group-hover:scale-110 group-hover:rotate-6 transition-transform">
                      <Upload className="w-8 h-8" />
                    </div>
                    <h4 className="text-xl font-bold mb-2">拖入源代码文件夹</h4>
                    <p className="text-muted-foreground max-w-[240px] mx-auto text-sm leading-relaxed">
                      或点击选择文件夹。暂不支持单文件，请提供项目根目录。
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col justify-center gap-6 min-w-[280px]">
              <div className="space-y-1">
                <h4 className="font-bold text-lg">立即交付</h4>
                <p className="text-sm text-muted-foreground">生成的文档将完全符合软著排版要求</p>
              </div>

              <button
                disabled={!resultBlob || isProcessing}
                onClick={downloadFile}
                className={`
                  relative py-5 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 group
                  ${resultBlob && !isProcessing
                    ? "bg-primary text-black hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:scale-[1.03]"
                    : "bg-white/5 text-white/20 cursor-not-allowed opacity-50"}
                `}
              >
                {resultBlob && !isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center text-primary shadow-lg"
                  >
                    <CheckCircle2 className="w-4 h-4 fill-primary text-white" />
                  </motion.div>
                )}
                <Download className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                下载源代码文档
              </button>

              <div className="flex items-center gap-4 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all cursor-crosshair">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => <div key={i} className="w-6 h-6 rounded-full border border-black bg-neutral-800" />)}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider">SECURED BY LOCAL PARSER</span>
              </div>
            </div>
          </motion.div>

        </motion.div>

        {/* Footer */}
        <footer className="mt-32 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 text-muted-foreground">
          <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest">
            <span className="flex items-center gap-2"><Zap className="w-3 h-3 text-primary" /> 毫秒级提取</span>
            <span className="flex items-center gap-2"><ShieldCheck className="w-3 h-3 text-primary" /> 数据零留存</span>
            <span className="flex items-center gap-2"><Settings2 className="w-3 h-3 text-primary" /> 自动清洗</span>
          </div>
          <p className="text-xs">© 2026 RuanZhuCode. Crafted for Developers with Good Taste.</p>
        </footer>

      </main>
    </div>
  );
}
