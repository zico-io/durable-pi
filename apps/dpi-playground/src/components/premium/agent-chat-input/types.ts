import type { ReactNode } from "react";

export type AgentChatInputOption = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
};

export type AgentChatSkill = AgentChatInputOption & {
  icon?: ReactNode;
};

export type AgentChatQueuedMessage = {
  id: string;
  text: string;
  actionLabel?: string;
  disabled?: boolean;
};
