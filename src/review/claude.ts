export type ClaudeRunner = (args: { prompt: string; schema: object; model: string; addDirs: string[] }) => Promise<string>;
