/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef } from 'react';
import { useMotionValue, motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import Toggle from '../Core/Toggle.tsx';
import RangeSlider from '../Core/RangeSlider.tsx';
import Select from '../Core/Select.tsx';
import ColorPicker from '../Core/ColorPicker.tsx';
import Input from '../Core/Input.tsx';
import Button from '../Core/Button.tsx';

interface ControlPanelProps {
  isPaused: boolean;
  onTogglePause: () => void;
  gravity: boolean;
  onToggleGravity: () => void;
  lightPosition: { x: number; y: number; z: number };
  onLightPositionChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  skyPreset: string;
  onSkyPresetChange: (e: any) => void;
  useCustomHDR: boolean;
  onToggleCustomHDR: () => void;
  customHDRUrl: string;
  onCustomHDRUrlChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadCustomHDR: () => void;
  onCustomHDRFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lightIntensity: number;
  onLightIntensityUpdate: (value: number) => void;
  onLightIntensityCommit: (value: number) => void;
  specularIntensity: number;
  onSpecularIntensityUpdate: (value: number) => void;
  onSpecularIntensityCommit: (value: number) => void;
  useCustomWaterColor: boolean;
  onToggleCustomWaterColor: () => void;
  waterColorShallow: string;
  onWaterColorShallowChange: (e: any) => void;
  waterColorDeep: string;
  onWaterColorDeepChange: (e: any) => void;
  // Granular Controls
  simDamping: number;
  onSimDampingCommit: (v: number) => void;
  simWind: number;
  onSimWindCommit: (v: number) => void;
  matRoughness: number;
  onMatRoughnessCommit: (v: number) => void;
  matMetalness: number;
  onMatMetalnessCommit: (v: number) => void;
  matIor: number;
  onMatIorCommit: (v: number) => void;
  sunShininess: number;
  onSunShininessCommit: (v: number) => void;
  // FX Controls
  interactionStrength: number;
  onInteractionStrengthCommit: (v: number) => void;
  waveSpeed: number;
  onWaveSpeedCommit: (v: number) => void;
  bubbleSize: number;
  onBubbleSizeCommit: (v: number) => void;
  bubbleOpacity: number;
  onBubbleOpacityCommit: (v: number) => void;
}

const SKY_PRESETS = [
    { value: 'default', label: 'Default Day' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'cloudy', label: 'Cloudy' },
    { value: 'night', label: 'Night' },
];

const ControlPanel: React.FC<ControlPanelProps> = ({ 
    isPaused, 
    onTogglePause,
    gravity,
    onToggleGravity,
    lightPosition,
    onLightPositionChange,
    skyPreset,
    onSkyPresetChange,
    useCustomHDR,
    onToggleCustomHDR,
    customHDRUrl,
    onCustomHDRUrlChange,
    onLoadCustomHDR,
    onCustomHDRFileChange,
    lightIntensity,
    onLightIntensityUpdate,
    onLightIntensityCommit,
    specularIntensity,
    onSpecularIntensityUpdate,
    onSpecularIntensityCommit,
    useCustomWaterColor,
    onToggleCustomWaterColor,
    waterColorShallow,
    onWaterColorShallowChange,
    waterColorDeep,
    onWaterColorDeepChange,
    simDamping,
    onSimDampingCommit,
    simWind,
    onSimWindCommit,
    matRoughness,
    onMatRoughnessCommit,
    matMetalness,
    onMatMetalnessCommit,
    matIor,
    onMatIorCommit,
    sunShininess,
    onSunShininessCommit,
    interactionStrength,
    onInteractionStrengthCommit,
    waveSpeed,
    onWaveSpeedCommit,
    bubbleSize,
    onBubbleSizeCommit,
    bubbleOpacity,
    onBubbleOpacityCommit,
}) => {
  const { theme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lightX_MV = useMotionValue(lightPosition.x);
  const lightY_MV = useMotionValue(lightPosition.y);
  const lightZ_MV = useMotionValue(lightPosition.z);
  const lightIntensityMV = useMotionValue(lightIntensity);
  const specularIntensityMV = useMotionValue(specularIntensity);
  
  // New MV
  const dampingMV = useMotionValue(simDamping);
  const windMV = useMotionValue(simWind);
  const roughnessMV = useMotionValue(matRoughness);
  const metalnessMV = useMotionValue(matMetalness);
  const iorMV = useMotionValue(matIor);
  const shininessMV = useMotionValue(sunShininess);
  const interactionMV = useMotionValue(interactionStrength);
  const waveSpeedMV = useMotionValue(waveSpeed);
  const bubbleSizeMV = useMotionValue(bubbleSize);
  const bubbleOpacityMV = useMotionValue(bubbleOpacity);

  React.useEffect(() => { lightX_MV.set(lightPosition.x) }, [lightPosition.x, lightX_MV]);
  React.useEffect(() => { lightY_MV.set(lightPosition.y) }, [lightPosition.y, lightY_MV]);
  React.useEffect(() => { lightZ_MV.set(lightPosition.z) }, [lightPosition.z, lightZ_MV]);
  React.useEffect(() => { lightIntensityMV.set(lightIntensity) }, [lightIntensity, lightIntensityMV]);
  React.useEffect(() => { specularIntensityMV.set(specularIntensity) }, [specularIntensity, specularIntensityMV]);
  React.useEffect(() => { dampingMV.set(simDamping) }, [simDamping, dampingMV]);
  React.useEffect(() => { windMV.set(simWind) }, [simWind, windMV]);
  React.useEffect(() => { roughnessMV.set(matRoughness) }, [matRoughness, roughnessMV]);
  React.useEffect(() => { metalnessMV.set(matMetalness) }, [matMetalness, metalnessMV]);
  React.useEffect(() => { iorMV.set(matIor) }, [matIor, iorMV]);
  React.useEffect(() => { shininessMV.set(sunShininess) }, [sunShininess, shininessMV]);
  React.useEffect(() => { interactionMV.set(interactionStrength) }, [interactionStrength, interactionMV]);
  React.useEffect(() => { waveSpeedMV.set(waveSpeed) }, [waveSpeed, waveSpeedMV]);
  React.useEffect(() => { bubbleSizeMV.set(bubbleSize) }, [bubbleSize, bubbleSizeMV]);
  React.useEffect(() => { bubbleOpacityMV.set(bubbleOpacity) }, [bubbleOpacity, bubbleOpacityMV]);

  const sectionDivider = <div style={{ borderTop: `1px solid ${theme.Color.Base.Surface[3]}`, margin: `0` }} />;
  const sectionHeader = (label: string) => (
     <p style={{ ...theme.Type.Readable.Label.M, color: theme.Color.Base.Content[3], margin: 0, textTransform: 'uppercase' }}>{label}</p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.L'] }}>
      <p style={{ ...theme.Type.Readable.Body.M, color: theme.Color.Base.Content[2], margin: 0, paddingBottom: theme.spacing['Space.S'] }}>
        WebGL Water Controls
      </p>
      
      {sectionDivider}

      <Toggle
        label="Pause Simulation"
        isOn={isPaused}
        onToggle={onTogglePause}
      />
      <Toggle
        label="Sphere Gravity"
        isOn={gravity}
        onToggle={onToggleGravity}
      />
      
      {sectionDivider}

      {sectionHeader("Environment")}

      <Toggle
        label="Use Custom HDR"
        isOn={useCustomHDR}
        onToggle={onToggleCustomHDR}
      />

      <AnimatePresence>
        {useCustomHDR && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], marginTop: theme.spacing['Space.M'] }}
          >
            <Input
              label="HDR File URL"
              value={customHDRUrl}
              onChange={onCustomHDRUrlChange}
            />
            <div style={{ display: 'flex', gap: theme.spacing['Space.S']}}>
              <Button
                label="Load from URL"
                onClick={onLoadCustomHDR}
                size="S"
                variant="secondary"
              />
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".hdr"
                onChange={onCustomHDRFileChange}
              />
              <Button
                label="Upload File..."
                onClick={() => fileInputRef.current?.click()}
                size="S"
                variant="outline"
                icon="ph-upload-simple"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ opacity: useCustomHDR ? 0.5 : 1, pointerEvents: useCustomHDR ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
        <Select
            label="Sky Preset"
            value={skyPreset}
            onChange={onSkyPresetChange}
            options={SKY_PRESETS}
        />
      </div>
      
      {sectionDivider}
      
      {sectionHeader("Lighting")}

      <RangeSlider
        label="Light Position X"
        motionValue={lightX_MV}
        onCommit={(v) => onLightPositionChange('x', v)}
        min={-10} max={10} step={0.1}
      />
      <RangeSlider
        label="Light Position Y"
        motionValue={lightY_MV}
        onCommit={(v) => onLightPositionChange('y', v)}
        min={-10} max={10} step={0.1}
      />
      <RangeSlider
        label="Light Position Z"
        motionValue={lightZ_MV}
        onCommit={(v) => onLightPositionChange('z', v)}
        min={-10} max={10} step={0.1}
      />

      <RangeSlider
        label="Light Intensity"
        motionValue={lightIntensityMV}
        onUpdate={onLightIntensityUpdate}
        onCommit={onLightIntensityCommit}
        min={0} max={10} step={0.1}
      />

      <RangeSlider
        label="Specular Intensity"
        motionValue={specularIntensityMV}
        onUpdate={onSpecularIntensityUpdate}
        onCommit={onSpecularIntensityCommit}
        min={0} max={10} step={0.1}
      />
      
      <RangeSlider
        label="Sun Shininess"
        motionValue={shininessMV}
        onCommit={onSunShininessCommit}
        min={1} max={1000} step={1}
      />

      {sectionDivider}
      
      {sectionHeader("Simulation Physics")}
      
      <RangeSlider
        label="Viscosity (Damping)"
        motionValue={dampingMV}
        onCommit={onSimDampingCommit}
        min={0.9} max={0.999} step={0.001}
      />
      <RangeSlider
        label="Wind Strength"
        motionValue={windMV}
        onCommit={onSimWindCommit}
        min={0} max={0.01} step={0.0001}
      />

      {sectionDivider}

      {sectionHeader("Particles & FX")}

      <RangeSlider
        label="Interaction Intensity"
        motionValue={interactionMV}
        onCommit={onInteractionStrengthCommit}
        min={0.01} max={0.2} step={0.01}
      />
      <RangeSlider
        label="Wave Speed"
        motionValue={waveSpeedMV}
        onCommit={onWaveSpeedCommit}
        min={0} max={5} step={0.1}
      />
      <RangeSlider
        label="Bubble Size"
        motionValue={bubbleSizeMV}
        onCommit={onBubbleSizeCommit}
        min={0.01} max={0.2} step={0.01}
      />
      <RangeSlider
        label="Bubble Opacity"
        motionValue={bubbleOpacityMV}
        onCommit={onBubbleOpacityCommit}
        min={0} max={1} step={0.01}
      />

      {sectionDivider}

      {sectionHeader("Material Properties")}
      
      <RangeSlider
        label="Roughness"
        motionValue={roughnessMV}
        onCommit={onMatRoughnessCommit}
        min={0} max={1} step={0.01}
      />
      <RangeSlider
        label="Metalness"
        motionValue={metalnessMV}
        onCommit={onMatMetalnessCommit}
        min={0} max={1} step={0.01}
      />
      <RangeSlider
        label="IOR (Refraction)"
        motionValue={iorMV}
        onCommit={onMatIorCommit}
        min={1.0} max={2.33} step={0.01}
      />
      
      {sectionDivider}
      
      {sectionHeader("Water Tint")}

      <Toggle
        label="Custom Water Color"
        isOn={useCustomWaterColor}
        onToggle={onToggleCustomWaterColor}
      />

      {useCustomWaterColor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], marginTop: theme.spacing['Space.S'] }}>
            <ColorPicker
                label="Shallow Color"
                value={waterColorShallow}
                onChange={onWaterColorShallowChange}
            />
            <ColorPicker
                label="Deep Color"
                value={waterColorDeep}
                onChange={onWaterColorDeepChange}
            />
        </div>
      )}
    </div>
  );
};

export default ControlPanel;