/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useLayoutEffect, useEffect } from 'react';
import { WaterEngine } from '../WebGL/WaterEngine.ts';

// --- Types ---

interface WebGLWaterProps {
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
  // Granular controls
  simDamping: number;
  simWind: number;
  matRoughness: number;
  matMetalness: number;
  matIor: number;
  sunShininess: number;
  // FX controls
  interactionStrength: number;
  waveSpeed: number;
  bubbleSize: number;
  bubbleOpacity: number;
  sceneApiRef?: React.RefObject<any>;
}

// --- React Wrapper Component ---

const WebGLWater = (props: WebGLWaterProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WaterEngine | null>(null);

  // Initialize Engine Once
  useLayoutEffect(() => {
    if (!mountRef.current) return;
    const engine = new WaterEngine(mountRef.current);
    engineRef.current = engine;

    // Expose imperative API for parent (control panel)
    if (props.sceneApiRef) {
        props.sceneApiRef.current = {
            setLightIntensity: (v: number) => engine.setLightIntensity(v),
            setSpecularIntensity: (v: number) => engine.setSpecularIntensity(v),
            setDamping: (v: number) => engine.setDamping(v),
            setWindStrength: (v: number) => engine.setWindStrength(v),
            setPhysicalConfig: (r: number, m: number, ior: number) => engine.setPhysicalConfig(r, m, ior),
            setSunShininess: (v: number) => engine.setSunShininess(v),
            setInteractionStrength: (v: number) => engine.setInteractionStrength(v),
            setWaveSpeed: (v: number) => engine.setWaveSpeed(v),
            setBubbleConfig: (size: number, opacity: number) => engine.setBubbleConfig(size, opacity),
            loadCustomHDR: (url: string) => engine.loadCustomHDR(url),
        };
    }

    return () => {
        engine.dispose();
        if (props.sceneApiRef) props.sceneApiRef.current = null;
    };
  }, [props.sceneApiRef]);

  // Sync Props to Engine (Declarative Updates)
  useEffect(() => { engineRef.current?.setPaused(props.isPaused); }, [props.isPaused]);
  useEffect(() => { engineRef.current?.setGravity(props.gravityEnabled); }, [props.gravityEnabled]);
  useEffect(() => { engineRef.current?.setLightPosition(props.lightPosition); }, [props.lightPosition]);
  useEffect(() => { engineRef.current?.setSkyPreset(props.skyPreset); }, [props.skyPreset]);
  useEffect(() => { engineRef.current?.setCustomHDR(props.useCustomHDR); }, [props.useCustomHDR]);
  useEffect(() => { engineRef.current?.setLightIntensity(props.lightIntensity); }, [props.lightIntensity]);
  useEffect(() => { engineRef.current?.setSpecularIntensity(props.specularIntensity); }, [props.specularIntensity]);
  useEffect(() => { 
      engineRef.current?.setWaterConfig(props.useCustomWaterColor, props.waterColorShallow, props.waterColorDeep); 
  }, [props.useCustomWaterColor, props.waterColorShallow, props.waterColorDeep]);
  
  // New Effect hooks for granular controls
  useEffect(() => { engineRef.current?.setDamping(props.simDamping); }, [props.simDamping]);
  useEffect(() => { engineRef.current?.setWindStrength(props.simWind); }, [props.simWind]);
  useEffect(() => { 
      engineRef.current?.setPhysicalConfig(props.matRoughness, props.matMetalness, props.matIor); 
  }, [props.matRoughness, props.matMetalness, props.matIor]);
  useEffect(() => { engineRef.current?.setSunShininess(props.sunShininess); }, [props.sunShininess]);

  // FX Hooks
  useEffect(() => { engineRef.current?.setInteractionStrength(props.interactionStrength); }, [props.interactionStrength]);
  useEffect(() => { engineRef.current?.setWaveSpeed(props.waveSpeed); }, [props.waveSpeed]);
  useEffect(() => { engineRef.current?.setBubbleConfig(props.bubbleSize, props.bubbleOpacity); }, [props.bubbleSize, props.bubbleOpacity]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
};

export default WebGLWater;