import * as vscode from "vscode";
import * as commandModule from "@/types/command/commandModule";
import * as commandRegistry from "@/utils/command/commandRegistry";
import { CommandPipeline } from "@/types/command/commandModule";

/**
 *  @ix-description onZBreakPoint: Insert a z_breakpoint snippet at the current cursor position. Creates a conditional block with a breakpoint.
 */

const languages = ["c", "cpp", "java", "csharp"];
const repoName = undefined;

const pipeline: CommandPipeline = {
  execute: async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("No active editor found.");
    }

    const position = editor.selection.active;
    const snippet = new vscode.SnippetString();
    snippet.appendText("if(");
    snippet.appendTabstop();
    snippet.appendText(`){\n\tfloat z_breakPoint = 0;\n}`);
    await editor.insertSnippet(snippet, position);

    const breakline = editor.document.lineAt(position.line + 1);
    const breakpoint = new vscode.SourceBreakpoint(
      new vscode.Location(editor.document.uri, breakline.range)
    );
    vscode.debug.addBreakpoints([breakpoint]);

    return {
      breakpointAdded: true,
      line: breakline.lineNumber,
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result?.breakpointAdded) {
      return;
    }

    context.addMessage("Breakpoint set and snippet inserted.");
  },
};

const command: commandModule.CommandModule =
  new commandModule.CommandModuleImpl({
    repoName,
    ixModule: __ix_module,
    languages,
    pipeline,
  });

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
