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
        
        // Parse and format transcribed text for better readability
        const formattedText = formatTranscribedText(transcribedText);
        
        // Insert at cursor position or at the end
        if (editor.isFocused) {
          editor.commands.insertContent(formattedText);
        } else {
          // If editor is not focused, append to the end
          editor.commands.focus('end');
          editor.commands.insertContent('\n\n' + formattedText);
        }
      }
    };

    document.addEventListener('insertText', handleInsertText as EventListener);
    return () => {
      document.removeEventListener('insertText', handleInsertText as EventListener);
    };
  }, [editor]);

  // Format transcribed text for better readability
  const formatTranscribedText = (text: string): string => {
    if (!text) return '';
    
    // Remove timestamps and clean up the text
    let formatted = text
      // Remove timestamp patterns like [00:00:00] or (00:00:00) or 00:00:00
      .replace(/\[[0-9]+:[0-9]+:[0-9]+\]/g, '')
      .replace(/\([0-9]+:[0-9]+:[0-9]+\)/g, '')
      .replace(/^[0-9]+:[0-9]+:[0-9]+/g, '')
      .replace(/\s+[0-9]+:[0-9]+:[0-9]+\s+/g, ' ')
      // Remove other timestamp formats like 0:00.0
      .replace(/[0-9]+:[0-9]+\.[0-9]+/g, '')
      // Remove speaker labels like "Speaker 1:" or "SPEAKER_01:"
      .replace(/SPEAKER_[0-9]+:\s*/gi, '')
      .replace(/Speaker\s+[0-9]+:\s*/gi, '')
      // Remove multiple dashes and clean separators
      .replace(/[-–—]+/g, '')
      // Clean up multiple spaces and newlines
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      // Trim whitespace
      .trim();
    
    // Split into sentences and add proper formatting
    formatted = formatted
      // Add periods if missing at end of sentences before capital letters
      .replace(/([a-z])\s+([A-Z])/g, '$1. $2')
      // Ensure proper capitalization after periods
      .replace(/\.\s+([a-z])/g, (match, letter) => '. ' + letter.toUpperCase())
      // Clean up multiple periods
      .replace(/\.+/g, '.')
      // Remove leading/trailing punctuation artifacts
      .replace(/^[^\w]+/, '')
      .replace(/[^\w.!?]+$/, '');
    
    // Ensure first letter is capitalized
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    
    // Add period at end if missing and text doesn't end with punctuation
    if (formatted && !formatted.match(/[.!?]$/)) {
      formatted += '.';
    }
    
    return formatted;
  };

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