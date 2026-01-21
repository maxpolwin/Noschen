import { useState, useEffect } from 'react';
import { X, Languages, Check } from 'lucide-react';
import { AISettings, SpellcheckLanguage } from '../../shared/types';

interface SettingsModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function SettingsModal({ onClose, onSaved }: SettingsModalProps) {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'builtin',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
    mistralApiKey: '',
    spellcheckEnabled: true,
    spellcheckLanguages: ['en-US'],
    chunkingThresholdMs: 3000,
    llmContextSize: 2048,
    llmMaxTokens: 1536,
    llmBatchSize: 512,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<SpellcheckLanguage[]>([]);
  const [activeTab, setActiveTab] = useState<'ai' | 'editor'>('ai');

  useEffect(() => {
    loadSettings();
    loadAvailableLanguages();
  }, []);

  const loadSettings = async () => {
    const loaded = await window.api.settings.get();
    // Ensure settings exist for older configurations
    setSettings({
      ...loaded,
      spellcheckEnabled: loaded.spellcheckEnabled ?? true,
      spellcheckLanguages: loaded.spellcheckLanguages ?? ['en-US'],
      chunkingThresholdMs: loaded.chunkingThresholdMs ?? 3000,
      llmContextSize: loaded.llmContextSize ?? 2048,
      llmMaxTokens: loaded.llmMaxTokens ?? 1536,
      llmBatchSize: loaded.llmBatchSize ?? 512,
    });
  };

  const loadAvailableLanguages = async () => {
    const languages = await window.api.spellcheck.getAvailableLanguages();
    setAvailableLanguages(languages);
  };

  const toggleLanguage = (code: string) => {
    const current = settings.spellcheckLanguages || [];
    if (current.includes(code)) {
      setSettings({
        ...settings,
        spellcheckLanguages: current.filter((c) => c !== code),
      });
    } else {
      setSettings({
        ...settings,
        spellcheckLanguages: [...current, code],
      });
    }
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
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            AI Provider
          </button>
          <button
            className={`modal-tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            <Languages size={16} />
            Spellcheck
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'ai' && (
            <>
              <div className="form-group">
                <label className="form-label">AI Provider</label>
                <select
                  className="form-select"
                  value={settings.provider}
                  onChange={(e) =>
                    setSettings({ ...settings, provider: e.target.value as 'builtin' | 'ollama' | 'mistral' })
                  }
                >
                  <option value="builtin">Built-in AI (Qwen 0.5B)</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="mistral">Mistral API (Cloud)</option>
                </select>
                <p className="form-hint">
                  {settings.provider === 'builtin'
                    ? 'Uses bundled Qwen 0.5B model. Works offline, no setup required.'
                    : settings.provider === 'ollama'
                    ? 'Uses a local LLM via Ollama for privacy-first AI feedback.'
                    : 'Uses Mistral API for AI feedback. Requires internet connection.'}
                </p>
              </div>

              {settings.provider === 'builtin' && (
                <>
                  <div className="form-group">
                    <p className="form-hint" style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px' }}>
                      The built-in AI uses Qwen2.5-0.5B, a small but capable model that runs entirely on your device.
                      No internet connection or external setup required.
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Chunking Threshold: {(settings.chunkingThresholdMs / 1000).toFixed(1)}s
                    </label>
                    <input
                      type="range"
                      className="form-range"
                      min="500"
                      max="5000"
                      step="100"
                      value={settings.chunkingThresholdMs}
                      onChange={(e) => setSettings({ ...settings, chunkingThresholdMs: parseInt(e.target.value) })}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>0.5s (faster, less context)</span>
                      <span>5s (slower, full context)</span>
                    </div>
                    <p className="form-hint">
                      If response takes longer than this, the AI will use only the current section instead of the full note.
                    </p>
                  </div>

                  {/* Advanced Settings Toggle */}
                  <div className="form-group">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                    </button>
                  </div>

                  {showAdvanced && (
                    <>
                      {/* Recommendations Box */}
                      <div className="form-group">
                        <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-color)', marginBottom: '8px' }}>
                            Recommended for M2 MacBook (32GB RAM):
                          </p>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            <div>• <strong>Context Size:</strong> 4096 tokens</div>
                            <div>• <strong>Max Output:</strong> 2048 tokens</div>
                            <div>• <strong>Batch Size:</strong> 1024</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ marginTop: '10px', fontSize: '11px', padding: '6px 12px' }}
                            onClick={() => setSettings({
                              ...settings,
                              llmContextSize: 4096,
                              llmMaxTokens: 2048,
                              llmBatchSize: 1024,
                            })}
                          >
                            Apply Recommended Settings
                          </button>
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Context Size (tokens)</label>
                        <input
                          type="number"
                          className="form-input"
                          min="512"
                          max="8192"
                          step="256"
                          value={settings.llmContextSize}
                          onChange={(e) => setSettings({ ...settings, llmContextSize: parseInt(e.target.value) || 2048 })}
                          style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }}
                        />
                        <p className="form-hint">
                          How much input text the model can process. Range: 512-8192. Higher = more context but slower.
                        </p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Max Output Tokens</label>
                        <input
                          type="number"
                          className="form-input"
                          min="256"
                          max="4096"
                          step="128"
                          value={settings.llmMaxTokens}
                          onChange={(e) => setSettings({ ...settings, llmMaxTokens: parseInt(e.target.value) || 1536 })}
                          style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }}
                        />
                        <p className="form-hint">
                          Maximum length of AI responses. Range: 256-4096. Higher = more detailed suggestions.
                        </p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Batch Size</label>
                        <input
                          type="number"
                          className="form-input"
                          min="128"
                          max="2048"
                          step="64"
                          value={settings.llmBatchSize}
                          onChange={(e) => setSettings({ ...settings, llmBatchSize: parseInt(e.target.value) || 512 })}
                          style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }}
                        />
                        <p className="form-hint">
                          Inference batch size. Range: 128-2048. Higher = faster but uses more memory.
                        </p>
                      </div>

                      <div className="form-group">
                        <p className="form-hint" style={{ background: 'var(--warning-glow)', padding: '12px', borderRadius: '6px', color: 'var(--warning-color)' }}>
                          <strong>Note:</strong> Restart the app after changing these settings for them to take effect.
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}

              {settings.provider === 'ollama' && (
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
              )}

              {settings.provider === 'mistral' && (
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
            </>
          )}

          {activeTab === 'editor' && (
            <>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Enable Spellcheck</span>
                  <button
                    className={`toggle-switch ${settings.spellcheckEnabled ? 'active' : ''}`}
                    onClick={() => setSettings({ ...settings, spellcheckEnabled: !settings.spellcheckEnabled })}
                  >
                    <span className="toggle-slider" />
                  </button>
                </label>
                <p className="form-hint">
                  Underlines misspelled words. Right-click to see suggestions.
                </p>
              </div>

              {settings.spellcheckEnabled && (
                <div className="form-group">
                  <label className="form-label">Languages</label>
                  <p className="form-hint" style={{ marginBottom: '12px' }}>
                    Select one or more languages for spellcheck. Multiple languages can be active simultaneously.
                  </p>
                  <div className="language-grid">
                    {availableLanguages.map((lang) => {
                      const isSelected = (settings.spellcheckLanguages || []).includes(lang.code);
                      return (
                        <button
                          key={lang.code}
                          className={`language-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleLanguage(lang.code)}
                        >
                          {isSelected && <Check size={14} />}
                          {lang.name}
                        </button>
                      );
                    })}
                  </div>
                  {(settings.spellcheckLanguages || []).length === 0 && (
                    <p className="form-hint" style={{ color: 'var(--warning-color)', marginTop: '8px' }}>
                      Please select at least one language for spellcheck.
                    </p>
                  )}
                </div>
              )}

              <div className="form-group" style={{ marginTop: '16px' }}>
                <p className="form-hint" style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px' }}>
                  <strong>Note:</strong> Changes to spellcheck settings require restarting the app to take full effect.
                  Dictionaries are downloaded automatically when needed.
                </p>
              </div>
            </>
          )}
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
