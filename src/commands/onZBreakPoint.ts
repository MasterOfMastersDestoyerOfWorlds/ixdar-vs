import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import { runWithAvailabilityGuard } from "@/utils/command/availability";
import * as strings from "@/utils/templating/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";

const commandName = "onZBreakPoint";
const languages = ["c", "cpp", "java", "csharp"];
const repoName = undefined;
const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const position = editor.selection.active;
  const snippet = new vscode.SnippetString();
  snippet.appendText("if(");
  snippet.appendTabstop();
  snippet.appendText(`){\n` + `\tfloat z_breakPoint = 0;\n` + `}`);
  editor.insertSnippet(snippet, position);
  const breakline = editor.document.lineAt(position.line + 1);
  const breakpoint = new vscode.SourceBreakpoint(
    new vscode.Location(editor.document.uri, breakline.range)
  );
  vscode.debug.addBreakpoints([breakpoint]);
  vscode.window.showInformationMessage("Breakpoint Set");
};

const mcpFunc = mcp.executeCommand(commandName, "Z breakpoint inserted");

const description = "Insert a z_breakpoint snippet at the current cursor position. Creates a conditional block with a breakpoint."
const inputSchema = {
	type: "object", properties: {} 
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
