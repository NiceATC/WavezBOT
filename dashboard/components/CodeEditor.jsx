"use client";

import ReactCodeMirror from "@uiw/react-codemirror";
import { indentWithTab } from "@codemirror/commands";
import { keymap, EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { syntaxTree } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { search } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";

const parserSyntaxLinter = linter((view) => {
  const diagnostics = [];
  syntaxTree(view.state).iterate({
    enter: ({ type, from, to }) => {
      if (!type.isError) return;
      diagnostics.push({
        from,
        to: Math.max(from + 1, to),
        severity: "error",
        message: "Syntax error",
      });
    },
  });
  return diagnostics;
});

function getExtensions(language) {
  const lang = String(language || "plaintext").toLowerCase();

  const common = [
    EditorView.lineWrapping,
    search({ top: true }),
    keymap.of([indentWithTab]),
    lintGutter(),
  ];

  if (lang === "json") return [json(), parserSyntaxLinter, ...common];
  if (lang === "javascript" || lang === "js") {
    return [javascript({ jsx: false }), parserSyntaxLinter, ...common];
  }
  if (lang === "sql") {
    return [sql(), parserSyntaxLinter, ...common];
  }
  if (lang === "yaml" || lang === "yml") return [yaml(), ...common];
  if (lang === "markdown" || lang === "md") return [markdown(), ...common];
  if (lang === "html") return [html(), ...common];
  if (lang === "css") return [css(), ...common];

  return common;
}

export default function CodeEditor({
  value,
  onChange,
  language = "plaintext",
  placeholder = "",
  minHeight = 260,
  className = "",
}) {
  const extensions = getExtensions(language);
  const minH = typeof minHeight === "number" ? `${minHeight}px` : String(minHeight);

  return (
    <div className={`code-editor ${className}`.trim()} style={{ minHeight }}>
      <ReactCodeMirror
        value={value ?? ""}
        onChange={(val) => onChange(val)}
        extensions={extensions}
        theme={oneDark}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
          tabSize: 2,
        }}
        placeholder={placeholder}
        height="100%"
        minHeight={minH}
        style={{ height: "100%" }}
      />
    </div>
  );
}
