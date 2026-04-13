import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import './InputSection.css';

const TABS = [
  { id: 'url', label: '🔗 URL', placeholder: 'Enter a news article URL...' },
  { id: 'text', label: '📝 Text', placeholder: 'Paste article text, social media post, or any content to analyze...' },
  { id: 'image', label: '🖼 Image', placeholder: '' },
];

export default function InputSection({ inputData, onInputChange, onScan, onReset, scanning, scanPhase }) {
  const fileInputRef = useRef(null);

  const handleTabChange = (type) => {
    onInputChange({ ...inputData, type, value: '', file: null });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onInputChange({ ...inputData, file, value: file.name });
  };

  const isValid = () => {
    if (inputData.type === 'url') return inputData.value.trim().length > 3;
    if (inputData.type === 'text') return inputData.value.trim().length > 10;
    if (inputData.type === 'image') return !!inputData.file;
    return false;
  };

  const currentTab = TABS.find(t => t.id === inputData.type);

  return (
    <motion.section
      className="input-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <div className="input-card">
        <div className="input-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`input-tab ${inputData.type === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
              disabled={scanning}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="input-body">
          {inputData.type === 'image' ? (
            <div
              className={`file-drop ${inputData.file ? 'has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) onInputChange({ ...inputData, file, value: file.name });
              }}
            >
              {inputData.file ? (
                <>
                  <div className="file-preview-icon">🖼</div>
                  <p className="file-name">{inputData.file.name}</p>
                  <p className="file-size">{(inputData.file.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <div className="file-drop-icon">⬆</div>
                  <p>Drop image here or <span>click to browse</span></p>
                  <p className="file-hint">Supports JPEG, PNG, WebP, TIFF</p>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>
          ) : (
            inputData.type === 'url' ? (
              <input
                className="text-input url-input"
                type="url"
                value={inputData.value}
                onChange={e => onInputChange({ ...inputData, value: e.target.value })}
                placeholder={currentTab?.placeholder}
                disabled={scanning}
                onKeyDown={e => e.key === 'Enter' && isValid() && !scanning && onScan()}
              />
            ) : (
              <textarea
                className="text-input textarea-input"
                value={inputData.value}
                onChange={e => onInputChange({ ...inputData, value: e.target.value })}
                placeholder={currentTab?.placeholder}
                disabled={scanning}
                rows={6}
              />
            )
          )}

          <div className="date-range-row">
            <label className="date-label">📅 Date range (optional)</label>
            <div className="date-inputs">
              <input
                type="date"
                className="date-input"
                value={inputData.dateFrom}
                onChange={e => onInputChange({ ...inputData, dateFrom: e.target.value })}
                disabled={scanning}
                placeholder="From"
              />
              <span className="date-sep">–</span>
              <input
                type="date"
                className="date-input"
                value={inputData.dateTo}
                onChange={e => onInputChange({ ...inputData, dateTo: e.target.value })}
                disabled={scanning}
                placeholder="To"
              />
            </div>
          </div>
        </div>

        <div className="input-footer">
          {scanPhase !== 'idle' && (
            <button className="btn-reset" onClick={onReset}>
              ↺ Reset
            </button>
          )}
          <motion.button
            className={`btn-scan ${scanning ? 'scanning' : ''}`}
            onClick={onScan}
            disabled={!isValid() || scanning}
            whileHover={!scanning && isValid() ? { scale: 1.03 } : {}}
            whileTap={!scanning && isValid() ? { scale: 0.97 } : {}}
          >
            {scanning ? (
              <span className="scan-spinner">
                <span className="spinner-ring" /> Scanning...
              </span>
            ) : '🔍 Analyze'}
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
}
