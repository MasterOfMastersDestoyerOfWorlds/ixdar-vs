import * as vscode from "vscode";
  export function createMockEditor(document: vscode.TextDocument): vscode.TextEditor {
    let editCallback: any = null;

    return {
      document,
      selection: {
        active: { line: 0, character: 0 },
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
        isEmpty: true,
        isReversed: false,
        isSingleLine: true,
        anchor: { line: 0, character: 0 },
      },
      selections: [],
      visibleRanges: [],
      options: {},
      viewColumn: 1,
      edit: jest.fn(async (callback: any) => {
        // Collect all edits without applying them (like real VS Code API)
        const edits: Array<{
          type: "replace" | "insert" | "delete";
          range?: vscode.Range;
          position?: vscode.Position;
          text?: string;
        }> = [];

        const editBuilder = {
          replace: jest.fn((range: vscode.Range, text: string) => {
            edits.push({ type: "replace", range, text });
          }),
          insert: jest.fn((position: vscode.Position, text: string) => {
            edits.push({ type: "insert", position, text });
          }),
          delete: jest.fn((range: vscode.Range) => {
            edits.push({ type: "delete", range });
          }),
        };

        // Execute callback to collect edits
        await callback(editBuilder);

        // Now apply all edits atomically to the ORIGINAL document text
        const doc = document as any;
        const originalText = doc.getText();

        // Convert all edits to offset-based operations
        const offsetEdits = edits.map((edit) => {
          if (edit.type === "replace" && edit.range) {
            return {
              startOffset: doc.offsetAt(edit.range.start),
              endOffset: doc.offsetAt(edit.range.end),
              text: edit.text || "",
            };
          } else if (edit.type === "insert" && edit.position) {
            const offset = doc.offsetAt(edit.position);
            return {
              startOffset: offset,
              endOffset: offset,
              text: edit.text || "",
            };
          } else if (edit.type === "delete" && edit.range) {
            return {
              startOffset: doc.offsetAt(edit.range.start),
              endOffset: doc.offsetAt(edit.range.end),
              text: "",
            };
          }
          return { startOffset: 0, endOffset: 0, text: "" };
        });

        // Sort edits in reverse order (last to first) to avoid offset shifting
        offsetEdits.sort((a, b) => b.startOffset - a.startOffset);

        // Apply all edits
        let newText = originalText;
        for (const edit of offsetEdits) {
          newText =
            newText.slice(0, edit.startOffset) +
            edit.text +
            newText.slice(edit.endOffset);
        }

        // Update the document with final text
        doc.getText = jest.fn(() => newText);

        // Update lines array for lineAt
        const newLines = newText.split("\n");
        doc.lineCount = newLines.length;
        doc.lineAt = jest.fn((line: number) => {
          const lineText = newLines[line] || "";
          return {
            lineNumber: line,
            text: lineText,
            range: {
              start: { line, character: 0 },
              end: { line, character: lineText.length },
            },
            rangeIncludingLineBreak: {
              start: { line, character: 0 },
              end: { line: line + 1, character: 0 },
            },
            firstNonWhitespaceCharacterIndex: lineText.search(/\S/),
            isEmptyOrWhitespace: lineText.trim().length === 0,
          };
        });

        return true;
      }),
      insertSnippet: jest.fn(),
      setDecorations: jest.fn(),
      revealRange: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
    } as any;
  }