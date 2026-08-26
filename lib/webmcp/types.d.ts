interface WebMcpExecutionContext { signal: AbortSignal }

interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>, context: WebMcpExecutionContext): unknown | Promise<unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
}

interface WebMcpModelContext {
  registerTool(definition: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void>;
}

interface Document { modelContext?: WebMcpModelContext }
interface Window { originAgentCluster?: boolean }
