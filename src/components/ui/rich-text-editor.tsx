"use client";
import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link2, Image as ImageIcon,
  List, ListOrdered, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FONTS = [
  { label: "Sans Serif", value: "" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
];

function ToolbarButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100 transition-colors",
        active && "bg-slate-200 text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
}

/** Rich text email body editor (Bold/Italic/Underline/Strike, font, link, image). Emits HTML. */
export function RichTextEditor({ value, onChange, placeholder, className, minHeight = 220 }: RichTextEditorProps) {
  const [fontOpen, setFontOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // StarterKit (v3) already bundles Link + Underline — disable its copies
      // so our own configured instances (below) are the only ones registered.
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
      Underline,
      TextStyle,
      FontFamily,
      Link.configure({ openOnClick: false, autolink: true }),
      ImageExt,
      Placeholder.configure({ placeholder: placeholder || "Write your email…" }),
    ],
    content: value || "",
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none" },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep editor content in sync when `value` changes externally (e.g. switching steps).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && value !== undefined) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (!url) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = () => {
    const url = window.prompt("Image URL");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const currentFont = (editor.getAttributes("textStyle").fontFamily as string) || "";

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-slate-100 px-2 py-1.5 flex-wrap">
        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        {/* Font family */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFontOpen((v) => !v)}
            className="inline-flex items-center gap-1 h-8 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100"
          >
            {FONTS.find((f) => f.value === currentFont)?.label || "Sans Serif"} <ChevronDown className="h-3 w-3" />
          </button>
          {fontOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {FONTS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => {
                    if (f.value) editor.chain().focus().setFontFamily(f.value).run();
                    else editor.chain().focus().unsetFontFamily().run();
                    setFontOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  style={{ fontFamily: f.value || undefined }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <ToolbarButton title="Insert image" onClick={insertImage}><ImageIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Insert link" active={editor.isActive("link")} onClick={setLink}><Link2 className="h-4 w-4" /></ToolbarButton>
      </div>

      {/* Content */}
      <div
        className="px-4 py-3 overflow-y-auto cursor-text"
        style={{ minHeight }}
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
