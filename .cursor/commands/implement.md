# High Level Goal
Implement the command described in this file. We want a singular function that does the described behavior and self-commenting code.

# Best Practices
- When you need to import a module use the format: import * as {module_name} from @/utils/{module_folder}/{module_name}
- Leave js-doc style comments at the top of a function but never in the function body
- Commands should be a single function that does the descripition, do not make other functions in a command file
- If you think that a piece of a command could be used later, find the appropiate module to add it to and export it as a function there
- Always strive for a single source of truth on a piece of code or data.

# Descriptions of commonly used modules
These descriptions should be available at the top of each utils module in a js-doc marked with @description. If you beleive we need a new category of utility tell me and describe it before making it.

## VSCode
Modules used for the manipulation of the vscode editor

### utils/vscode/inputs
Use this module for all interactions with vscode where we need to get input from the user. 

### utils/vscode/fs
Use this module for all file system operations. 

## Templating
Modules used for the creation of code generation templates and parsing

### utils/templating/strings
Use this module for all single word string manipulation, pattern matching, and classification of string types.

### utils/templating/parser
Use this module for all multi-word string manipulation and structural pattern matching and structure changes of code files. This module uses tree-sitter for its parsing and structural manipulation.

### utils/templating/importer
Use this module for generation of import strings, module name, and module path extraction.

## AI
Modules used for interacting with the MCP server or getting code generations from an AI model provider

### utils/ai/mcp
Use this module to create outputs for the MCP server.

### utils/ai/aiCodeGenerator
Use this module to get code generations from an AI model provider