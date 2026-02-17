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
  const [useCustomHDR, setUseCustomHDR] = useState(false); // New HDR toggle
  const [customHDRUrl, setCustomHDRUrl] = useState('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/qwantani_morning_puresky_1k.hdr');
  const [lightIntensity, setLightIntensity] = useState(4.9);
  const [specularIntensity, setSpecularIntensity] = useState(0.5);
  const [useCustomWaterColor, setUseCustomWaterColor] = useState(false);
  const [waterColorShallow, setWaterColorShallow] = useState('#aaddff'); // Light cyan
  const [waterColorDeep, setWaterColorDeep] = useState('#005577'); // Dark cyan

  // -- Granular Physics State --
  const [simDamping, setSimDamping] = useState(0.91);
  const [simWind, setSimWind] = useState(0.0005);
  const [matRoughness, setMatRoughness] = useState(0.1);
  const [matMetalness, setMatMetalness] = useState(0.0);
  const [matIor, setMatIor] = useState(1.333);
  const [sunShininess, setSunShininess] = useState(30.0); // New state for specular sharpness

  // -- New FX State --
  const [interactionStrength, setInteractionStrength] = useState(0.03);
  const [waveSpeed, setWaveSpeed] = useState(1.0);
  const [bubbleSize, setBubbleSize] = useState(0.02);
  const [bubbleOpacity, setBubbleOpacity] = useState(0.8);

  // -- Direct API ref for real-time updates --
  const sceneApiRef = useRef<{ 
    setLightIntensity?: (v: number) => void; 
    setSpecularIntensity?: (v: number) => void; 
    setDamping?: (v: number) => void;
    setWindStrength?: (v: number) => void;
    setPhysicalConfig?: (r: number, m: number, ior: number) => void;
    setSunShininess?: (v: number) => void;
    setInteractionStrength?: (v: number) => void;
    setWaveSpeed?: (v: number) => void;
    setBubbleConfig?: (size: number, opacity: number) => void;
    loadCustomHDR?: (url: string) => void; // New API method
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
      setCodeText(JSON.stringify({ 
          isPaused, 
          lightPosition, 
          skyPreset,
          useCustomHDR,
          customHDRUrl: useCustomHDR ? customHDRUrl : undefined,
          lightIntensity, 
          specularIntensity, 
          useCustomWaterColor, 
          waterColorShallow, 
          waterColorDeep, 
          simDamping,
          simWind,
          matRoughness,
          matMetalness,
          matIor,
          sunShininess,
          interactionStrength,
          waveSpeed,
          bubbleSize,
          bubbleOpacity,
          ...simulationConfig 
      }, null, 2));
    }
  }, [isPaused, lightPosition, skyPreset, useCustomHDR, customHDRUrl, lightIntensity, specularIntensity, useCustomWaterColor, waterColorShallow, waterColorDeep, simulationConfig, isCodeFocused, simDamping, simWind, matRoughness, matMetalness, matIor, sunShininess, interactionStrength, waveSpeed, bubbleSize, bubbleOpacity]);


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
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (themeName === 'dark') setSkyPreset('night'); else setSkyPreset('default');
      return;
    }
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

  const handleToggleGravity = () => {
    setSimulationConfig(prev => ({ ...prev, gravity: !prev.gravity }));
    logEvent(`Gravity toggled: ${!simulationConfig.gravity ? 'On' : 'Off'}`);
  };

  const handleLightPositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    setLightPosition(prev => ({ ...prev, [axis]: value }));
    logEvent(`Light Position ${axis.toUpperCase()} changed to ${value.toFixed(1)}`);
  };
  
  const handleSkyPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPreset = e.target.value;
    setSkyPreset(newPreset);
    logEvent(`Sky preset changed to: ${newPreset}`);
  };

  const handleToggleCustomHDR = () => {
    setUseCustomHDR(prev => !prev);
    logEvent(`Custom HDR toggled: ${!useCustomHDR ? 'On' : 'Off'}`);
  };

  const handleLoadCustomHDR = () => {
    if (!customHDRUrl) {
        logEvent('Error: HDR URL is empty.');
        return;
    }
    logEvent(`Loading custom HDR from URL: ${customHDRUrl}`);
    sceneApiRef.current?.loadCustomHDR?.(customHDRUrl);
  };

  const handleCustomHDRFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.hdr')) {
          logEvent(`Error: Invalid file type. Please select a .hdr file.`);
          return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          logEvent(`Loading custom HDR from file: ${file.name}`);
          sceneApiRef.current?.loadCustomHDR?.(dataUrl);
        }
      };
      reader.onerror = () => {
        logEvent(`Error reading file: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }
  };


  // --- Real-time updates (no re-render) ---
  const handleLightIntensityUpdate = (value: number) => sceneApiRef.current?.setLightIntensity?.(value);
  const handleSpecularIntensityUpdate = (value: number) => sceneApiRef.current?.setSpecularIntensity?.(value);

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

  // -- Granular Setters --
  const handleDampingCommit = (v: number) => { setSimDamping(v); logEvent(`Damping set to ${v.toFixed(3)}`); };
  const handleWindCommit = (v: number) => { setSimWind(v); logEvent(`Wind set to ${v.toFixed(4)}`); };
  const handleRoughnessCommit = (v: number) => { setMatRoughness(v); logEvent(`Roughness set to ${v.toFixed(2)}`); };
  const handleMetalnessCommit = (v: number) => { setMatMetalness(v); logEvent(`Metalness set to ${v.toFixed(2)}`); };
  const handleIorCommit = (v: number) => { setMatIor(v); logEvent(`IOR set to ${v.toFixed(2)}`); };
  const handleSunShininessCommit = (v: number) => { setSunShininess(v); logEvent(`Sun Shininess set to ${v.toFixed(1)}`); };
  
  // -- FX Setters --
  const handleInteractionStrengthCommit = (v: number) => { setInteractionStrength(v); logEvent(`Interaction Strength: ${v.toFixed(2)}`); };
  const handleWaveSpeedCommit = (v: number) => { setWaveSpeed(v); logEvent(`Wave Speed: ${v.toFixed(2)}`); };
  const handleBubbleSizeCommit = (v: number) => { setBubbleSize(v); logEvent(`Bubble Size: ${v.toFixed(2)}`); };
  const handleBubbleOpacityCommit = (v: number) => { setBubbleOpacity(v); logEvent(`Bubble Opacity: ${v.toFixed(2)}`); };


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
        isPaused={isPaused}
        gravityEnabled={simulationConfig.gravity}
        lightPosition={lightPosition}
        skyPreset={skyPreset}
        useCustomHDR={useCustomHDR}
        lightIntensity={lightIntensity}
        specularIntensity={specularIntensity}
        useCustomWaterColor={useCustomWaterColor}
        waterColorShallow={waterColorShallow}
        waterColorDeep={waterColorDeep}
        // New Props
        simDamping={simDamping}
        simWind={simWind}
        matRoughness={matRoughness}
        matMetalness={matMetalness}
        matIor={matIor}
        sunShininess={sunShininess}
        interactionStrength={interactionStrength}
        waveSpeed={waveSpeed}
        bubbleSize={bubbleSize}
        bubbleOpacity={bubbleOpacity}
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
              gravity={simulationConfig.gravity}
              onToggleGravity={handleToggleGravity}
              lightPosition={lightPosition}
              onLightPositionChange={handleLightPositionChange}
              skyPreset={skyPreset}
              onSkyPresetChange={handleSkyPresetChange}
              useCustomHDR={useCustomHDR}
              onToggleCustomHDR={handleToggleCustomHDR}
              customHDRUrl={customHDRUrl}
              onCustomHDRUrlChange={(e) => setCustomHDRUrl(e.target.value)}
              onLoadCustomHDR={handleLoadCustomHDR}
              onCustomHDRFileChange={handleCustomHDRFileChange}
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
              // Granular Controls
              simDamping={simDamping}
              onSimDampingCommit={handleDampingCommit}
              simWind={simWind}
              onSimWindCommit={handleWindCommit}
              matRoughness={matRoughness}
              onMatRoughnessCommit={handleRoughnessCommit}
              matMetalness={matMetalness}
              onMatMetalnessCommit={handleMetalnessCommit}
              matIor={matIor}
              onMatIorCommit={handleIorCommit}
              sunShininess={sunShininess}
              onSunShininessCommit={handleSunShininessCommit}
              // FX Controls
              interactionStrength={interactionStrength}
              onInteractionStrengthCommit={handleInteractionStrengthCommit}
              waveSpeed={waveSpeed}
              onWaveSpeedCommit={handleWaveSpeedCommit}
              bubbleSize={bubbleSize}
              onBubbleSizeCommit={handleBubbleSizeCommit}
              bubbleOpacity={bubbleOpacity}
              onBubbleOpacityCommit={handleBubbleOpacityCommit}
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