import { Copy, FileCode2, FlaskConical, LoaderCircle, Play, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";

import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/themes/prism-tomorrow.css";
import Editor from "react-simple-code-editor";

interface UploadedFile {
  name: string;
  key: string;
  size: number;
  contentType?: string;
}

interface UploadResponse {
  sessionId: string;
  sessionRoot: string;
  suggestedEntrypoint: string;
  filePaths: string[];
  files: UploadedFile[];
  suggestedOutputPath: string;
  suggestedCode: string;
}

interface ExecutionResult {
  job_id: string;
  session_id: string;
  status: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number | null;
  files_uploaded: string[];
  downloads: Array<{ key: string; url: string }>;
}

const starterCode = `# Upload one or more files first.
# The demo will suggest concrete input/output paths here.`;
const apiBaseUrl = (import.meta.env.VITE_DEMO_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sessionId, setSessionId] = useState("")
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [entrypoint, setEntrypoint] = useState("main.py")
  const [pythonProfile, setPythonProfile] = useState<"default" | "data-science">("default")
  const [suggestedOutputPath, setSuggestedOutputPath] = useState("")
  const [code, setCode] = useState(starterCode)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [running, setRunning] = useState(false)
  const [statusMessage, setStatusMessage] = useState("Upload source files to create a runnable workspace.")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"output" | "status" | "files">("output")

  const readyToRun = sessionId.length > 0 && filePaths.length > 0 && code.trim().length > 0 && !running

  const displayFiles = useMemo(
    () =>
      uploadedFiles.map((file) => ({
        ...file,
        sizeLabel: file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
      })),
    [uploadedFiles]
  )

  async function handleUpload() {
    if (selectedFiles.length === 0) {
      setErrorMessage("Choose at least one input file first.")
      return
    }

    setUploading(true)
    setErrorMessage(null)
    setStatusMessage("Uploading files into the object store and preparing a session...")

    try {
      const formData = new FormData()

      if (sessionId) {
        formData.append("sessionId", sessionId)
      }

      selectedFiles.forEach((file) => {
        formData.append("files", file)
      })

      const response = await fetch(apiUrl("/api/uploads"), {
        method: "POST",
        body: formData
      })
      const payload = (await response.json()) as UploadResponse | { error?: string }

      if (!response.ok) {
        throw new Error(typeof payload === "object" && payload && "error" in payload ? payload.error : "Upload failed")
      }

      const upload = payload as UploadResponse
      setSessionId(upload.sessionId)
      setFilePaths(upload.filePaths)
      setUploadedFiles(upload.files)
      setEntrypoint(upload.suggestedEntrypoint)
      setSuggestedOutputPath(upload.suggestedOutputPath)
      setCode(upload.suggestedCode)
      setResult(null)
      setStatusMessage(`Session ${upload.sessionId} is ready. Adjust the Python and run the transformation.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleRun() {
    if (!readyToRun) {
      return
    }

    setRunning(true)
    setErrorMessage(null)
    setStatusMessage("Launching a fresh sandbox and streaming your workspace into it...")
    setActiveTab("output")

    try {
      const response = await fetch(apiUrl("/api/execute"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId,
          filePaths,
          entrypoint,
          pythonProfile,
          code
        })
      })

      const payload = (await response.json()) as ExecutionResult | { error?: string }

      if (!response.ok) {
        throw new Error(typeof payload === "object" && payload && "error" in payload ? payload.error : "Execution failed")
      }

      const execution = payload as ExecutionResult
      setResult(execution)
      setStatusMessage(
        execution.exit_code === 0
          ? "Execution completed. Any new or changed files were pushed back to object storage."
          : "Execution finished with errors. Review stderr and adjust the code."
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Execution failed")
    } finally {
      setRunning(false)
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setStatusMessage(`Copied ${text}`)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top Header */}
      <header className="flex h-14 items-center justify-between border-b px-6 bg-card shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h1 className="font-display text-xl font-bold tracking-tight">Field Lab</h1>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              {sessionId || "No Session"}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleRun}
            disabled={!readyToRun || running}
          >
            {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run Transform
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-[320px] flex-col border-r bg-card/50">
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</h2>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-dashed border-border p-4 bg-background/50">
                    <div className="mb-3 flex items-center gap-2">
                      <UploadCloud className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Add Files</span>
                    </div>
                    <Input
                      id="files"
                      type="file"
                      multiple
                      className="h-8 text-[11px] mb-3"
                      onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                    />
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      variant="secondary"
                      onClick={handleUpload}
                      disabled={uploading}
                    >
                      {uploading ? <LoaderCircle className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Upload to Sandbox
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground tracking-widest px-1">Active Files</Label>
                    <div className="space-y-1">
                      {displayFiles.length === 0 ? (
                        <p className="px-1 text-xs text-muted-foreground italic">No files available</p>
                      ) : (
                        displayFiles.map((file) => (
                          <div
                            key={file.key}
                            className="group flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate text-xs font-medium">{file.name}</span>
                              <span className="truncate text-[10px] font-mono text-muted-foreground opacity-70">
                                {file.key}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={() => void copy(file.key)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {suggestedOutputPath && (
                <section>
                  <Label className="text-[10px] uppercase text-muted-foreground tracking-widest px-1">Suggested Output</Label>
                  <div className="mt-1 flex items-center justify-between rounded-md border bg-accent/30 p-2">
                    <code className="truncate text-[10px] font-mono text-foreground">
                      {suggestedOutputPath}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => void copy(suggestedOutputPath)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </section>
              )}

              <section>
                <Label className="text-[10px] uppercase text-muted-foreground tracking-widest px-1">Script Path</Label>
                  <div className="mt-1 flex items-center justify-between rounded-md border bg-accent/30 p-2">
                    <code className="truncate text-[10px] font-mono text-foreground">
                      {entrypoint}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => void copy(entrypoint)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  </div>
                </section>

              <section>
                <Label className="text-[10px] uppercase text-muted-foreground tracking-widest px-1">Python Profile</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Button
                    variant={pythonProfile === "default" ? "default" : "secondary"}
                    size="sm"
                    className="h-8 text-[10px]"
                    onClick={() => setPythonProfile("default")}
                  >
                    Core
                  </Button>
                  <Button
                    variant={pythonProfile === "data-science" ? "default" : "secondary"}
                    size="sm"
                    className="h-8 text-[10px]"
                    onClick={() => setPythonProfile("data-science")}
                  >
                    NumPy + pandas
                  </Button>
                </div>
              </section>
            </div>

            <div className="mt-auto border-t p-4 bg-muted/20">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] bg-background/50">Worker Console</Badge>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {statusMessage}
                </p>
                {errorMessage && (
                  <div className="mt-2 rounded-md bg-destructive/10 p-2 text-[10px] text-destructive border border-destructive/20 font-medium">
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex flex-1 flex-col overflow-hidden pr-6 py-4 gap-4">
          {/* Editor Section */}
          <div className="flex flex-[1.5] flex-col overflow-hidden bg-[#0d151e] shadow-ide rounded-xl border border-white/5">
            <div className="flex h-10 items-center justify-between px-4 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-3.5 w-3.5 text-primary/80" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{entrypoint}</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500/50" /> UTF-8</span>
                <span>Python 3.11</span>
              </div>
            </div>
            <div className="relative flex-1 dark-scrollbar overflow-auto">
              <Editor
                value={code}
                onValueChange={(code) => setCode(code)}
                highlight={(code) => Prism.highlight(code, Prism.languages.python, "python")}
                padding={20}
                className="font-mono text-[13px] leading-relaxed text-slate-100 min-h-full"
                style={{
                  fontFamily: '"IBM Plex Mono", monospace'
                }}
              />
            </div>
          </div>

          {/* Bottom Terminal Section */}
          <div className="flex flex-1 flex-col overflow-hidden bg-[#090f16] shadow-ide rounded-xl border border-white/5">
            <div className="flex h-9 items-center gap-1 border-b border-white/5 bg-white/[0.02] px-2">
              <button
                className={`px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === "output" ? "text-primary border-b-2 border-primary h-full" : "text-slate-500 hover:text-slate-300"
                  }`}
                onClick={() => setActiveTab("output")}
              >
                Output
              </button>
              <button
                className={`px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === "files" ? "text-primary border-b-2 border-primary h-full" : "text-slate-500 hover:text-slate-300"
                  }`}
                onClick={() => setActiveTab("files")}
              >
                Generated
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 font-mono text-xs dark-scrollbar">
              {activeTab === "output" && (
                <div className="space-y-6">
                  {result ? (
                    <>
                      <div className="flex items-center gap-4 pb-2 border-b border-white/5">
                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/5">
                          {result.status}
                        </Badge>
                        <span className="text-white/40">Duration: {result.duration_ms}ms</span>
                        <span className="text-white/40">Exit Code: {result.exit_code}</span>
                      </div>

                      <div className="space-y-4 mt-4">
                        <div>
                          <p className="mb-2 text-[10px] font-bold uppercase text-emerald-500/60">stdout</p>
                          <pre className="text-emerald-200/90 whitespace-pre-wrap">{result.stdout || "(no output)"}</pre>
                        </div>
                        {result.stderr && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase text-rose-500/60">stderr</p>
                            <pre className="text-rose-300/90 whitespace-pre-wrap">{result.stderr}</pre>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-slate-600 gap-2 opacity-50">
                      <Play className="h-8 w-8" />
                      <p>Execution results will appear here</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "files" && (
                <div className="space-y-4">
                  {result?.downloads && result.downloads.length > 0 ? (
                    <div className="grid gap-2">
                      <p className="mb-2 text-[10px] font-bold uppercase text-primary/60">Generated Artifacts</p>
                      {result.downloads.map((download) => (
                        <div key={download.key} className="flex items-center justify-between rounded-lg bg-white/5 p-3 border border-white/5 hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="rounded-md bg-primary/20 p-2">
                              <FileCode2 className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-sm text-slate-200">{download.key}</span>
                          </div>
                          <a href={download.url} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" className="h-8 text-xs border-white/10 text-slate-300 hover:bg-white/5 hover:text-white">
                              Download
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-slate-600 gap-2 opacity-50">
                      <UploadCloud className="h-8 w-8" />
                      <p>Generated files will appear here after execution</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <footer className="flex h-8 items-center justify-between border-t px-4 bg-card text-[10px] uppercase tracking-widest text-muted-foreground/60 shadow-inner">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            <FlaskConical className="h-3 w-3" />
            Sandbox Executor v1.0
          </span>
          <div className="h-3 w-px bg-border" />
          <span>Connected to MinIO Store</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Ready for transformation</span>
        </div>
      </footer>
    </div>
  )
}
