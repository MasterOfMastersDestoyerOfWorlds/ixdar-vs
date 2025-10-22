import * as vscode from 'vscode';
import type { CommandModule, McpResult } from '../types/command';
import { runWithAvailabilityGuard } from '../utils/availability';

const command: CommandModule = {
	meta: {
		category: 'general',
		languages: ['c', 'cpp', 'java', 'csharp'],
	},
	vscode: {
		id: 'ixdar-vs.onZBreakPoint',
		register: (context: vscode.ExtensionContext) => {
			const disposable = vscode.commands.registerCommand('ixdar-vs.onZBreakPoint', async () => {
				const editor = vscode.window.activeTextEditor;
				if (editor === undefined) {
					return;
				}
				await runWithAvailabilityGuard(
					command.meta,
					editor.document.uri,
					(msg) => vscode.window.showWarningMessage(msg),
					() => {
						const position = editor.selection.active;
						const snippet = new vscode.SnippetString();
						snippet.appendText('if(');
						snippet.appendTabstop();
						snippet.appendText(`){\n` + `\tfloat z_breakPoint = 0;\n` + `}`);
						editor.insertSnippet(snippet, position);
						const breakline = editor.document.lineAt(position.line + 1);
						const breakpoint = new vscode.SourceBreakpoint(new vscode.Location(editor.document.uri, breakline.range));
						vscode.debug.addBreakpoints([breakpoint]);
						vscode.window.showInformationMessage('Breakpoint Set');
					}
				);
			});
			context.subscriptions.push(disposable);
		},
	},
	mcp: {
		tool: {
			name: 'insert_z_breakpoint',
			description: 'Insert a z_breakpoint snippet at the current cursor position. Creates a conditional block with a breakpoint.',
			inputSchema: { type: 'object', properties: {} },
		},
		call: async (_args: any): Promise<McpResult> => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active text editor' }) }], isError: true };
			}
			const okLangs = new Set(['c', 'cpp', 'java', 'csharp']);
			if (!okLangs.has(editor.document.languageId)) {
				return { content: [{ type: 'text', text: JSON.stringify({ error: 'Not a supported language for z breakpoint (c, cpp, java, csharp)' }) }], isError: true };
			}
			await vscode.commands.executeCommand('ixdar-vs.onZBreakPoint');
			return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Z breakpoint inserted' }) }] };
		},
	},
};

export default command;


