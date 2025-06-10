import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';

// Auto bullet list extension for dashes
const AutoBulletList = Extension.create({
  name: 'autoBulletList',
  
  addKeyboardShortcuts() {
    return {
      'Space': ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const { $from } = selection
        
        // Check if we're at the start of a line and the previous characters are "- "
        if ($from.parentOffset === 2) {
          const textBefore = $from.parent.textContent.slice(0, 2)
          if (textBefore === '- ') {
            // Convert to bullet list
            editor.chain()
              .deleteRange({ from: $from.pos - 2, to: $from.pos })
              .toggleBulletList()
              .run()
            return true
          }
        }
        return false
      },
    }
  },
})

interface NotepadEditorProps {
  initialContent?: string;
  onContentChange?: (content: string) => void;
}

export const NotepadEditor: React.FC<NotepadEditorProps> = ({ 
  initialContent = '', 
  onContentChange 
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      AutoBulletList,
      Placeholder.configure({
        placeholder: 'Write your meeting notes...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      if (onContentChange) {
        onContentChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'notepad-editor-content',
      },
    },
    autofocus: true,
  });

  // Listen for text insertion events from transcription
  useEffect(() => {
    const handleInsertText = (event: CustomEvent) => {
      if (editor && event.detail) {
        const transcribedText = event.detail;
        
        // Insert at cursor position or at the end (text is already formatted)
        if (editor.isFocused) {
          editor.commands.insertContent(transcribedText);
        } else {
          // If editor is not focused, append to the end
          editor.commands.focus('end');
          editor.commands.insertContent('\n\n' + transcribedText);
        }
      }
    };

    document.addEventListener('insertText', handleInsertText as EventListener);
    return () => {
      document.removeEventListener('insertText', handleInsertText as EventListener);
    };
  }, [editor]);


  if (!editor) {
    return null;
  }

  return (
    <div className="notepad-editor">
      <div className="editor-content-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};