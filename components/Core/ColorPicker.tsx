/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (e: any) => void;
  style?: React.CSSProperties;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange, style }) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);
  };

  const handlePresetClick = (color: string) => {
    onChange({ target: { value: color } });
    // Optional: Keep open or close. Keeping open allows rapid testing.
  };

  // Curated Preset Palette based on Theme
  const presets = [
    // Monochrome
    '#FFFFFF', '#F5F5F5', '#888888', '#333333', '#000000',
    // System Colors
    theme.Color.Focus.Content[1], 
    theme.Color.Success.Content[1],
    theme.Color.Warning.Content[1],
    theme.Color.Error.Content[1],
    theme.Color.Signal.Content[1],
    // Vibrants
    '#FF0055', '#00CC88', '#3366FF', '#FF9900', '#CC00FF',
  ];

  const swatchStyle: React.CSSProperties = {
    width: '42px',
    height: '42px',
    borderRadius: theme.radius['Radius.S'],
    backgroundColor: value,
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    cursor: 'pointer',
    flexShrink: 0,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: theme.spacing['Space.S'],
    height: '42px',
    borderRadius: theme.radius['Radius.S'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    backgroundColor: theme.Color.Base.Surface[2],
    color: theme.Color.Base.Content[1],
    fontFamily: theme.Type.Expressive.Data.fontFamily,
    fontSize: '13px',
    outline: 'none',
    textTransform: 'uppercase',
  };

  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    width: '100%',
    marginBottom: theme.spacing['Space.S'],
    backgroundColor: theme.Color.Base.Surface[2],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    borderRadius: theme.radius['Radius.M'],
    boxShadow: theme.effects['Effect.Shadow.Drop.3'],
    zIndex: 101,
    padding: theme.spacing['Space.M'],
  };

  return (
    <div style={{ position: 'relative' }} onPointerDown={(e) => e.stopPropagation()}>
      <label style={{ ...theme.Type.Readable.Label.S, display: 'block', marginBottom: theme.spacing['Space.S'], color: theme.Color.Base.Content[2] }}>
        {label}
      </label>
      
      <div style={{ display: 'flex', gap: theme.spacing['Space.S'] }}>
        <motion.div 
            style={swatchStyle} 
            onClick={() => setIsOpen(!isOpen)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        />
        <input 
            type="text" 
            value={value} 
            onChange={handleHexChange} 
            style={inputStyle} 
            placeholder="#000000"
            maxLength={7}
        />
      </div>

       {/* Backdrop */}
       {isOpen && (
        <div 
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100, cursor: 'default' }} 
            onClick={() => setIsOpen(false)} 
        />
      )}

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
            <motion.div
                style={popoverStyle}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {presets.map((color) => (
                        <motion.button
                            key={color}
                            onClick={() => handlePresetClick(color)}
                            style={{
                                width: '100%',
                                aspectRatio: '1/1',
                                borderRadius: '50%',
                                backgroundColor: color,
                                border: `2px solid ${value === color ? theme.Color.Base.Content[1] : 'transparent'}`,
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                        />
                    ))}
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ColorPicker;