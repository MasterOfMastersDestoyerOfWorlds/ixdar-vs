export interface MethodInfo {
    name: string;
    node: Parser.SyntaxNode;
    text: string;
    startPosition: vscode.Position;
    endPosition: vscode.Position;
}
  