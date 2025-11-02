export function getImportString(module: any): string {
  return `import * as ${module} from 'ixdar-vs/src/${module}';`;
}