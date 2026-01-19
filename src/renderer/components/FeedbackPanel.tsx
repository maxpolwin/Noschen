import { Check, X, RefreshCw } from 'lucide-react';
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
  if (feedback.length === 0) return null;

  return (
    <div className="feedback-panel">
      <div className="feedback-panel-header">
        <span className="feedback-panel-title">
          {title} ({feedback.length})
        </span>
      </div>
      <div className="feedback-list">
        {feedback.map((item) => (
          <div key={item.id} className="feedback-item">
            <span className={`feedback-item-badge ${item.type}`}>
              {FEEDBACK_LABELS[item.type]}
            </span>
            <div className="feedback-item-content">
              <p className="feedback-item-text">{item.text}</p>
              {item.relevantText && (
                <p
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    fontStyle: 'italic',
                  }}
                >
                  Related to: "{item.relevantText.substring(0, 50)}..."
                </p>
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
                    title="Accept suggestion"
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
        ))}
      </div>
    </div>
  );
}

export default FeedbackPanel;
