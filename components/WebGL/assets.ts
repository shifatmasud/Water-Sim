/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from 'three';

export const createTileTexture = () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const divisions = 4;
    const step = size / divisions;
    const grout = 2;
    ctx.fillStyle = '#b0c4de';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < divisions; y++) {
        for (let x = 0; x < divisions; x++) {
            ctx.fillStyle = '#d8e2f3'; 
            ctx.fillRect(x * step + grout, y * step + grout, step - grout * 2, step - grout * 2);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

export const createBubbleTexture = () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
};

export const createLightShaftTexture = () => {
    const width = 128; // Increased width for better blur
    const height = 512; // Increased height
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    // Vertical gradient with softer falloff
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
    g.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
    g.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    
    // Horizontal gradient with very soft Gaussian-like falloff
    const g2 = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
    g2.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g2.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
    g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = g2;
    // We want to stretch the radial gradient vertically
    ctx.save();
    ctx.scale(1, height/width);
    ctx.translate(0, -(height/width - 1) * width/2);
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
};

export const SKY_PRESETS = {
  default: { turbidity: 10, rayleigh: 2, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  sunset: { turbidity: 20, rayleigh: 3, mieCoefficient: 0.002, mieDirectionalG: 0.95 },
  cloudy: { turbidity: 50, rayleigh: 10, mieCoefficient: 0.05, mieDirectionalG: 0.6 },
  night: { turbidity: 1, rayleigh: 0.1, mieCoefficient: 0.001, mieDirectionalG: 0.7 }
};
