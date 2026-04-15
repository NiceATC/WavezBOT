"use client";

import dynamic from "next/dynamic";
import { loader } from "@monaco-editor/react";

// Serve Monaco assets from the local bundle (public/) instead of CDN.
// Run `npm run copy-monaco` (or `npm run build`) to populate public/monaco-editor/.
loader.config({
  paths: {
    vs: "/monaco-editor/min/vs",
  },
});

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

export default function CodeEditor({
  value,
  onChange,
  language = "javascript",
  placeholder = "",
  minHeight = 260,
  className = "",
}) {
  const height = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  const editorOptions = {
    minimap: { enabled: true },
    fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, monospace",
    fontSize: 14,
    lineHeight: 20,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: "on",
    renderWhitespace: "selection",
    smoothScrolling: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  };

  return (
    <div className={`code-editor ${className}`.trim()} style={{ minHeight }}>
      <MonacoEditor
        height={height}
        language={language}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        theme="vs-dark"
        options={editorOptions}
        loading={<div className="muted">{placeholder || "Loading editor..."}</div>}
      />
    </div>
  );
}
