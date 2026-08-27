"use client";

import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { redo, undo } from "@milkdown/kit/prose/history";
import { replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";

type MarkdownEditorClientProps = {
  markdown: string;
  onChange: (markdown: string) => void;
};

function CrepeEditor({ markdown, onChange }: MarkdownEditorClientProps) {
  const crepeRef = useRef<Crepe | null>(null);
  const initialMarkdown = useRef(markdown);
  const latestMarkdown = useRef(markdown);
  const onChangeRef = useRef(onChange);
  const { loading } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initialMarkdown.current,
      features: {
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false
      },
      featureConfigs: {
        [Crepe.Feature.TopBar]: {
          buildTopBar: (builder) => {
            const history = builder.addGroup("history", "History");
            history.addItem("undo", {
              icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12"/></svg>',
              active: () => false,
              onRun: (ctx) => {
                const view = ctx.get(editorViewCtx);
                undo(view.state, view.dispatch);
                view.focus();
              }
            });
            history.addItem("redo", {
              icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/></svg>',
              active: () => false,
              onRun: (ctx) => {
                const view = ctx.get(editorViewCtx);
                redo(view.state, view.dispatch);
                view.focus();
              }
            });
          }
        },
        [Crepe.Feature.Placeholder]: { text: "开始编写 Markdown…", mode: "block" }
      }
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, nextMarkdown) => {
        latestMarkdown.current = nextMarkdown;
        onChangeRef.current(nextMarkdown);
      });
    });
    crepeRef.current = crepe;
    return crepe;
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (loading || !crepeRef.current || markdown === latestMarkdown.current) return;
    latestMarkdown.current = markdown;
    crepeRef.current.editor.action(replaceAll(markdown));
  }, [loading, markdown]);

  return (
    <div className="markdown-editor">
      <Milkdown />
    </div>
  );
}

export function MarkdownEditorClient(props: MarkdownEditorClientProps) {
  return <MilkdownProvider><CrepeEditor {...props} /></MilkdownProvider>;
}
