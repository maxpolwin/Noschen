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
                      <div className="form-group">
                        <label className="form-label">
                          Context Size: {settings.llmContextSize} tokens
                        </label>
                        <input
                          type="range"
                          className="form-range"
                          min="512"
                          max="4096"
                          step="256"
                          value={settings.llmContextSize}
                          onChange={(e) => setSettings({ ...settings, llmContextSize: parseInt(e.target.value) })}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>512 (faster)</span>
                          <span>4096 (more context)</span>
                        </div>
                        <p className="form-hint">
                          Maximum context window size. Higher values allow more input but use more memory.
                        </p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          Max Output Tokens: {settings.llmMaxTokens}
                        </label>
                        <input
                          type="range"
                          className="form-range"
                          min="256"
                          max="2048"
                          step="128"
                          value={settings.llmMaxTokens}
                          onChange={(e) => setSettings({ ...settings, llmMaxTokens: parseInt(e.target.value) })}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>256 (faster)</span>
                          <span>2048 (longer responses)</span>
                        </div>
                        <p className="form-hint">
                          Maximum tokens to generate. Higher values allow longer AI responses.
                        </p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          Batch Size: {settings.llmBatchSize}
                        </label>
                        <input
                          type="range"
                          className="form-range"
                          min="128"
                          max="1024"
                          step="64"
                          value={settings.llmBatchSize}
                          onChange={(e) => setSettings({ ...settings, llmBatchSize: parseInt(e.target.value) })}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>128 (less memory)</span>
                          <span>1024 (faster)</span>
                        </div>
                        <p className="form-hint">
                          Inference batch size. Higher values are faster but use more memory.
                        </p>
                      </div>

                      <div className="form-group">
                        <p className="form-hint" style={{ background: 'var(--warning-glow)', padding: '12px', borderRadius: '6px', color: 'var(--warning-color)' }}>
                          <strong>Warning:</strong> Changing these settings may affect performance and memory usage.
                          Restart the app after changing these settings.
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
