import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as decor from "@/utils/vscode/decor";
import * as inputs from "@/utils/vscode/input";
import * as strings from "@/utils/templating/strings";

/**
 * captureRegex: displays a textbox that accepts regex and turns the text red in the box if the regex is invalid, selects/highlights all of the regex matches in the open file  and then copies them to the copy buffer on enter
 */
const commandName = "captureRegex";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const editor = inputs.getActiveEditor();

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
          decor.clearDecorations(editor, matchDecorationType);
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
            ranges.push(
              new vscode.Range(
                document.positionAt(match.index),
                document.positionAt(match.index + match[0].length)
              )
            );
          }

          editor.setDecorations(matchDecorationType, ranges);

          return null;
        } catch (e) {
          decor.clearDecorations(editor, matchDecorationType);
          return "Invalid regular expression.";
        }
      },
    });
    decor.clearDecorations(editor, matchDecorationType);

    if (regexString === undefined || !regexString) {
      vscode.window.showInformationMessage("No regular expression provided.");
      return;
    }

    const matchedTexts = await strings.captureRegex(documentText, regexString);

    vscode.window.showInformationMessage(
      `${matchedTexts.length} match${matchedTexts.length > 1 ? "es" : ""} selected and copied to clipboard.`
    );
  } catch (e) {
    decor.clearDecorations(editor, matchDecorationType);
    vscode.window.showErrorMessage(
      `An unexpected error occurred: ${e instanceof Error ? e.message : String(e)}`
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
  description,
  inputSchema,
  mcpFunc
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
