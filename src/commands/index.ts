/**
 * Commands Index
 * 
 * This file imports all command modules, which triggers their @RegisterCommand decorators
 * and automatically registers them with the CommandRegistry singleton.
 * 
 * To add a new command:
 * 1. Create a new file in src/commands/ with your CommandModule
 * 2. Add the @RegisterCommand decorator before the export
 * 3. Import the file here
 */

// Import all commands to trigger registration via decorators
import './insertDefinition';
import './insertEssayImage';
import './makeTemplateFromFile';
import './newIxdarCommand';
import './onZBreakPoint';
import './package';
import './removeAllComments';

// Re-export the registry for use in extension.ts
export { CommandRegistry } from '@/utils/commandRegistry';

