/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import WebGLWater from '../Package/WebGLWater.tsx';

interface StageProps {
  lightPosition: { x: number; y: number; z: number };
  skyPreset: string;
  lightIntensity: number;
  specularIntensity: number;
  useCustomWaterColor: boolean;
  waterColorShallow: string;
  waterColorDeep: string;
  sceneApiRef: React.RefObject<any>;
}

const Stage = ({ 
    lightPosition,
    skyPreset, 
    lightIntensity,
    specularIntensity,
    useCustomWaterColor,
    waterColorShallow,
    waterColorDeep,
    sceneApiRef,
}: StageProps) => {
  return (
    <div style={{ 
        position: 'relative', 
        width: '100%',
        height: '100%',
    }}>
        <WebGLWater 
            lightPosition={lightPosition}
            skyPreset={skyPreset}
            lightIntensity={lightIntensity}
            specularIntensity={specularIntensity}
            useCustomWaterColor={useCustomWaterColor}
            waterColorShallow={waterColorShallow}
            waterColorDeep={waterColorDeep}
            sceneApiRef={sceneApiRef}
        />
    </div>
  );
};

export default Stage;