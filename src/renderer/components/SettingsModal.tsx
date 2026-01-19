import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AISettings } from '../../shared/types';

interface SettingsModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function SettingsModal({ onClose, onSaved }: SettingsModalProps) {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'ollama',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
    mistralApiKey: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loaded = await window.api.settings.get();
    setSettings(loaded);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await window.api.settings.save(settings);
    setIsSaving(false);
    onSaved();
    onClose();
  };

  const handleTest = async () => {
    setTestResult(null);
    const connected = await window.api.ai.checkConnection();
    setTestResult(connected ? 'success' : 'error');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">AI Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">AI Provider</label>
            <select
              className="form-select"
              value={settings.provider}
              onChange={(e) =>
                setSettings({ ...settings, provider: e.target.value as 'ollama' | 'mistral' })
              }
            >
              <option value="ollama">Ollama (Local)</option>
              <option value="mistral">Mistral API (Cloud)</option>
            </select>
            <p className="form-hint">
              {settings.provider === 'ollama'
                ? 'Uses a local LLM via Ollama for privacy-first AI feedback.'
                : 'Uses Mistral API for AI feedback. Requires internet connection.'}
            </p>
          </div>

          {settings.provider === 'ollama' ? (
            <>
              <div className="form-group">
                <label className="form-label">Ollama URL</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.ollamaUrl}
                  onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                />
                <p className="form-hint">Default: http://localhost:11434</p>
              </div>
              <div className="form-group">
                <label className="form-label">Model Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                  placeholder="llama3.2"
                />
                <p className="form-hint">
                  Recommended: llama3.2, mistral, or phi3 for M2 MacBooks
                </p>
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label">Mistral API Key</label>
              <input
                type="password"
                className="form-input"
                value={settings.mistralApiKey}
                onChange={(e) => setSettings({ ...settings, mistralApiKey: e.target.value })}
                placeholder="Enter your Mistral API key"
              />
              <p className="form-hint">
                Get your API key from{' '}
                <a
                  href="https://console.mistral.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-color)' }}
                >
                  console.mistral.ai
                </a>
              </p>
            </div>
          )}

          <div className="form-group">
            <button
              className="btn btn-secondary"
              onClick={handleTest}
              style={{ width: '100%' }}
            >
              Test Connection
            </button>
            {testResult && (
              <p
                className="form-hint"
                style={{
                  color: testResult === 'success' ? 'var(--success-color)' : 'var(--error-color)',
                  marginTop: '8px',
                }}
              >
                {testResult === 'success'
                  ? 'Connection successful!'
                  : 'Connection failed. Please check your settings.'}
              </p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
