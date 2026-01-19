import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Heading from '@tiptap/extension-heading';
import { Trash2, Eye, EyeOff } from 'lucide-react';
import { Note, FeedbackItem } from '../../shared/types';
import FeedbackPanel from './FeedbackPanel';

interface EditorProps {
  note: Note;
  onSave: (note: Note) => void;
  onDelete: () => void;
  aiConnected: boolean;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;
  onOpenSettings: () => void;
}

function extractTitle(html: string): string {
  // Try to extract H1 content as title
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]*>/g, '').trim() || 'Untitled Note';
  }
  // Fall back to first line of text
  const textMatch = html.replace(/<[^>]*>/g, ' ').trim();
  const firstLine = textMatch.split('\n')[0]?.substring(0, 50);
  return firstLine || 'Untitled Note';
}

function extractHeadings(html: string): { h1: string; h2s: string[] } {
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').trim() : '';

  const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
  const h2s: string[] = [];
  let match;
  while ((match = h2Regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]*>/g, '').trim();
    if (text) h2s.push(text);
  }

  return { h1, h2s };
}

function Editor({
  note,
  onSave,
  onDelete,
  aiConnected,
  isAnalyzing,
  setIsAnalyzing,
  onOpenSettings,
}: EditorProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [showRejected, setShowRejected] = useState(false);
  const [lastContent, setLastContent] = useState(note.content);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Heading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            const level = node.attrs.level;
            if (level === 1) return 'Research Topic (H1)';
            if (level === 2) return 'Sub-question or Aspect (H2)';
            return `Heading ${level}`;
          }
          return 'Start writing your research notes...';
        },
      }),
    ],
    content: note.content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      handleContentChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none',
      },
    },
  });

  // Update editor content when note changes
  useEffect(() => {
    if (editor && note.content !== editor.getHTML()) {
      editor.commands.setContent(note.content);
      setLastContent(note.content);
      setFeedback([]);
    }
  }, [note.id, editor]);

  const handleContentChange = useCallback(
    (html: string) => {
      // Auto-save after 1 second of inactivity
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const title = extractTitle(html);
        onSave({ ...note, content: html, title });
      }, 1000);

      // Trigger AI analysis after 2 seconds of inactivity
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }

      if (aiConnected && html !== lastContent && html.trim().length > 50) {
        analysisTimeoutRef.current = setTimeout(() => {
          analyzeContent(html);
        }, 2000);
      }

      setLastContent(html);
    },
    [note, onSave, aiConnected, lastContent]
  );

  const analyzeContent = async (html: string) => {
    setIsAnalyzing(true);

    const { h1, h2s } = extractHeadings(html);
    const currentH2 = h2s[h2s.length - 1] || ''; // Use last H2 as current section

    // Get plain text content for analysis
    const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      const response = await window.api.ai.analyze(plainText, {
        h1,
        h2: currentH2,
        allH2s: h2s,
      });

      if (response.feedback && response.feedback.length > 0) {
        const newFeedback: FeedbackItem[] = response.feedback.map((f, i) => ({
          ...f,
          id: `${Date.now()}-${i}`,
          status: 'active' as const,
        }));

        // Merge with existing feedback, avoiding duplicates
        setFeedback((prev) => {
          const existing = prev.filter((p) => p.status !== 'active');
          return [...existing, ...newFeedback];
        });
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    }

    setIsAnalyzing(false);
  };

  const handleAcceptFeedback = (feedbackId: string) => {
    setFeedback((prev) =>
      prev.map((f) => (f.id === feedbackId ? { ...f, status: 'accepted' } : f))
    );

    // Insert the suggestion content directly
    if (editor) {
      const feedbackItem = feedback.find((f) => f.id === feedbackId);
      if (feedbackItem) {
        // Use the suggestion if available, otherwise fall back to TODO
        const contentToInsert = feedbackItem.suggestion
          ? `\n\n${feedbackItem.suggestion.replace(/\\n/g, '\n')}\n\n`
          : `\n\n[TODO: ${feedbackItem.text}]\n\n`;
        editor.commands.insertContent(contentToInsert);
      }
    }
  };

  const handleRejectFeedback = (feedbackId: string) => {
    setFeedback((prev) =>
      prev.map((f) => (f.id === feedbackId ? { ...f, status: 'rejected' } : f))
    );
  };

  const handleDeleteConfirm = () => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      onDelete();
    }
  };

  const activeFeedback = feedback.filter((f) => f.status === 'active');
  const rejectedFeedback = feedback.filter((f) => f.status === 'rejected');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to force save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (editor) {
          const html = editor.getHTML();
          const title = extractTitle(html);
          onSave({ ...note, content: html, title });
        }
      }

      // Cmd/Ctrl + Enter to accept first active feedback
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && activeFeedback.length > 0) {
        e.preventDefault();
        handleAcceptFeedback(activeFeedback[0].id);
      }

      // Cmd/Ctrl + Backspace to reject first active feedback
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace' && activeFeedback.length > 0) {
        e.preventDefault();
        handleRejectFeedback(activeFeedback[0].id);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor, note, activeFeedback, onSave]);

  return (
    <>
      <div className="editor-header">
        <div className="ai-status">
          <div
            className={`ai-status-dot ${
              aiConnected ? (isAnalyzing ? 'analyzing' : 'connected') : ''
            }`}
          />
          <span>
            {aiConnected
              ? isAnalyzing
                ? 'Analyzing...'
                : 'AI Connected'
              : 'AI Disconnected'}
          </span>
          {!aiConnected && (
            <button
              onClick={onOpenSettings}
              style={{
                marginLeft: '8px',
                color: 'var(--accent-color)',
                fontSize: '12px',
              }}
            >
              Configure
            </button>
          )}
        </div>
        <div className="editor-header-actions">
          <button className="editor-header-btn danger" onClick={handleDeleteConfirm}>
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>
      <div className="editor-content">
        <EditorContent editor={editor} />

        {activeFeedback.length > 0 && (
          <FeedbackPanel
            feedback={activeFeedback}
            onAccept={handleAcceptFeedback}
            onReject={handleRejectFeedback}
            title="AI Suggestions"
          />
        )}

        {rejectedFeedback.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <button
              className="feedback-panel-toggle"
              onClick={() => setShowRejected(!showRejected)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              {showRejected ? <EyeOff size={14} /> : <Eye size={14} />}
              {showRejected ? 'Hide' : 'Show'} {rejectedFeedback.length} rejected suggestion
              {rejectedFeedback.length !== 1 ? 's' : ''}
            </button>

            {showRejected && (
              <FeedbackPanel
                feedback={rejectedFeedback}
                onAccept={handleAcceptFeedback}
                onReject={() => {}}
                title="Previously Rejected"
                isRejectedPanel
              />
            )}
          </div>
        )}
      </div>
      <div className="shortcuts-hint">
        <kbd>Cmd</kbd>+<kbd>S</kbd> Save | <kbd>Cmd</kbd>+<kbd>Enter</kbd> Accept | <kbd>Cmd</kbd>+
        <kbd>Delete</kbd> Reject
      </div>
    </>
  );
}

export default Editor;
