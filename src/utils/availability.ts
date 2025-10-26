import * as vscode from 'vscode';
import * as path from 'path';
import type { CommandAvailabilityMeta } from '../types/command';

export async function getActiveRepoName(): Promise<string | undefined> {
	try {
		const activeDoc = vscode.window.activeTextEditor?.document;
		const folder = activeDoc
			? vscode.workspace.getWorkspaceFolder(activeDoc.uri)
			: vscode.workspace.workspaceFolders?.[0];
		if (!folder) return undefined;
		const fallback = path.basename(folder.uri.fsPath);
		const gitExt: any = vscode.extensions.getExtension('vscode.git')?.exports;
		const api = gitExt?.getAPI?.(1);
		if (!api) return fallback;
		const repo = api.repositories.find((r: any) => folder.uri.fsPath.startsWith(r.rootUri.fsPath));
		const remote = repo?.state.remotes.find((r: any) => r.name === 'origin') ?? repo?.state.remotes[0];
		const url: string | undefined = remote?.fetchUrl ?? remote?.pushUrl;
		if (url) {
			const match = /\/([^\/]+?)(?:\.git)?$/i.exec(url);
			if (match) return match[1];
		}
		return fallback;
	} catch {
		return undefined;
	}
}

export function getActiveLanguageId(): string | undefined {
	return vscode.window.activeTextEditor?.document?.languageId;
}

export function isAvailable(meta: CommandAvailabilityMeta, repoName?: string, langId?: string): boolean {
	const langOk = !meta?.languages || (langId && meta.languages.includes(langId));
	if (meta?.category === 'general') {
		return !!langOk;
	}
	const nameOk = !meta?.allowedRepoNames || (repoName && meta.allowedRepoNames.some((n: string) => n.toLowerCase() === repoName.toLowerCase()));
	return !!langOk && !!nameOk;
}

// When listing tools, if we don't know the active language, ignore language gating
export function isAvailableForListing(meta: CommandAvailabilityMeta, repoName?: string, langId?: string): boolean {
	const repoOk = meta.category === 'general' || !meta.allowedRepoNames || (repoName && meta.allowedRepoNames.some(n => n.toLowerCase() === repoName.toLowerCase()));
	const langOk = !meta.languages || (langId ? meta.languages.includes(langId) : true);
	return !!repoOk && !!langOk;
}

export async function runWithAvailabilityGuard(
	meta: CommandAvailabilityMeta,
	targetUri: vscode.Uri | undefined,
	showWarning: (msg: string) => void,
	run: () => Promise<void> | void
): Promise<void> {
	// Determine repo name from target file's workspace, falling back to active
	let repoName: string | undefined;
	try {
		const gitExt: any = vscode.extensions.getExtension('vscode.git')?.exports;
		const api = gitExt?.getAPI?.(1);
		const folder = targetUri ? vscode.workspace.getWorkspaceFolder(targetUri) : undefined;
		const chosenFolder = folder ?? vscode.workspace.workspaceFolders?.[0];
		if (api && chosenFolder) {
			const repo = api.repositories.find((r: any) => chosenFolder.uri.fsPath.startsWith(r.rootUri.fsPath));
			const remote = repo?.state.remotes.find((r: any) => r.name === 'origin') ?? repo?.state.remotes[0];
			const url: string | undefined = remote?.fetchUrl ?? remote?.pushUrl;
			if (url) {
				const m = /\/([^\/]+?)(?:\.git)?$/i.exec(url);
				if (m) repoName = m[1];
			}
			if (!repoName) repoName = path.basename(chosenFolder.uri.fsPath);
		}
	} catch {}

	const langId = vscode.window.activeTextEditor?.document?.languageId;
	const ok = isAvailable(meta, repoName, langId);
	if (!ok) {
		if (meta.category !== 'general' && meta.allowedRepoNames && repoName && !meta.allowedRepoNames.some(n => n.toLowerCase() === repoName!.toLowerCase())) {
			showWarning(`This command is only available in repositories: ${meta.allowedRepoNames.join(', ')}`);
			return;
		}
		if (meta.languages && (!langId || !meta.languages.includes(langId))) {
			showWarning(`This command is only available for languages: ${meta.languages.join(', ')}`);
			return;
		}
		showWarning('This command is not available in the current context.');
		return;
	}

	await run();
}


