import * as vscode from 'vscode';
import type { CommandModule, McpResult } from '../types/command';

const command: CommandModule = {
	vscode: {
		id: 'ixdar-vs.onZBreakPoint',
		register: (context: vscode.ExtensionContext) => {
			const disposable = vscode.commands.registerCommand('ixdar-vs.onZBreakPoint', () => {
				const editor = vscode.window.activeTextEditor;
				if (editor === undefined) {
					return;
				}
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
			await vscode.commands.executeCommand('ixdar-vs.onZBreakPoint');
			return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Z breakpoint inserted' }) }] };
		},
	},
};

export default command;


