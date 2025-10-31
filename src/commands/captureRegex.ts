import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";
import * as decor from "@/utils/decor";

/**
 * captureRegex: displays a textbox that accepts regex and turns the text red in the box if the regex is invalid, selects/highlights all of the regex matches in the open file  and then copies them to the copy buffer on enter
 */
const commandName = "captureRegex";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active text editor found.");
    return;
  }

  const document = editor.document;
  const documentText = document.getText();

  const matchDecorationType = decor.highlightDecor();

  try {
    const regexString = await vscode.window.showInputBox({
      prompt:
        "Enter a regular expression to find, select, and copy all matches.",
      placeHolder: "e.g., const\\s+(\\w+)",
      validateInput: (text: string): string | null => {
        if (!text) {
          editor.setDecorations(matchDecorationType, []);
          return null;
        }
        try {
          const regex = new RegExp(text, "g");

          const ranges: vscode.Range[] = [];
          let match;

          while ((match = regex.exec(documentText)) !== null) {
            if (match.index === regex.lastIndex) {
              regex.lastIndex++;
            }

            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            ranges.push(new vscode.Range(startPos, endPos));
          }

          editor.setDecorations(matchDecorationType, ranges);

          return null;
        } catch (e) {
          editor.setDecorations(matchDecorationType, []);
          return "Invalid regular expression.";
        }
      },
    });

    editor.setDecorations(matchDecorationType, []);
    matchDecorationType.dispose();

    if (regexString === undefined || !regexString) {
      vscode.window.showInformationMessage("No regular expression provided.");
      return;
    }

    const regex = new RegExp(regexString, "g");
    const matchedTexts: string[] = [];
    let match;

    while ((match = regex.exec(documentText)) !== null) {
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }

      matchedTexts.push(match[0]);
    }

    const textToCopy = matchedTexts.join("\n");
    await vscode.env.clipboard.writeText(textToCopy);

    const message = `${matchedTexts.length} match${matchedTexts.length > 1 ? "es" : ""} selected and copied to clipboard.`;
    vscode.window.showInformationMessage(message);
  } catch (e) {
    editor.setDecorations(matchDecorationType, []);
    matchDecorationType.dispose();

    const errorMessage = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(
      `An unexpected error occurred: ${errorMessage}`
    );
  }
};

const mcpFunc = mcp.executeCommand(
  commandName,
  (args: any) => "Command captureRegex executed"
);

const description =
  "displays a textbox that accepts regex and turns the text red in the box if the regex is invalid, selects/highlights all of the regex matches in the open file  and then copies them to the copy buffer on enter";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
