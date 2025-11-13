import * as vscode from "vscode";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as decor from "@/utils/vscode/decor";
import * as userInputs from "@/utils/vscode/userInputs";
import * as strings from "@/utils/templating/strings";
import * as commandRegistry from "@/utils/command/commandRegistry";
import { CommandPipeline } from "@/types/command/commandModule";

/**
 *  @ix-description captureRegex: displays a textbox that accepts regex and turns the text red in the box if the regex is invalid, selects/highlights all of the regex matches in the open file and then copies them to the copy buffer on enter
 */
const languages = undefined;
const repoName = undefined;

const pipeline: CommandPipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
      .step({
        key: "regex" as const,
        schema: {
          type: "string",
          description:
            "Regular expression to capture. Matches will be copied to the clipboard.",
        },
        prompt: async () => {
          const editor = userInputs.getActiveEditor();
          const document = editor.document;
          const documentText = document.getText();
          const matchDecorationType = decor.highlightDecor();

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
                let match: RegExpExecArray | null;

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
              } catch {
                decor.clearDecorations(editor, matchDecorationType);
                return "Invalid regular expression.";
              }
            },
          });

          decor.clearDecorations(editor, matchDecorationType);

          if (!regexString) {
            throw new Error("No regular expression provided.");
          }

          return regexString;
        },
        resolveFromArgs: async ({ args }: commandModule.McpInputContext) => {
          const regex =
            (typeof args.regex === "string" && args.regex) ||
            (typeof args.pattern === "string" && args.pattern);
          if (!regex) {
            throw new Error("Property 'regex' is required.");
          }
          new RegExp(regex, "g"); // Validate
          return regex;
        },
      })
      .build(),
  execute: async (_context, inputs) => {
    const editor = userInputs.getActiveEditor();
    const documentText = editor.document.getText();

    const matches = await strings.captureRegex(documentText, inputs.regex);

    return {
      matchCount: matches.length,
      regex: inputs.regex,
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result) {
      return;
    }

    context.addMessage(
      `${result.matchCount} match${result.matchCount === 1 ? "" : "es"} selected and copied to clipboard.`
    );
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
