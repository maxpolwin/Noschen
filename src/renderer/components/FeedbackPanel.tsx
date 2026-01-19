import { useState } from 'react';
import { Check, X, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { FeedbackItem, FEEDBACK_LABELS } from '../../shared/types';

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
          {title} ({feedback.length})
        </span>
      </div>
      <div className="feedback-list">
        {feedback.map((item) => (
          <div key={item.id} className="feedback-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span className={`feedback-item-badge ${item.type}`}>
                {FEEDBACK_LABELS[item.type]}
              </span>
              <div className="feedback-item-content" style={{ flex: 1 }}>
                <p className="feedback-item-text">{item.text}</p>
                {item.suggestion && (
                  <button
                    onClick={() => toggleExpand(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--accent-color)',
                      marginTop: '6px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {expandedItems.has(item.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {expandedItems.has(item.id) ? 'Hide' : 'Show'} suggested content
                  </button>
                )}
              </div>
              <div className="feedback-item-actions">
                {isRejectedPanel ? (
                  <button
                    className="feedback-item-btn accept"
                    onClick={() => onAccept(item.id)}
                    title="Reconsider this suggestion"
                  >
                    <RefreshCw size={12} />
                  </button>
                ) : (
                  <>
                    <button
                      className="feedback-item-btn accept"
                      onClick={() => onAccept(item.id)}
                      title="Accept and insert suggestion"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      className="feedback-item-btn reject"
                      onClick={() => onReject(item.id)}
                      title="Reject suggestion"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {item.suggestion && expandedItems.has(item.id) && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  borderLeft: '3px solid var(--accent-color)',
                }}
              >
                {item.suggestion.replace(/\\n/g, '\n')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default FeedbackPanel;
