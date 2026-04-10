import { Copy, FileCode2, FlaskConical, LoaderCircle, Play, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";

interface UploadedFile {
  name: string;
  key: string;
  workspacePath: string;
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

const apiBaseUrl = (import.meta.env.VITE_DEMO_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!apiBaseUrl) {
    return normalizedPath;
  }

  if (apiBaseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBaseUrl}${normalizedPath.slice(4)}`;
  }

  return `${apiBaseUrl}${normalizedPath}`;
};

function generateSnippetForFiles(files: UploadedFile[]): { code: string; entrypoint: string; outputPath: string; profile: "default" | "data-science" } {
  const csvFile = files.find((f) => f.name.toLowerCase().endsWith(".csv"));
  const txtFile = files.find((f) => f.name.toLowerCase().endsWith(".txt"));

  if (csvFile) {
    return {
      code: `import pandas as pd
import os

input_path = "${csvFile.name}"
output_path = "./transformed_data.csv"

# Read the CSV with Pandas
df = pd.read_csv(input_path)

# Example transformation: Lowercase all column names
df.columns = [col.lower() for col in df.columns]
# Add a new column
df['processed'] = True

# Ensure output directory exists (though sandbox handles this)
os.makedirs(os.path.dirname(output_path), exist_ok=True)

# Save result back to object store
df.to_csv(output_path, index=False)

print(f"Data transformed and saved to {output_path}")
print("Head of new data:")
print(df.head())
`,
      entrypoint: "transform.py",
      outputPath: "./transformed_data.csv",
      profile: "data-science"
    };
  }

  if (txtFile) {
    return {
      code: `import os

input_path = "${txtFile.name}"
output_path = "./processed.txt"

with open(input_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Example transformation: Uppercase the text and count characters
processed_text = text.upper()
char_count = len(processed_text)

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(processed_text)

print(f"File processed. Original length: {len(text)}. New length: {char_count}.")
print(f"Output saved to {output_path}")
`,
      entrypoint: "process_text.py",
      outputPath: "./processed.txt",
      profile: "default"
    };
  }

  // Fallback
  return {
    code: `import os

input_dir = "./"
output_path = "./available_files.txt"

files = os.listdir(input_dir) if os.path.exists(input_dir) else []

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write("Available files:\\n")
    for file in files:
        f.write(f"- {file}\\n")

print(f"Listed {len(files)} files and saved to {output_path}")
`,
    entrypoint: "main.py",
    outputPath: "./available_files.txt",
    profile: "default"
  };
}

const starterCode = `# Upload one or more files first.
# The code structure will auto-adapt based on file type.`;

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [entrypoint, setEntrypoint] = useState("main.py");
  const [pythonProfile, setPythonProfile] = useState<"default" | "data-science">("default");
  const [suggestedOutputPath, setSuggestedOutputPath] = useState("");
  const [code, setCode] = useState(starterCode);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Upload source files to create a runnable workspace.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"output" | "files">("output");

  const readyToRun = sessionId.length > 0 && filePaths.length > 0 && code.trim().length > 0 && !running;

  const displayFiles = useMemo(
    () =>
      uploadedFiles.map((file) => ({
        ...file,
        sizeLabel: file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
      })),
    [uploadedFiles]
  );

  async function handleUpload() {
    if (selectedFiles.length === 0) {
      setErrorMessage("Choose at least one input file first.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    setStatusMessage("Uploading files into the object store and preparing a session...");

    try {
      const formData = new FormData();

      if (sessionId) {
        formData.append("sessionId", sessionId);
      }

      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(apiUrl("/api/uploads"), {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as UploadResponse | { error?: string };

      if (!response.ok) {
        throw new Error(typeof payload === "object" && payload && "error" in payload ? payload.error : "Upload failed");
      }

      const upload = payload as UploadResponse;
      setSessionId(upload.sessionId);
      setFilePaths(upload.filePaths);
      setUploadedFiles(upload.files);

      // Override the backend suggestions with our specialized frontend generation
      const snippet = generateSnippetForFiles(upload.files);
      setEntrypoint(snippet.entrypoint);
      setSuggestedOutputPath(snippet.outputPath);
      setCode(snippet.code);
      setPythonProfile(snippet.profile);

      setResult(null);
      setStatusMessage(`Session ${upload.sessionId} is ready. Automatically applied ${snippet.profile} profile.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRun() {
    if (!readyToRun) {
      return;
    }

    setRunning(true);
    setErrorMessage(null);
    setStatusMessage("Launching a fresh sandbox and streaming your workspace into it...");
    setActiveTab("output");

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
      });

      const payload = (await response.json()) as ExecutionResult | { error?: string };

      if (!response.ok) {
        throw new Error(typeof payload === "object" && payload && "error" in payload ? payload.error : "Execution failed");
      }

      const execution = payload as ExecutionResult;
      setResult(execution);
      setStatusMessage(
        execution.exit_code === 0
          ? "Execution completed. Any new or changed files were pushed back to object storage."
          : "Execution finished with errors. Review stderr and adjust the code."
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatusMessage(`Copied ${text}`);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#1e1e1e] text-slate-300 font-sans">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#181818] px-6 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 hover:rotate-12 transition-transform text-emerald-500" />
            <h1 className="text-sm font-semibold tracking-wide text-white">FIELD LAB</h1>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="font-mono text-[10px] uppercase tracking-wider">
              {sessionId || "NO ACTIVE SESSION"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            size="sm"
            className="h-8 gap-2 bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-none rounded-sm px-4"
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
        <aside className="flex w-[260px] lg:w-[300px] flex-col border-r border-white/5 bg-[#181818] z-10">
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Explorer</h2>
                </div>
                <div className="space-y-4">
                  <div className="rounded border border-dashed border-white/10 p-4 bg-[#1e1e1e] hover:bg-[#252525] transition-colors">
                    <div className="mb-3 flex items-center gap-2 text-slate-300">
                      <UploadCloud className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs font-semibold">Workspace Inputs</span>
                    </div>
                    <Input
                      id="files"
                      type="file"
                      multiple
                      className="h-8 text-[11px] mb-3 bg-[#1e1e1e] border-white/10 text-slate-300 file:text-emerald-400 file:font-medium hover:border-emerald-500/50 transition-colors cursor-pointer rounded-sm"
                      onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                    />
                    <Button
                      size="sm"
                      className="w-full h-8 text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-sm"
                      onClick={handleUpload}
                      disabled={uploading || selectedFiles.length === 0}
                    >
                      {uploading ? <LoaderCircle className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Upload & Generate
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase text-slate-500 px-1 tracking-wider">Mounted Files</Label>
                    <div className="space-y-1 mt-1">
                      {displayFiles.length === 0 ? (
                        <p className="px-1 text-[11px] text-slate-600 italic">No files available</p>
                      ) : (
                        displayFiles.map((file) => (
                          <div
                            key={file.key}
                            className="group flex flex-col gap-0.5 rounded p-1.5 hover:bg-[#2a2a2a] transition-all cursor-pointer"
                            onClick={() => void copy(file.workspacePath)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate text-xs text-slate-300 font-medium">{file.name}</span>
                              <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 text-slate-500" />
                            </div>
                            <span className="truncate text-[9px] font-mono text-slate-500 group-hover:text-emerald-400/80 transition-colors">
                              {file.workspacePath}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {suggestedOutputPath && (
                <section>
                  <Label className="text-[9px] font-bold uppercase text-slate-500 px-1 tracking-wider">Output Target</Label>
                  <div className="mt-1 flex items-center justify-between rounded border border-white/5 bg-[#141414] p-2 hover:border-emerald-500/30 transition-colors group cursor-pointer" onClick={() => void copy(suggestedOutputPath)}>
                    <code className="truncate text-[10px] font-mono text-emerald-400/90">
                      {suggestedOutputPath}
                    </code>
                    <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 text-slate-500" />
                  </div>
                </section>
              )}

              <section>
                <Label className="text-[9px] font-bold uppercase text-slate-500 px-1 tracking-wider">Runtime Config</Label>
                <div className="mt-1 space-y-2">
                  <div className="flex items-center justify-between rounded border border-white/5 bg-[#141414] p-2 group cursor-pointer hover:border-emerald-500/30 transition-colors" onClick={() => void copy(entrypoint)}>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">ENTRY</span>
                    <code className="truncate text-[10px] font-mono text-emerald-400/90">
                      {entrypoint}
                    </code>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 text-[10px] rounded-sm transition-colors border ${pythonProfile === "default" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"}`}
                      onClick={() => setPythonProfile("default")}
                    >
                      Core 3.11
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 text-[10px] rounded-sm transition-colors border ${pythonProfile === "data-science" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"}`}
                      onClick={() => setPythonProfile("data-science")}
                    >
                      Data Science
                    </Button>
                  </div>
                </div>
              </section>
            </div>

          </div>
        </aside>

        {/* Main Workspace Area */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
          {/* Editor Panel */}
          <div className="flex flex-[2] flex-col overflow-hidden relative">
            <div className="flex h-9 items-center px-4 bg-[#1e1e1e] border-b border-black/20 shadow-sm z-10 space-x-1">
              {/* Tab */}
              <div className="flex items-center gap-2 h-full bg-[#1e1e1e] border-t-2 border-t-emerald-500 px-4 pt-0.5">
                <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] font-medium text-white">{entrypoint}</span>
              </div>
            </div>

            <div className="flex-1 w-full bg-[#1e1e1e]">
              <Editor
                height="100%"
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: '"IBM Plex Mono", "Menlo", "Monaco", "Courier New", monospace',
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  formatOnPaste: true,
                  lineHeight: 1.6
                }}
              />
            </div>
          </div>

          {/* Terminal / Output Panel */}
          <div className="flex flex-1 flex-col min-h-[250px] border-t border-white/10 bg-[#141414] z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.1)]">
            <div className="flex h-9 items-center justify-between border-b border-black/20 px-2 bg-[#181818]">
              <div className="flex items-center h-full gap-1">
                <button
                  className={`px-4 text-[10px] font-bold uppercase tracking-wider transition-all h-full flex items-center ${activeTab === "output" ? "text-white border-b border-white" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => setActiveTab("output")}
                >
                  Terminal
                </button>
                <button
                  className={`px-4 text-[10px] font-bold uppercase tracking-wider transition-all h-full flex items-center ${activeTab === "files" ? "text-white border-b border-white" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => setActiveTab("files")}
                >
                  Artifacts
                </button>
              </div>

              {/* Mini Status */}
              <div className="flex items-center gap-2 pr-2">
                <div className="flex items-center gap-1.5 max-w-[400px]">
                  <div className={`w-2 h-2 rounded-full ${errorMessage ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                  <span className="text-[9px] text-slate-400 truncate uppercase tracking-widest">{errorMessage || statusMessage}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-xs dark-scrollbar selection:bg-emerald-500/30">
              {activeTab === "output" && (
                <div className="space-y-4">
                  {result ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-4 text-[10px] pb-3 border-b border-white/5">
                        <span className={`font-bold uppercase ${result.exit_code === 0 ? 'text-emerald-400' : 'text-red-400'}`}>Process {result.exit_code === 0 ? 'Exited (0)' : `Failed (${result.exit_code})`}</span>
                        <span className="text-slate-500">{result.duration_ms}ms</span>
                      </div>

                      {result.stdout && (
                        <div className="text-slate-300 whitespace-pre-wrap leading-relaxed">{result.stdout}</div>
                      )}
                      {result.stderr && (
                        <div className="text-red-400/90 whitespace-pre-wrap leading-relaxed">{result.stderr}</div>
                      )}
                    </div>
                  ) : (
                      <div className="flex h-full flex-col items-center justify-center text-slate-500/50 gap-3 pt-8">
                        <Play className="h-6 w-6 opacity-30" />
                        <span className="text-[10px] uppercase tracking-widest font-semibold opacity-70">Awaiting Execution</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "files" && (
                <div className="space-y-4 max-w-2xl">
                  {result?.downloads && result.downloads.length > 0 ? (
                    <div className="grid gap-2">
                      {result.downloads.map((download) => (
                        <div key={download.key} className="flex items-center justify-between rounded bg-[#1e1e1e] p-2 hover:bg-[#252525] transition-colors border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5"><FileCode2 className="h-4 w-4 text-emerald-500" /></div>
                            <span className="text-xs text-slate-300 font-medium">{download.key}</span>
                          </div>
                          <a href={download.url} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" className="h-7 text-[10px] border-white/10 text-white bg-transparent hover:bg-white/10 rounded-sm">
                              Download
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                      <div className="flex h-full flex-col items-center justify-center text-slate-500/50 gap-3 pt-8">
                        <UploadCloud className="h-6 w-6 opacity-30" />
                        <span className="text-[10px] uppercase tracking-widest font-semibold opacity-70">No Results Found</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
