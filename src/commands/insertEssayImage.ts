import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import { runWithAvailabilityGuard } from "@/utils/availability";
import { RegisterCommand } from "@/utils/commandRegistry";
import * as mcp from "@/utils/mcp";

async function listEssayImagesForDocument(
  document: vscode.TextDocument
): Promise<string[] | undefined> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return undefined;
  }
  const imagesDir = vscode.Uri.joinPath(
    workspaceFolder.uri,
    "web",
    "static",
    "essay",
    "essay-description-image"
  );
  try {
    const entries = await vscode.workspace.fs.readDirectory(imagesDir);
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
    return entries
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File &&
          allowed.has(name.toLowerCase().slice(name.lastIndexOf(".")))
      )
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b));
  } catch (_) {
    return [];
  }
}

const languages = ["markdown"];
const repoName = "KriegEterna";
const commandName = "insertEssayImageShortcode";
const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const images = await listEssayImagesForDocument(document);
  if (!images) {
    vscode.window.showErrorMessage(
      "Unable to resolve workspace folder to locate essay images."
    );
    return;
  }
  if (images.length === 0) {
    vscode.window.showWarningMessage(
      "No images found in web/static/essay/essay-description-image"
    );
    return;
  }
  const selected = await vscode.window.showQuickPick(images, {
    placeHolder: "Select an essay image to insert",
  });
  if (!selected) {
    return;
  }
  const snippet = new vscode.SnippetString(
    `{{<essay-image file="${selected}" caption="$1">}}`
  );
  await editor.insertSnippet(snippet, editor.selection.active);
};

const mcpFunc = async (args: any): Promise<McpResult> => {
  const word = args?.word as string;
  const filePath = args?.filePath as string;
  const imageFileName = args?.imageFileName as string;
  const caption = args?.caption as string;
  const lineNumber = args?.lineNumber as number;
  try {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const zeroBased = Math.max(
      0,
      Math.min(document.lineCount, Math.floor(lineNumber) - 1)
    );
    const insertPosition = new vscode.Position(zeroBased, 0);
    const shortcode = `{{<essay-image file="${imageFileName}" caption="${caption}">}}\n`;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, insertPosition, shortcode);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return mcp.returnMcpError({ error: "Failed to apply edit" });
    }
    await document.save();
    return mcp.returnMcpResult({
      success: true,
      insertedAtLine: zeroBased + 1,
    });
  } catch (error: any) {
    return mcp.returnMcpError({ error: error.message ?? "Unknown error" });
  }
};

const description =
  "Insert an essay-image shortcode above a specified line in a Markdown file.";
const inputSchema = {
  type: "object",
  properties: {
    filePath: {
      type: "string",
      description: "Absolute path to the Markdown file to modify",
    },
    imageFileName: {
      type: "string",
      description:
        "Image file name located in web/static/essay/essay-description-image",
    },
    caption: {
      type: "string",
      description: "Caption text to include in the shortcode",
    },
    lineNumber: {
      type: "number",
      description: "1-based line number to insert above",
    },
  },
  required: ["filePath", "imageFileName", "caption", "lineNumber"],
};

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  description,
  inputSchema,
  mcpFunc
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
