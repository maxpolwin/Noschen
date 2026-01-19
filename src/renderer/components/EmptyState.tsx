import { FileText, Plus } from 'lucide-react';

interface EmptyStateProps {
  onCreateNote: () => void;
}

function EmptyState({ onCreateNote }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <FileText size={64} />
      <h2>Welcome to Noschen</h2>
      <p>
        Your AI-powered research note-taking app. Create a note to get started with intelligent feedback on your research.
      </p>
      <button
        className="new-note-btn"
        style={{ marginTop: '24px', width: 'auto', padding: '12px 24px' }}
        onClick={onCreateNote}
      >
        <Plus size={16} />
        Create Your First Note
      </button>
      <div style={{ marginTop: '32px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <p style={{ marginBottom: '8px' }}>Tips for research notes:</p>
        <ul style={{ textAlign: 'left', listStyle: 'disc', paddingLeft: '20px' }}>
          <li>Use H1 for your main research topic</li>
          <li>Use H2 for sub-questions or aspects</li>
          <li>AI feedback appears after 2 seconds of inactivity</li>
        </ul>
      </div>
    </div>
  );
}

export default EmptyState;
