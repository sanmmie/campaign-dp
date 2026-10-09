import React, { useState, useEffect, useRef } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presetColors?: string[];
  showAlpha?: boolean;
}

const DEFAULT_PRESETS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  '#008000', '#800000', '#000080', '#808000', '#008080',
  '#C0C0C0', '#808080', '#FFC0CB', '#A52A2A', '#FFD700',
];

export function ColorPicker({ 
  value, 
  onChange, 
  presetColors = DEFAULT_PRESETS,
  showAlpha = false
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const [alpha, setAlpha] = useState(1);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLInputElement>(null);
  const saturationRef = useRef<HTMLInputElement>(null);
  const lightnessRef = useRef<HTMLInputElement>(null);
  const alphaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hexToHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
      }
      
      return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    };

    if (value.startsWith('#')) {
      const { h, s, l } = hexToHsl(value);
      setHue(h);
      setSaturation(s);
      setLightness(l);
      if (value.length === 9) {
        setAlpha(parseInt(value.slice(7, 9), 16) / 255);
      }
    }
  }, [value]);

  const hslToHex = (h: number, s: number, l: number, a: number = 1): string => {
    s /= 100;
    l /= 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    
    let r = 0, g = 0, b = 0;
    
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    const toHexAlpha = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    return showAlpha ? hex + toHexAlpha(a) : hex;
  };

  const currentColor = hslToHex(hue, saturation, lightness, alpha);
  
  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value, 10);
    setHue(newHue);
    onChange(hslToHex(newHue, saturation, lightness, alpha));
  };
  
  const handleSaturationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSat = parseInt(e.target.value, 10);
    setSaturation(newSat);
    onChange(hslToHex(hue, newSat, lightness, alpha));
  };
  
  const handleLightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLight = parseInt(e.target.value, 10);
    setLightness(newLight);
    onChange(hslToHex(hue, saturation, newLight, alpha));
  };
  
  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAlpha = parseInt(e.target.value, 10) / 100;
    setAlpha(newAlpha);
    onChange(hslToHex(hue, saturation, lightness, newAlpha));
  };

  const handlePresetClick = (color: string) => {
    onChange(color);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(color)) {
      onChange(color);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: value,
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          border: '2px solid #e5e7eb',
          cursor: 'pointer',
          position: 'relative',
        }}
        aria-label="Color picker"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {showAlpha && value.length === 9 && (
          <div 
            className="absolute inset-0 rounded-[6px]" 
            style={{
              background: `linear-gradient(90deg, transparent, ${value.slice(0, 7)})`,
            }}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 p-4 bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Hue slider */}
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Hue</label>
            <input
              ref={hueRef}
              type="range"
              min="0"
              max="360"
              value={hue}
              onChange={handleHueChange}
              className="w-full h-2 appearance-none bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 rounded-lg cursor-pointer"
              style={{
                background: `linear-gradient(90deg, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))`,
              }}
            />
          </div>

          {/* Saturation slider */}
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Saturation</label>
            <input
              ref={saturationRef}
              type="range"
              min="0"
              max="100"
              value={saturation}
              onChange={handleSaturationChange}
              className="w-full h-2 appearance-none rounded-lg cursor-pointer"
              style={{
                background: `linear-gradient(90deg, hsl(${hue}, 0%, ${lightness}%), hsl(${hue}, 100%, ${lightness}%))`,
              }}
            />
          </div>

          {/* Lightness slider */}
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Lightness</label>
            <input
              ref={lightnessRef}
              type="range"
              min="0"
              max="100"
              value={lightness}
              onChange={handleLightnessChange}
              className="w-full h-2 appearance-none rounded-lg cursor-pointer"
              style={{
                background: `linear-gradient(90deg, hsl(${hue}, ${saturation}%, 0%), hsl(${hue}, ${saturation}%, 100%))`,
              }}
            />
          </div>

          {showAlpha && (
            <div className="mb-4">
              <label className="block text-sm text-gray-700 mb-1">Opacity</label>
              <input
                ref={alphaRef}
                type="range"
                min="0"
                max="100"
                value={Math.round(alpha * 100)}
                onChange={handleAlphaChange}
                className="w-full h-2 appearance-none rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(90deg, transparent, ${currentColor})`,
                }}
              />
            </div>
          )}

          {/* Color input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Hex Value</label>
            <input
              type="text"
              value={currentColor}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              placeholder="#RRGGBB"
            />
          </div>

          {/* Preset colors */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">Presets</label>
            <div className="flex flex-wrap gap-2">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handlePresetClick(color)}
                  style={{
                    backgroundColor: color,
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: value === color ? '3px solid #3b82f6' : '2px solid #e5e7eb',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  aria-label={color}
                  aria-pressed={value === color}
                />
              ))}
            </div>
          </div>

          {/* Current color preview */}
          <div className="mt-4 flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0"
              style={{ backgroundColor: currentColor }}
            />
            <div className="text-sm text-gray-600">Current: {currentColor}</div>
          </div>
        </div>
      )}
    </div>
  );
}