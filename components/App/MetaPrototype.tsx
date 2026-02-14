/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import ThemeToggleButton from '../Core/ThemeToggleButton.tsx';
import FloatingWindow from '../Package/FloatingWindow.tsx';
import Dock from '../Section/Dock.tsx';
import Stage from '../Section/Stage.tsx';
import ControlPanel from '../Package/ControlPanel.tsx';
import CodePanel from '../Package/CodePanel.tsx';
import ConsolePanel from '../Package/ConsolePanel.tsx';
import UndoRedo from '../Package/UndoRedo.tsx';
import Confetti from '../Core/Confetti.tsx';
import { WindowId, WindowState, LogEntry } from '../../types/index.tsx';

/**
 * 🏎️ Meta Prototype App
 * Acts as the main state orchestrator for the application.
 * Adapted to control the WebGL Water simulation.
 */
const MetaPrototype = () => {
  const { theme, themeName } = useTheme();
  const isInitialMount = useRef(true);
  
  // -- App State --
  const [isPaused, setIsPaused] = useState(false);
  const [simulationConfig, setSimulationConfig] = useState({ gravity: true });
  const [lightPosition, setLightPosition] = useState({ x: 2, y: 3, z: -2 }); // XYZ position for light direction
  const [skyPreset, setSkyPreset] = useState('default'); // 'default', 'sunset', etc.
  const [lightIntensity, setLightIntensity] = useState(2.0);
  const [specularIntensity, setSpecularIntensity] = useState(2.0);
  const [useCustomWaterColor, setUseCustomWaterColor] = useState(false);
  const [waterColorShallow, setWaterColorShallow] = useState('#aaddff'); // Light cyan
  const [waterColorDeep, setWaterColorDeep] = useState('#005577'); // Dark cyan

  // -- Direct API ref for real-time updates --
  const sceneApiRef = useRef<{ 
    setLightIntensity?: (v: number) => void; 
    setSpecularIntensity?: (v: number) => void; 
  } | null>(null);

  // -- Confetti State --
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // -- History State --
  const [history, setHistory] = useState<any[]>([]);
  const [future, setFuture] = useState<any[]>([]);

  // --- Window Management ---
  const WINDOW_WIDTH = 400;
  const CONTROL_PANEL_HEIGHT = 600;
  const CODE_PANEL_HEIGHT = 408;
  const CONSOLE_PANEL_HEIGHT = 200;

  const [windows, setWindows] = useState<Record<WindowId, WindowState>>({
    control: { id: 'control', title: 'Control', isOpen: false, zIndex: 1, x: -WINDOW_WIDTH / 2, y: -CONTROL_PANEL_HEIGHT / 2 },
    code: { id: 'code', title: 'Code I/O', isOpen: false, zIndex: 2, x: -WINDOW_WIDTH / 2, y: -CODE_PANEL_HEIGHT / 2 },
    console: { id: 'console', title: 'Console', isOpen: false, zIndex: 3, x: -WINDOW_WIDTH / 2, y: -CONSOLE_PANEL_HEIGHT / 2 },
  });

  // -- Code Editor State --
  const [codeText, setCodeText] = useState('');
  const [isCodeFocused, setIsCodeFocused] = useState(false);
  
  useEffect(() => {
    if (!isCodeFocused) {
      setCodeText(JSON.stringify({ isPaused, lightPosition, skyPreset, lightIntensity, specularIntensity, useCustomWaterColor, waterColorShallow, waterColorDeep, ...simulationConfig }, null, 2));
    }
  }, [isPaused, lightPosition, skyPreset, lightIntensity, specularIntensity, useCustomWaterColor, waterColorShallow, waterColorDeep, simulationConfig, isCodeFocused]);


  // -- Actions --

  const logEvent = useCallback((msg: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message: msg,
    };
    setLogs(prev => [...prev, entry].slice(-50));
  }, []);
  
  useEffect(() => {
      logEvent('System Ready. WebGL Water module loaded.');
  }, [logEvent]);

  // Sync sky preset with theme changes
  useEffect(() => {
    // On initial mount, sync theme to skybox without logging
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (themeName === 'dark') {
        setSkyPreset('night');
      } else {
        setSkyPreset('default');
      }
      return;
    }

    // On subsequent theme changes, update skybox and log
    if (themeName === 'dark') {
      setSkyPreset('night');
      logEvent('Theme changed to Dark. Sky preset set to Night.');
    } else {
      setSkyPreset('default');
      logEvent('Theme changed to Light. Sky preset set to Default Day.');
    }
  }, [themeName, logEvent]);

  const bringToFront = (id: WindowId) => {
    setWindows(prev => {
      const maxZ = Math.max(...Object.values(prev).map((w: WindowState) => w.zIndex));
      if (prev[id].zIndex === maxZ) return prev;
      return { ...prev, [id]: { ...prev[id], zIndex: maxZ + 1 } };
    });
  };

  const toggleWindow = (id: WindowId) => {
    setWindows(prev => {
      const isOpen = !prev[id].isOpen;
      const next = { ...prev, [id]: { ...prev[id], isOpen } };
      if (isOpen) {
        const maxZ = Math.max(...Object.values(prev).map((w: WindowState) => w.zIndex));
        next[id].zIndex = maxZ + 1;
      }
      return next;
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeText);
    logEvent('JSON copied to clipboard');
  };
  
  const handleTogglePause = () => {
    setIsPaused(p => !p);
    logEvent(`Simulation toggled: ${isPaused ? 'On' : 'Off'}`);
  }

  const handleLightPositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    setLightPosition(prev => ({ ...prev, [axis]: value }));
    logEvent(`Light Position ${axis.toUpperCase()} changed to ${value.toFixed(1)}`);
  };
  
  const handleSkyPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPreset = e.target.value;
    setSkyPreset(newPreset);
    logEvent(`Sky preset changed to: ${newPreset}`);
  };

  // --- Real-time updates (no re-render) ---
  const handleLightIntensityUpdate = (value: number) => {
    sceneApiRef.current?.setLightIntensity?.(value);
  };
  const handleSpecularIntensityUpdate = (value: number) => {
    sceneApiRef.current?.setSpecularIntensity?.(value);
  };

  // --- State updates on commit (re-renders for UI sync) ---
  const handleLightIntensityCommit = (value: number) => {
    setLightIntensity(value);
    logEvent(`Light intensity committed: ${value.toFixed(1)}`);
  };
  const handleSpecularIntensityCommit = (value: number) => {
    setSpecularIntensity(value);
    logEvent(`Specular intensity committed: ${value.toFixed(1)}`);
  };

  const handleToggleCustomWaterColor = () => {
      const newValue = !useCustomWaterColor;
      setUseCustomWaterColor(newValue);
      logEvent(`Custom water color toggled: ${newValue ? 'On' : 'Off'}`);
  };

  const handleWaterColorShallowChange = (e: any) => {
      const newColor = e.target.value;
      setWaterColorShallow(newColor);
      logEvent(`Shallow water color changed to ${newColor}`);
  };

  const handleWaterColorDeepChange = (e: any) => {
      const newColor = e.target.value;
      setWaterColorDeep(newColor);
      logEvent(`Deep water color changed to ${newColor}`);
  };


  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: theme.Color.Base.Surface[1],
      overflow: 'hidden',
      position: 'relative',
    }}>
      <ThemeToggleButton />
      <Confetti trigger={confettiTrigger} />

      <Stage 
        lightPosition={lightPosition}
        skyPreset={skyPreset}
        lightIntensity={lightIntensity}
        specularIntensity={specularIntensity}
        useCustomWaterColor={useCustomWaterColor}
        waterColorShallow={waterColorShallow}
        waterColorDeep={waterColorDeep}
        sceneApiRef={sceneApiRef}
      />

      {/* --- WINDOWS --- */}
      <AnimatePresence>
        {windows.control.isOpen && (
          <FloatingWindow
            key="control"
            {...windows.control}
            onClose={() => toggleWindow('control')}
            onFocus={() => bringToFront('control')}
            footer={<UndoRedo onUndo={()=>{}} onRedo={()=>{}} canUndo={false} canRedo={false} />}
          >
            <ControlPanel
              isPaused={isPaused}
              onTogglePause={handleTogglePause}
              lightPosition={lightPosition}
              onLightPositionChange={handleLightPositionChange}
              skyPreset={skyPreset}
              onSkyPresetChange={handleSkyPresetChange}
              lightIntensity={lightIntensity}
              onLightIntensityUpdate={handleLightIntensityUpdate}
              onLightIntensityCommit={handleLightIntensityCommit}
              specularIntensity={specularIntensity}
              onSpecularIntensityUpdate={handleSpecularIntensityUpdate}
              onSpecularIntensityCommit={handleSpecularIntensityCommit}
              useCustomWaterColor={useCustomWaterColor}
              onToggleCustomWaterColor={handleToggleCustomWaterColor}
              waterColorShallow={waterColorShallow}
              onWaterColorShallowChange={handleWaterColorShallowChange}
              waterColorDeep={waterColorDeep}
              onWaterColorDeepChange={handleWaterColorDeepChange}
            />
          </FloatingWindow>
        )}

        {windows.code.isOpen && (
          <FloatingWindow
            key="code"
            {...windows.code}
            onClose={() => toggleWindow('code')}
            onFocus={() => bringToFront('code')}
          >
            <CodePanel
              codeText={codeText}
              onCodeChange={(e) => setCodeText(e.target.value)}
              onCopyCode={handleCopyCode}
              onFocus={() => setIsCodeFocused(true)}
              onBlur={() => setIsCodeFocused(false)}
            />
          </FloatingWindow>
        )}

        {windows.console.isOpen && (
          <FloatingWindow
            key="console"
            {...windows.console}
            onClose={() => toggleWindow('console')}
            onFocus={() => bringToFront('console')}
          >
            <ConsolePanel logs={logs} />
          </FloatingWindow>
        )}
      </AnimatePresence>

      <Dock windows={windows} toggleWindow={toggleWindow} />
    </div>
  );
};

export default MetaPrototype;