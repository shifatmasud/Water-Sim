/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import TextArea from '../Core/TextArea.tsx';

interface CodePanelProps {
  codeText: string;
  onCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onCopyCode: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

const CodePanel: React.FC<CodePanelProps> = ({ codeText, onCodeChange, onCopyCode, onFocus, onBlur }) => {
  const { theme } = useTheme();

  return (
    <>
      <div style={{ position: 'relative' }}>
        <TextArea value={codeText} onChange={onCodeChange} onFocus={onFocus} onBlur={onBlur} />
        <motion.button
          onClick={onCopyCode}
          style={{
            position: 'absolute',
            top: theme.spacing['Space.S'],
            right: theme.spacing['Space.S'],
            background: theme.Color.Base.Surface[1],
            border: `1px solid ${theme.Color.Base.Surface[3]}`,
            borderRadius: theme.radius['Radius.S'],
            padding: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.Color.Base.Content[1],
          }}
          whileHover={{ scale: 1.1, backgroundColor: theme.Color.Accent.Surface[1], color: theme.Color.Accent.Content[1] }}
          whileTap={{ scale: 0.9 }}
          aria-label="Copy JSON"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <i className="ph-bold ph-copy" style={{ fontSize: '14px' }} />
        </motion.button>
      </div>
      <div style={{ marginTop: theme.spacing['Space.L'] }}>
        <p style={{ ...theme.Type.Readable.Label.S, color: theme.Color.Base.Content[2], marginBottom: theme.spacing['Space.S'] }}>LIVE SIMULATION STATE</p>
        <pre style={{ ...theme.Type.Expressive.Data, fontSize: '11px', color: theme.Color.Base.Content[2], backgroundColor: 'transparent', padding: 0, margin: 0, whiteSpace: 'pre-wrap' }}>
          {codeText}
        </pre>
      </div>
    </>
  );
};

export default CodePanel;
