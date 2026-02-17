/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import WebGLWater from '../Package/WebGLWater.tsx';

interface StageProps {
  isPaused: boolean;
  gravityEnabled: boolean;
  lightPosition: { x: number; y: number; z: number };
  skyPreset: string;
  useCustomHDR: boolean;
  lightIntensity: number;
  specularIntensity: number;
  useCustomWaterColor: boolean;
  waterColorShallow: string;
  waterColorDeep: string;
  // Granular props
  simDamping: number;
  simWind: number;
  matRoughness: number;
  matMetalness: number;
  matIor: number;
  sunShininess: number;
  // FX props
  interactionStrength: number;
  waveSpeed: number;
  bubbleSize: number;
  bubbleOpacity: number;
  sceneApiRef: React.RefObject<any>;
}

const Stage = ({ 
    isPaused,
    gravityEnabled,
    lightPosition,
    skyPreset,
    useCustomHDR,
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
    sceneApiRef,
}: StageProps) => {
  return (
    <div style={{ 
        position: 'relative', 
        width: '100%',
        height: '100%',
    }}>
        <WebGLWater 
            isPaused={isPaused}
            gravityEnabled={gravityEnabled}
            lightPosition={lightPosition}
            skyPreset={skyPreset}
            useCustomHDR={useCustomHDR}
            lightIntensity={lightIntensity}
            specularIntensity={specularIntensity}
            useCustomWaterColor={useCustomWaterColor}
            waterColorShallow={waterColorShallow}
            waterColorDeep={waterColorDeep}
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
    </div>
  );
};

export default Stage;