import { Copy, FileCode2, FlaskConical, LoaderCircle, Play, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";
import { Textarea } from "./components/ui/textarea";

interface UploadedFile {
  name: string;
  key: string;
  size: number;
  contentType?: string;
}

interface UploadResponse {
  sessionId: string;
  sessionRoot: string;
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

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [suggestedOutputPath, setSuggestedOutputPath] = useState("");
  const [code, setCode] = useState(starterCode);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Upload source files to create a runnable workspace.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      const response = await fetch("/api/uploads", {
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
      setSuggestedOutputPath(upload.suggestedOutputPath);
      setCode(upload.suggestedCode);
      setResult(null);
      setStatusMessage(`Session ${upload.sessionId} is ready. Adjust the Python and run the transformation.`);
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

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId,
          filePaths,
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
    <main className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <Card className="overflow-hidden bg-[linear-gradient(160deg,rgba(255,251,247,0.96),rgba(255,245,232,0.88))]">
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between">
              <Badge>Field Lab</Badge>
              <Badge variant="outline">TS demo stack</Badge>
            </div>
            <div className="space-y-3">
              <CardTitle className="max-w-lg text-5xl md:text-6xl">
                Turn raw files into sandboxed Python experiments.
              </CardTitle>
              <CardDescription className="max-w-xl text-base leading-7">
                Upload a few source files, inspect the exact bucket-relative paths, then run Python transformations inside the
                executor service without leaving the browser.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 rounded-[28px] border border-border/80 bg-white/70 p-5 md:grid-cols-2">
              <div>
                <Label>Session</Label>
                <p className="mt-2 break-all font-mono text-sm text-foreground">{sessionId || "Not created yet"}</p>
              </div>
              <div>
                <Label>Suggested Output</Label>
                <p className="mt-2 break-all font-mono text-sm text-foreground">{suggestedOutputPath || "Upload a file to generate one."}</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-dashed border-border bg-[#fef7ef] p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-[#132433] p-3 text-white">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-3xl">Upload source material</h2>
                  <p className="text-sm text-muted-foreground">Files are stored in MinIO/S3, then staged into the sandbox using explicit object keys.</p>
                </div>
              </div>
              <Label htmlFor="files">Choose files</Label>
              <Input
                id="files"
                className="mt-2"
                type="file"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedFiles.length === 0 ? (
                  <Badge variant="secondary">No local files selected</Badge>
                ) : (
                  selectedFiles.map((file) => (
                    <Badge key={`${file.name}-${file.size}`} variant="secondary">
                      {file.name}
                    </Badge>
                  ))
                )}
              </div>
              <Button className="mt-5 w-full sm:w-auto" onClick={handleUpload} disabled={uploading}>
                {uploading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Upload To Object Storage
              </Button>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Label>Available bucket-relative paths</Label>
                <Badge variant="outline">{displayFiles.length} file(s)</Badge>
              </div>
              <div className="grid gap-3">
                {displayFiles.length === 0 ? (
                  <Card className="bg-white/65">
                    <CardContent className="p-5 text-sm text-muted-foreground">
                      Upload files and this panel will show the exact `file_paths` sent to the sandbox executor.
                    </CardContent>
                  </Card>
                ) : (
                  displayFiles.map((file) => (
                    <Card key={file.key} className="bg-white/72">
                      <CardContent className="flex items-start justify-between gap-4 p-5">
                        <div className="space-y-1">
                          <div className="font-medium">{file.name}</div>
                          <div className="break-all font-mono text-xs text-muted-foreground">{file.key}</div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{file.sizeLabel}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => void copy(file.key)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden bg-[#102131] text-slate-50 shadow-editor">
            <CardHeader className="border-b border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Badge className="mb-3 bg-[#f08c48] text-[#102131]">Python Studio</Badge>
                  <CardTitle className="text-4xl">Write the transformation</CardTitle>
                  <CardDescription className="mt-2 max-w-2xl text-slate-300">
                    Read and write using the exact workspace paths shown on the left. Outputs are pushed back to object storage after execution.
                  </CardDescription>
                </div>
                <Button
                  className="shrink-0 bg-[#f08c48] text-[#102131] hover:bg-[#f3a063]"
                  onClick={handleRun}
                  disabled={!readyToRun || running}
                >
                  {running ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Run Transform
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="bg-white/10 text-white">
                  Working directory: /workspace
                </Badge>
                <Badge variant="secondary" className="bg-white/10 text-white">
                  Network: disabled
                </Badge>
              </div>
              <Textarea className="min-h-[460px]" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="bg-white/78">
              <CardHeader>
                <Badge variant="outline" className="w-fit">Run Status</Badge>
                <CardTitle className="text-3xl">Workbench Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-7 text-foreground">{statusMessage}</p>
                {errorMessage ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p> : null}
                <Separator />
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>1. Upload files to create a session namespace.</p>
                  <p>2. Use the copied `file_paths` inside your Python code.</p>
                  <p>3. Write transformed outputs to a new path like the suggested output path.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/78">
              <CardHeader>
                <Badge variant="outline" className="w-fit">Executor Result</Badge>
                <CardTitle className="text-3xl">Stdout, stderr, and downloads</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {result ? (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <Badge>{result.status}</Badge>
                      <Badge variant="secondary">exit {String(result.exit_code)}</Badge>
                      <Badge variant="outline">{result.duration_ms ?? 0} ms</Badge>
                    </div>
                    <div className="space-y-3">
                      <Label>stdout</Label>
                      <pre className="overflow-x-auto rounded-[24px] bg-[#132433] p-4 font-mono text-xs text-emerald-200">{result.stdout || "(empty)"}</pre>
                    </div>
                    <div className="space-y-3">
                      <Label>stderr</Label>
                      <pre className="overflow-x-auto rounded-[24px] bg-[#351f28] p-4 font-mono text-xs text-rose-200">{result.stderr || "(empty)"}</pre>
                    </div>
                    <div className="space-y-3">
                      <Label>Uploaded outputs</Label>
                      <div className="grid gap-3">
                        {result.downloads.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No new or changed files were uploaded.</p>
                        ) : (
                          result.downloads.map((download) => (
                            <Card key={download.key} className="bg-[#fffaf4]">
                              <CardContent className="flex items-center justify-between gap-3 p-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 font-medium">
                                    <FileCode2 className="h-4 w-4 text-[#f08c48]" />
                                    <span className="truncate">{download.key}</span>
                                  </div>
                                </div>
                                <a href={download.url} target="_blank" rel="noreferrer">
                                  <Button variant="secondary" size="sm">Download</Button>
                                </a>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[24px] border border-border bg-[#fffaf4] p-6 text-sm leading-7 text-muted-foreground">
                    Your first run will show stdout, stderr, exit code, and direct download links for every object the executor uploaded back to storage.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-between gap-4 border-t border-border/60 px-2 pt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          MinIO + sandbox executor + React demo
        </span>
        <span>Built to teach the exact `file_paths` execution model.</span>
      </footer>
    </main>
  );
}
