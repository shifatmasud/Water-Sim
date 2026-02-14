/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import DockIcon from '../Core/DockIcon.tsx';
import { WindowId, WindowState } from '../../types/index.tsx';

interface DockProps {
    windows: Record<WindowId, WindowState>;
    toggleWindow: (id: WindowId) => void;
}

const DOCK_ITEMS = [
  { id: 'control' as WindowId, icon: 'ph-sliders', label: 'Control' },
  { id: 'code' as WindowId, icon: 'ph-code', label: 'Code' },
  { id: 'console' as WindowId, icon: 'ph-terminal-window', label: 'Console' },
];

const Dock: React.FC<DockProps> = ({ windows, toggleWindow }) => {
    const { theme } = useTheme();

    return (
      <motion.div
        drag
        dragMomentum={false}
        style={{
          position: 'absolute',
          bottom: theme.spacing['Space.L'],
          left: '50%',
          x: '-50%',
          display: 'flex',
          gap: theme.spacing['Space.S'],
          padding: theme.spacing['Space.S'],
          backgroundColor: `${theme.Color.Base.Surface[1]}aa`,
          backdropFilter: 'blur(16px)',
          borderRadius: '24px', // Peel shape
          boxShadow: theme.effects['Effect.Shadow.Drop.3'],
          border: `1px solid ${theme.Color.Base.Surface[3]}`,
          zIndex: 1000,
        }}
      >
        {DOCK_ITEMS.map((item) => (
          <DockIcon
            key={item.id}
            icon={item.icon}
            isActive={windows[item.id].isOpen}
            onClick={() => toggleWindow(item.id)}
          />
        ))}
      </motion.div>
    );
};

export default Dock;
