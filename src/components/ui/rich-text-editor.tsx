"use client";
import { useEffect, useRef, useState } from "react";
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
  List, ListOrdered, ChevronDown, Loader2, RemoveFormatting,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadNewsletterImage } from "@/lib/storage/upload";

const FONTS = [
  { label: "Sans Serif", value: "" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
];

const BLOCK_TYPES = [
  { label: "Normal", level: 0 as const },
  { label: "Heading 1", level: 1 as const },
  { label: "Heading 2", level: 2 as const },
  { label: "Heading 3", level: 3 as const },
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
  /** "full" (default) is the email-body toolbar (font family, image upload, strikethrough).
   *  "compact" swaps that for a Normal/Heading block-type dropdown + a Clear Formatting
   *  button, and drops strikethrough/image — used by the Contact Notes editor. */
  toolbar?: "full" | "compact";
}

/** Rich text editor built on TipTap. Default toolbar is the email-body one (Bold/
 *  Italic/Underline/Strike, font, link, image); pass toolbar="compact" for a
 *  Normal/Heading dropdown + Clear Formatting instead (no font/image). Emits HTML. */
export function RichTextEditor({ value, onChange, placeholder, className, minHeight = 220, toolbar = "full" }: RichTextEditorProps) {
  const [fontOpen, setFontOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadNewsletterImage(formData);
      if (result.ok && result.url) {
        editor.chain().focus().setImage({ src: result.url }).run();
      } else {
        setUploadError(result.error || "Upload failed");
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const currentFont = (editor.getAttributes("textStyle").fontFamily as string) || "";
  const currentBlock = BLOCK_TYPES.find((b) => (b.level === 0 ? !editor.isActive("heading") : editor.isActive("heading", { level: b.level }))) || BLOCK_TYPES[0];
  const setBlock = (level: 0 | 1 | 2 | 3) => {
    if (level === 0) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level }).run();
    setBlockOpen(false);
  };

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-slate-100 px-2 py-1.5 flex-wrap">
        {toolbar === "compact" && (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setBlockOpen((v) => !v)}
                className="inline-flex items-center gap-1 h-8 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                {currentBlock.label} <ChevronDown className="h-3 w-3" />
              </button>
              {blockOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBlockOpen(false)} />
                  <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {BLOCK_TYPES.map((b) => (
                      <button
                        key={b.label}
                        onClick={() => setBlock(b.level)}
                        className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="mx-1 h-5 w-px bg-slate-200" />
          </>
        )}

        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        {toolbar === "full" && (
          <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
        )}

        <span className="mx-1 h-5 w-px bg-slate-200" />

        {toolbar === "full" && (
          <>
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
          </>
        )}

        {toolbar === "compact" ? (
          <>
            <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-4 w-4" />
            </ToolbarButton>
          </>
        ) : (
          <>
            <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
          </>
        )}

        <span className="mx-1 h-5 w-px bg-slate-200" />

        {toolbar === "full" && (
          <ToolbarButton title="Insert image from device" onClick={insertImage}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          </ToolbarButton>
        )}
        <ToolbarButton title="Insert link" active={editor.isActive("link")} onClick={setLink}><Link2 className="h-4 w-4" /></ToolbarButton>
        {toolbar === "compact" && (
          <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
            <RemoveFormatting className="h-4 w-4" />
          </ToolbarButton>
        )}
        {toolbar === "full" && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleImageFile}
          />
        )}
      </div>

      {uploadError && (
        <div className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-100">{uploadError}</div>
      )}

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
