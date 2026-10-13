"use client";

import type { KeyboardEvent } from "react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import type { AgentChatSkill } from "./types";

export type ComposerValue = {
  text: string;
  skillIds: string[];
};

export type AgentChatComposerHandle = {
  focus: () => void;
  clear: () => void;
  insertSkill: (skill: AgentChatSkill) => void;
  serialize: () => ComposerValue;
  getSlashQuery: () => string | null;
};

export type AgentChatComposerProps = {
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  autoFocus?: boolean;
  maxLength?: number;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
  className?: string;
  skills: readonly AgentChatSkill[];
  defaultValue?: string;
  submitOnEnter?: boolean;
  onChange?: (value: ComposerValue) => void;
  onSlashQueryChange?: (query: string | null) => void;
  onNavKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

const LINE_HEIGHT_REM = 1.75;
// Skill query is a trailing "/word" run that does not contain spaces or
// another slash, measured from the caret backwards.
const SLASH_QUERY = /(?:^|\s)\/([^\s/]*)$/;
const SLASH_TOKEN = /\/([^\s/]*)$/;

function isSkillPill(node: Node | null) {
  return node instanceof HTMLElement && typeof node.dataset.skillId === "string";
}

function buildPill(skill: AgentChatSkill) {
  const pill = document.createElement("span");
  pill.dataset.skillId = skill.id;
  pill.dataset.skillLabel = skill.label;
  pill.contentEditable = "false";
  pill.setAttribute("role", "img");
  pill.setAttribute("aria-label", skill.label);
  pill.className = "font-medium text-accent";
  pill.textContent = `/${skill.label}`;
  return pill;
}

function serializeEditor(editor: HTMLElement): ComposerValue {
  const skillIds: string[] = [];

  function read(node: Node): string {
    let out = "";

    node.childNodes.forEach((child, index) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        return;
      }

      if (!(child instanceof HTMLElement)) {
        return;
      }

      if (isSkillPill(child)) {
        out += `/${child.dataset.skillLabel ?? ""}`;
        const id = child.dataset.skillId;
        if (id && !skillIds.includes(id)) {
          skillIds.push(id);
        }
        return;
      }

      if (child.tagName === "BR") {
        out += "\n";
        return;
      }

      if (child.tagName === "DIV" || child.tagName === "P") {
        if (out.length > 0 || index > 0) {
          out += "\n";
        }
      }

      out += read(child);
    });

    return out;
  }

  return { text: read(editor), skillIds };
}

function readSlashQuery(editor: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const node = range.startContainer;

  if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) {
    return null;
  }

  const upToCaret = (node.textContent ?? "").slice(0, range.startOffset);
  const match = SLASH_QUERY.exec(upToCaret);
  return match ? (match[1] ?? "") : null;
}

function insertSkillAtCaret(editor: HTMLElement, skill: AgentChatSkill, emit: () => void) {
  editor.focus();
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  // Anchor to the caret, or fall back to the end of the editor.
  let range: Range;
  if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    range = selection.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  // Strip the typed "/query" run immediately before the caret.
  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    const offset = range.startOffset;
    const upToCaret = (node.textContent ?? "").slice(0, offset);
    const match = SLASH_TOKEN.exec(upToCaret);
    if (match) {
      const deletion = document.createRange();
      deletion.setStart(node, match.index);
      deletion.setEnd(node, offset);
      deletion.deleteContents();
      range.setStart(node, match.index);
      range.collapse(true);
    }
  }

  const pill = buildPill(skill);
  const trailingSpace = document.createTextNode(" ");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(pill);
  fragment.appendChild(trailingSpace);
  range.insertNode(fragment);

  const caret = document.createRange();
  caret.setStartAfter(trailingSpace);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);

  emit();
}

function deletePillBeforeCaret(editor: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const offset = range.startOffset;
  let pill: HTMLElement | null = null;

  if (node === editor && offset > 0) {
    const before = editor.childNodes[offset - 1];
    if (isSkillPill(before)) {
      pill = before as HTMLElement;
    }
  } else if (node.nodeType === Node.TEXT_NODE && offset === 0) {
    if (isSkillPill(node.previousSibling)) {
      pill = node.previousSibling as HTMLElement;
    }
  } else if (node instanceof HTMLElement && offset > 0) {
    const before = node.childNodes[offset - 1];
    if (isSkillPill(before)) {
      pill = before as HTMLElement;
    }
  }

  if (pill) {
    pill.remove();
    return true;
  }

  return false;
}

function seedEditor(editor: HTMLElement, value: string, skills: readonly AgentChatSkill[]) {
  editor.replaceChildren();
  if (!value) {
    return;
  }

  // Longest labels first so "/AI SDK" is not shadowed by a shorter "/AI".
  const ordered = [...skills].sort((a, b) => b.label.length - a.label.length);
  const fragment = document.createDocumentFragment();
  let buffer = "";

  const flush = () => {
    if (buffer) {
      fragment.appendChild(document.createTextNode(buffer));
      buffer = "";
    }
  };

  let i = 0;
  while (i < value.length) {
    const char = value[i];

    if (char === "/") {
      const rest = value.slice(i + 1);
      const skill = ordered.find((entry) => rest.startsWith(entry.label));
      if (skill) {
        flush();
        fragment.appendChild(buildPill(skill));
        i += 1 + skill.label.length;
        continue;
      }
    }

    if (char === "\n") {
      flush();
      fragment.appendChild(document.createElement("br"));
      i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }

  flush();
  editor.appendChild(fragment);
}

export const AgentChatComposer = forwardRef<AgentChatComposerHandle, AgentChatComposerProps>(
  function AgentChatComposer(
    {
      id,
      "aria-label": ariaLabel = "Agent prompt",
      "aria-labelledby": ariaLabelledBy,
      "aria-describedby": ariaDescribedBy,
      autoFocus = false,
      maxLength,
      value,
      placeholder,
      disabled = false,
      minRows = 2,
      maxRows = 7,
      className,
      skills,
      defaultValue = "",
      submitOnEnter = true,
      onChange,
      onSlashQueryChange,
      onNavKeyDown,
      onSubmit,
      onFocus,
      onBlur,
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const composing = useRef(false);
    const acceptedHTML = useRef("");
    const [, reconcile] = useReducer((n: number) => n + 1, 0);
    const skillsRef = useRef(skills);
    skillsRef.current = skills;

    const emit = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      if (composing.current) return;
      let value = serializeEditor(editor);
      if (maxLength !== undefined && value.text.length > Math.max(0, maxLength)) {
        editor.innerHTML = acceptedHTML.current;
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        value = serializeEditor(editor);
      }
      acceptedHTML.current = editor.innerHTML;
      editor.dataset.empty = value.text.length === 0 ? "true" : "false";
      onChange?.(value);
      onSlashQueryChange?.(readSlashQuery(editor));
      reconcile();
    }, [onChange, onSlashQueryChange, maxLength]);

    const initialText = useRef(defaultValue);
    const initialized = useRef(false);
    // Only replace DOM when the external value differs, preserving the caret
    // and skill pills during ordinary controlled typing. Defer during IME input.
    useLayoutEffect(() => {
      const editor = editorRef.current;
      if (!editor || composing.current) return;
      const next =
        value ?? (initialized.current ? serializeEditor(editor).text : initialText.current);
      const limited = maxLength === undefined ? next : next.slice(0, Math.max(0, maxLength));
      if (!initialized.current || serializeEditor(editor).text !== limited) {
        seedEditor(editor, limited, skillsRef.current);
        onSlashQueryChange?.(null);
      }
      editor.dataset.empty = limited.length === 0 ? "true" : "false";
      acceptedHTML.current = editor.innerHTML;
      if (!initialized.current && autoFocus) editor.focus();
      initialized.current = true;
    });

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editorRef.current?.focus(),
        clear: () => {
          const editor = editorRef.current;
          if (editor) {
            editor.replaceChildren();
            emit();
          }
        },
        insertSkill: (skill) => {
          const editor = editorRef.current;
          if (editor) {
            insertSkillAtCaret(editor, skill, emit);
          }
        },
        serialize: () =>
          editorRef.current ? serializeEditor(editorRef.current) : { text: "", skillIds: [] },
        getSlashQuery: () => (editorRef.current ? readSlashQuery(editorRef.current) : null),
      }),
      [emit],
    );

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (event.nativeEvent.isComposing || composing.current) return;
      if (onNavKeyDown?.(event)) {
        return;
      }

      const editor = editorRef.current;
      if (event.key === "Backspace" && editor && deletePillBeforeCaret(editor)) {
        event.preventDefault();
        emit();
        return;
      }

      if (
        submitOnEnter &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        onSubmit?.();
      }
    }

    return (
      // biome-ignore lint/a11y/useFocusableInteractive: contentEditable is focusable.
      // biome-ignore lint/a11y/useSemanticElements: a rich token editor needs contentEditable, not a textarea.
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-empty="true"
        onInput={emit}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          emit();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const editor = editorRef.current;
          const selection = window.getSelection();
          if (!editor || !selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          if (!editor.contains(range.commonAncestorContainer)) return;
          const text = event.clipboardData.getData("text/plain");
          const available =
            maxLength === undefined
              ? text.length
              : Math.max(
                  0,
                  maxLength - serializeEditor(editor).text.length + range.toString().length,
                );
          const insertion = text.slice(0, available);
          if (!insertion) return;
          range.deleteContents();
          const node = document.createTextNode(insertion);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          emit();
        }}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          minHeight: `${minRows * LINE_HEIGHT_REM}rem`,
          maxHeight: `${maxRows * LINE_HEIGHT_REM}rem`,
        }}
        className={cn(
          "w-full overflow-y-auto whitespace-pre-wrap break-words px-4 pt-4 pb-3 text-base leading-7 outline-none sm:px-5 sm:pt-5 md:text-lg",
          "data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground/70 data-[empty=true]:before:content-[attr(data-placeholder)]",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      />
    );
  },
);
