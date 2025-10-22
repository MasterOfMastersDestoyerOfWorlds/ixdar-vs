export interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: any;
}

export interface McpResult {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}

export interface CommandAvailabilityMeta {
	category: 'general' | 'repo';
	allowedRepoNames?: string[]; // case-insensitive repo names
	languages?: string[]; // VS Code language IDs
}

export interface CommandModule {
	meta: CommandAvailabilityMeta;
	vscode: {
		id: string;
		register: (context: import('vscode').ExtensionContext) => void;
	};
	mcp: {
		tool: McpToolDefinition;
		call: (args: any) => Promise<McpResult>;
	};
}


