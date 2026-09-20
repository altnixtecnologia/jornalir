"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";

interface ArticleBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type TextAlignValue = "left" | "center" | "justify";

/**
 * Editor funcional leve (Tiptap/ProseMirror, headless — sem UI própria) com
 * negrito, itálico, subtítulo interno, listas, link, citação, alinhamento
 * básico e desfazer/refazer. O corpo é salvo como HTML em `Article.body`
 * (continua `string`), compatível com conteúdo futuro importado de PDF.
 */
export function ArticleBodyEditor({ value, onChange }: ArticleBodyEditorProps): JSX.Element {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        strike: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false, autolink: false }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "justify"] }),
    ],
    content: value,
    // Evita divergência entre HTML renderizado no servidor e no cliente
    // (Next.js App Router); o editor é montado após a hidratação.
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(updatedEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "ProseMirror",
        "aria-label": "Corpo da matéria",
      },
    },
  });

  function setLink(): void {
    if (!editor) return;
    const previousUrl = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("URL do link", previousUrl);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function isAlign(align: TextAlignValue): boolean {
    return editor?.isActive({ textAlign: align }) ?? false;
  }

  return (
    <div className="body-editor">
      <div className="body-editor-toolbar" role="toolbar" aria-label="Formatação do texto">
        <button
          type="button"
          className={editor?.isActive("bold") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!editor}
          aria-label="Negrito"
        >
          <strong>N</strong>
        </button>
        <button
          type="button"
          className={editor?.isActive("italic") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!editor}
          aria-label="Itálico"
        >
          <em>I</em>
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={editor?.isActive("heading", { level: 3 }) ? "is-active" : ""}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={!editor}
          aria-label="Subtítulo interno"
        >
          Sub
        </button>
        <button
          type="button"
          className={editor?.isActive("blockquote") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={!editor}
          aria-label="Citação"
        >
          “ ”
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={editor?.isActive("bulletList") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!editor}
          aria-label="Lista com marcadores"
        >
          •
        </button>
        <button
          type="button"
          className={editor?.isActive("orderedList") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={!editor}
          aria-label="Lista numerada"
        >
          1.
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={editor?.isActive("link") ? "is-active" : ""}
          onClick={setLink}
          disabled={!editor}
          aria-label="Link"
        >
          Link
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={isAlign("left") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          disabled={!editor}
          aria-label="Alinhar à esquerda"
        >
          Esq.
        </button>
        <button
          type="button"
          className={isAlign("center") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          disabled={!editor}
          aria-label="Centralizar"
        >
          Centro
        </button>
        <button
          type="button"
          className={isAlign("justify") ? "is-active" : ""}
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          disabled={!editor}
          aria-label="Justificar"
        >
          Justif.
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          aria-label="Desfazer"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          aria-label="Refazer"
        >
          ↻
        </button>
      </div>
      <div className="body-editor-content">
        {editor ? <EditorContent editor={editor} /> : <p className="helper-text">Carregando editor…</p>}
      </div>
      <p className="helper-text">
        O padrão editorial de título, subtítulo e texto é aplicado automaticamente na
        publicação.
      </p>
    </div>
  );
}
