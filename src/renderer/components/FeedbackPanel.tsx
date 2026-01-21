import { useState } from 'react';
import { Check, X, RefreshCw, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { FeedbackItem, DEFAULT_FEEDBACK_LABELS } from '../../shared/types';

interface FeedbackPanelProps {
  feedback: FeedbackItem[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  title: string;
  isRejectedPanel?: boolean;
}

function FeedbackPanel({
  feedback,
  onAccept,
  onReject,
  title,
  isRejectedPanel = false,
}: FeedbackPanelProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  if (feedback.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="feedback-panel">
      <div className="feedback-panel-header">
        <span className="feedback-panel-title">
          <Sparkles size={16} />
          {title} ({feedback.length})
        </span>
      </div>
      <div className="feedback-list">
        {feedback.map((item) => (
          <div key={item.id} className="feedback-item">
            <span className={`feedback-item-badge ${item.type}`}>
              {DEFAULT_FEEDBACK_LABELS[item.type as keyof typeof DEFAULT_FEEDBACK_LABELS] || item.type.toUpperCase()}
            </span>
            <div className="feedback-item-content">
              <p className="feedback-item-text">{item.text}</p>
              {item.relevantText && (
                <p className="feedback-item-related">
                  Related to: "{item.relevantText.substring(0, 60)}..."
                </p>
              )}
              {item.suggestion && (
                <button
                  className="feedback-expand-btn"
                  onClick={() => toggleExpand(item.id)}
                >
                  {expandedItems.has(item.id) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  {expandedItems.has(item.id) ? 'Hide' : 'Preview'} suggested content
                </button>
              )}
              {item.suggestion && expandedItems.has(item.id) && (
                <div className="feedback-item-suggestion">
                  {item.suggestion.replace(/\\n/g, '\n')}
                </div>
              )}
            </div>
            <div className="feedback-item-actions">
              {isRejectedPanel ? (
                <button
                  className="feedback-item-btn accept"
                  onClick={() => onAccept(item.id)}
                  title="Reconsider this suggestion"
                >
                  <RefreshCw size={14} />
                </button>
              ) : (
                <>
                  <button
                    className="feedback-item-btn accept"
                    onClick={() => onAccept(item.id)}
                    title="Accept and insert (⌘+Enter)"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="feedback-item-btn reject"
                    onClick={() => onReject(item.id)}
                    title="Reject (⌘+⌫)"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FeedbackPanel;
