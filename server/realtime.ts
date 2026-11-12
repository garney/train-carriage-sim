import type { ChatMessage, Note } from "../shared/types.js";

export type Realtime = {
  chatMessage: (message: ChatMessage) => void;
  noteCreated: (userId: string, note: Note) => void;
};
