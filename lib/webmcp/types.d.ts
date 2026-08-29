interface WebMCPExecutionOptions {
  signal?: AbortSignal;
}

interface WebMCPToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    options?: WebMCPExecutionOptions,
  ) => unknown;
}

interface WebMCPModelContext extends EventTarget {
  registerTool(
    tool: WebMCPToolDefinition,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  getTools?(): Promise<Array<{ name: string }>>;
}

interface Document {
  modelContext?: WebMCPModelContext;
}
