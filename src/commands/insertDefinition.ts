import * as vscode from 'vscode';
import * as path from 'path';
import * as https from 'https';
import type { CommandModule, McpResult } from '../types/command';
import { runWithAvailabilityGuard } from '../utils/availability';

function slugifyForFile(term: string): string {
	const lower = term.trim().toLowerCase();
	const dashed = lower.replace(/[^a-z0-9]+/g, '-');
	return dashed.replace(/^-+|-+$/g, '');
}

async function definitionFileUriForDocument(term: string, document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (!workspaceFolder) {
		return undefined;
	}
	const slug = slugifyForFile(term);
	const defsDir = vscode.Uri.joinPath(workspaceFolder.uri, 'web', 'static', 'definitions');
	const fileUri = vscode.Uri.joinPath(defsDir, `${slug}.md`);
	return fileUri;
}

async function ensureDefinitionFile(term: string, fileUri: vscode.Uri): Promise<void> {
	try {
		await vscode.workspace.fs.stat(fileUri);
		return; // exists
	} catch {
		// create directory and file
		const dirUri = vscode.Uri.file(path.dirname(fileUri.fsPath));
		await vscode.workspace.fs.createDirectory(dirUri);
		const content = await fetchWikipediaSummary(term);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
	}
}

async function fetchWikipediaSummary(term: string): Promise<string> {
	const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
    return new Promise<string>((resolve) => {
		const req = https.get(apiUrl, { headers: { 'accept': 'application/json', 'user-agent': 'ixdar-vs/0.0.1' } }, (res: any) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk: string) => { body += chunk; });
			res.on('end', () => {
				try {
					const json = JSON.parse(body) as any;
					const extract: string | undefined = json?.extract;
					if (typeof extract === 'string' && extract.trim().length > 0) {
						resolve(extract.trim());
						return;
					}
				} catch (_) {
					// ignore parse errors
				}
				resolve(`${term} — definition unavailable.`);
			});
		});
		req.on('error', () => resolve(`${term} — definition unavailable.`));
	});
}

function getWordAtCursor(editor: vscode.TextEditor): { range: vscode.Range; word: string } | undefined {
	const position = editor.selection.active;
	const document = editor.document;
	const defaultRange = document.getWordRangeAtPosition(position);
	if (defaultRange) {
		const word = document.getText(defaultRange);
		return { range: defaultRange, word };
	}
	if (!editor.selection.isEmpty) {
		const range = new vscode.Range(editor.selection.start, editor.selection.end);
		const word = document.getText(range);
		return { range, word };
	}
	return undefined;
}

async function replaceWithShortcode(editor: vscode.TextEditor, range: vscode.Range, term: string): Promise<void> {
	const shortcode = `{{< def "${term}" >}}`;
	await editor.edit((editBuilder: vscode.TextEditorEdit) => {
		editBuilder.replace(range, shortcode);
	});
}

async function replaceAllOccurrencesInDocument(document: vscode.TextDocument, word: string): Promise<number> {
	const text = document.getText();
	const shortcode = `{{< def "${word}" >}}`;
	
	// Find all word boundaries for the word (case-insensitive)
	const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
	const matches: vscode.Range[] = [];
	let match;
	
	while ((match = wordRegex.exec(text)) !== null) {
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);
		matches.push(new vscode.Range(startPos, endPos));
	}
	
	if (matches.length === 0) {
		return 0;
	}
	
	// Open the document in an editor if not already open
	const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
	
	// Replace all occurrences in reverse order to maintain positions
	await editor.edit((editBuilder: vscode.TextEditorEdit) => {
		for (let i = matches.length - 1; i >= 0; i--) {
			editBuilder.replace(matches[i], shortcode);
		}
	});
	
	return matches.length;
}

export async function insertDefinitionForWord(word: string, filePath: string): Promise<{ success: boolean; message: string; replacements?: number }> {
	try {
		// Open or get the document
		const uri = vscode.Uri.file(filePath);
		let document: vscode.TextDocument;
		
		try {
			document = await vscode.workspace.openTextDocument(uri);
		} catch (error) {
			return { success: false, message: `Failed to open file: ${filePath}` };
		}
		
		// Check if it's a markdown file
		if (document.languageId !== 'markdown' && !document.fileName.toLowerCase().endsWith('.md')) {
			return { success: false, message: 'Definition insertion is only available in Markdown files.' };
		}
		
		const term = word.trim();
		if (!term) {
			return { success: false, message: 'Word cannot be empty.' };
		}
		
		// Get the definition file URI
		const fileUri = await definitionFileUriForDocument(term, document);
		if (!fileUri) {
			return { success: false, message: 'Unable to resolve workspace folder for definitions.' };
		}
		
		// Ensure definition file exists
		await ensureDefinitionFile(term, fileUri);
		
		// Replace all occurrences
		const replacements = await replaceAllOccurrencesInDocument(document, term);
		
		if (replacements === 0) {
			return { success: true, message: `No occurrences of "${term}" found in the document.`, replacements: 0 };
		}
		
		return { 
			success: true, 
			message: `Replaced ${replacements} occurrence(s) of "${term}" with definition shortcode.`,
			replacements 
		};
		
	} catch (error: any) {
		return { success: false, message: `Error: ${error.message}` };
	}
}

const command: CommandModule = {
	meta: {
		category: 'repo',
		allowedRepoNames: ['KriegEterna'],
		languages: ['markdown'],
	},
	vscode: {
		id: 'ixdar-vs.insertDefinitionShortcode',
		register: (context: vscode.ExtensionContext) => {
			const disposable = vscode.commands.registerCommand('ixdar-vs.insertDefinitionShortcode', async () => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					return;
				}
				await runWithAvailabilityGuard(
					command.meta,
					editor.document.uri,
					(msg) => vscode.window.showWarningMessage(msg),
					async () => {
						const document = editor.document;
						const found = getWordAtCursor(editor);
						if (!found || !found.word || found.word.trim().length === 0) {
							vscode.window.showInformationMessage('No word found at cursor.');
							return;
						}
						const term = found.word.trim();
						const fileUri = await definitionFileUriForDocument(term, document);
						if (!fileUri) {
							vscode.window.showErrorMessage('Unable to resolve workspace folder for definitions.');
							return;
						}
						await ensureDefinitionFile(term, fileUri);
						await replaceWithShortcode(editor, found.range, term);
						vscode.window.showInformationMessage(`Inserted definition for "${term}"`);
					}
				);
			});

			context.subscriptions.push(disposable);
		},
	},
	mcp: {
		tool: {
			name: 'insert_definition_shortcode',
			description: 'Insert a definition shortcode in a Markdown file. Replaces all occurrences of the specified word with a Hugo definition shortcode. Fetches Wikipedia summary and creates definition file.',
			inputSchema: {
				type: 'object',
				properties: {
					word: { type: 'string', description: 'The word to create a definition for and replace in the document' },
					filePath: { type: 'string', description: 'Absolute path to the Markdown file to modify' },
				},
				required: ['word', 'filePath'],
			},
		},
		call: async (args: any): Promise<McpResult> => {
			const word = args?.word as string;
			const filePath = args?.filePath as string;
			if (!word || !filePath) {
				return {
					content: [{ type: 'text', text: JSON.stringify({ error: "Both 'word' and 'filePath' parameters are required" }) }],
					isError: true,
				};
			}
			const result = await insertDefinitionForWord(word, filePath);
			if (!result.success) {
				return { content: [{ type: 'text', text: JSON.stringify({ error: result.message }) }], isError: true };
			}
			return {
				content: [{ type: 'text', text: JSON.stringify({ success: true, message: result.message, replacements: result.replacements }) }],
			};
		},
	},
};

export default command;
