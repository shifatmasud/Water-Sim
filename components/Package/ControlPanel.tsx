/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { useMotionValue } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import Toggle from '../Core/Toggle.tsx';
import RangeSlider from '../Core/RangeSlider.tsx';
import Select from '../Core/Select.tsx';
import ColorPicker from '../Core/ColorPicker.tsx';

interface ControlPanelProps {
  isPaused: boolean;
  onTogglePause: () => void;
  lightPosition: { x: number; y: number; z: number };
  onLightPositionChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  skyPreset: string;
  onSkyPresetChange: (e: any) => void;
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
    lightPosition,
    onLightPositionChange,
    skyPreset,
    onSkyPresetChange,
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
}) => {
  const { theme } = useTheme();

  const lightX_MV = useMotionValue(lightPosition.x);
  const lightY_MV = useMotionValue(lightPosition.y);
  const lightZ_MV = useMotionValue(lightPosition.z);
  const lightIntensityMV = useMotionValue(lightIntensity);
  const specularIntensityMV = useMotionValue(specularIntensity);

  React.useEffect(() => { lightX_MV.set(lightPosition.x) }, [lightPosition.x, lightX_MV]);
  React.useEffect(() => { lightY_MV.set(lightPosition.y) }, [lightPosition.y, lightY_MV]);
  React.useEffect(() => { lightZ_MV.set(lightPosition.z) }, [lightPosition.z, lightZ_MV]);
  React.useEffect(() => { lightIntensityMV.set(lightIntensity) }, [lightIntensity, lightIntensityMV]);
  React.useEffect(() => { specularIntensityMV.set(specularIntensity) }, [specularIntensity, specularIntensityMV]);

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
      
      {sectionDivider}

      {sectionHeader("Environment")}

      <Select
        label="Sky Preset"
        value={skyPreset}
        onChange={onSkyPresetChange}
        options={SKY_PRESETS}
      />
      
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

      {sectionDivider}
      
      {sectionHeader("Water Surface")}

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