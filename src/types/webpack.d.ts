/**
 * TypeScript declarations for webpack-specific features
 */

interface RequireContext {
  keys(): string[];
  (id: string): any;
  <T>(id: string): T;
  resolve(id: string): string;
  id: string;
}

interface NodeRequire {
  context(
    directory: string,
    useSubdirectories?: boolean,
    regExp?: RegExp,
    mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once'
  ): RequireContext;
}

declare const require: NodeRequire;

declare const __ix_description: string;
declare const __modulePath: string;
declare const __moduleName: string;
declare const __ix_module_description: string | undefined;


declare const __ix_module: {
  readonly description: string;
  readonly commandName: string;
};