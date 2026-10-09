import React, { useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Rect, Circle, Group, Transformer, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { TemplateVersion, TemplateLayer, PhotoTransform } from '@deltadp/shared';

interface CanvasEditorProps {
  template: TemplateVersion;
  photoUrl: string | null;
  textValues: Record<string, string>;
  photoTransform: PhotoTransform;
  onTextChange: (layerId: string, value: string) => void;
  onPhotoTransformChange: (transform: Partial<PhotoTransform>) => void;
  onLayerSelect?: (layerId: string | null) => void;
  showGrid?: boolean;
  snapToGrid?: boolean;
  readonly?: boolean;
}

function useImageUrl(url: string | null | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement | undefined>(undefined);
  React.useEffect(() => {
    if (!url) {
      setImg(undefined);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setImg(image);
    image.onerror = () => setImg(undefined);
    image.src = url;
  }, [url]);
  return img;
}

function snap(value: number, snap: boolean): number {
  return snap ? Math.round(value / 20) * 20 : value;
}

export function CanvasEditor({
  template,
  photoUrl,
  textValues,
  photoTransform,
  onPhotoTransformChange,
  onLayerSelect,
  showGrid = false,
  snapToGrid = true,
  readonly = false,
}: CanvasEditorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageRef = useRef<any>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const photoImage = useImageUrl(photoUrl);

  const layers = template.layers;
  const photoZone = template.photoZone;

  const handleSelect = useCallback((layerId: string | null) => {
    setSelectedLayerId(layerId);
    onLayerSelect?.(layerId);
  }, [onLayerSelect]);

  const handleDragEnd = useCallback((layerId: string, isPhoto: boolean) => {
    return (e: KonvaEventObject<DragEvent>) => {
      const target = e.target;
      if (isPhoto) {
        onPhotoTransformChange({
          x: snap(target.x(), snapToGrid),
          y: snap(target.y(), snapToGrid),
          rotation: target.rotation(),
        });
      }
    };
  }, [onPhotoTransformChange, snapToGrid]);

  const handleTransformEnd = useCallback((isPhoto: boolean) => {
    return (e: KonvaEventObject<DragEvent>) => {
      const target = e.target;
      if (isPhoto) {
        onPhotoTransformChange({
          x: snap(target.x(), snapToGrid),
          y: snap(target.y(), snapToGrid),
          scaleX: target.scaleX(),
          scaleY: target.scaleY(),
          rotation: target.rotation(),
        });
      }
    };
  }, [onPhotoTransformChange, snapToGrid]);

  const renderGrid = () => {
    if (!showGrid) return null;
    const gridSize = 20;
    const vLines: React.ReactNode[] = [];
    const hLines: React.ReactNode[] = [];
    for (let x = 0; x <= template.canvas.width; x += gridSize) {
      vLines.push(
        <Rect key={`v-${x}`} x={x} y={0} width={1} height={template.canvas.height} fill="#e5e7eb" listening={false} />
      );
    }
    for (let y = 0; y <= template.canvas.height; y += gridSize) {
      hLines.push(
        <Rect key={`h-${y}`} x={0} y={y} width={template.canvas.width} height={1} fill="#e5e7eb" listening={false} />
      );
    }
    return <Group listening={false}>{[...vLines, ...hLines]}</Group>;
  };

  const renderLayer = (layer: TemplateLayer) => {
    if (!layer.visible) return null;

    const isSelected = selectedLayerId === layer.id;

    switch (layer.type) {
      case 'image': {
        return (
          <Group
            key={layer.id}
            id={layer.id}
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            opacity={layer.opacity ?? 1}
            rotation={layer.rotation ?? 0}
            draggable={!layer.locked && !readonly}
            onDragEnd={handleDragEnd(layer.id, false)}
            onClick={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
            onTap={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
          >
            {/* Image placeholder - actual image loading handled by parent */}
            <Rect
              x={0}
              y={0}
              width={layer.width ?? 100}
              height={layer.height ?? 100}
              fill="#e5e7eb"
              listening={false}
            />
          </Group>
        );
      }

      case 'text': {
        const value = textValues[layer.id] ?? layer.text ?? '';
        return (
          <Group
            key={layer.id}
            id={layer.id}
            x={layer.x}
            y={layer.y}
            opacity={layer.opacity ?? 1}
            rotation={layer.rotation ?? 0}
            draggable={!layer.locked && !readonly}
            onDragEnd={handleDragEnd(layer.id, false)}
            onClick={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
            onTap={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
          >
            <Text
              text={value}
              fontSize={layer.fontSize}
              fontFamily={layer.fontFamily}
              fontStyle={layer.fontWeight && layer.fontWeight >= 700 ? 'bold' : undefined}
              fill={layer.color}
              align={layer.alignment}
              lineHeight={layer.lineHeight}
              letterSpacing={layer.letterSpacing}
              width={layer.maxWidth}
              wrap={layer.maxWidth ? 'word' : 'none'}
            />
            {isSelected && !readonly && (
              <Transformer
                enabledAnchors={[]}
                rotateEnabled={false}
                resizeEnabled={false}
                ignoreStroke
              />
            )}
          </Group>
        );
      }

      case 'photo': {
        const shape = layer.shape ?? photoZone.shape;
        const borderRadius = layer.borderRadius ?? photoZone.borderRadius ?? 20;
        const w = layer.width ?? photoZone.width;
        const h = layer.height ?? photoZone.height;

        const clipFunc = (ctx: CanvasRenderingContext2D) => {
          const cw = w ?? 100;
          const ch = h ?? 100;
          if (shape === 'circle') {
            ctx.beginPath();
            ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2);
            ctx.closePath();
          } else if (shape === 'rounded-rect') {
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(0, 0, cw, ch, borderRadius);
            } else {
              ctx.rect(0, 0, cw, ch);
            }
            ctx.closePath();
          } else {
            ctx.beginPath();
            ctx.rect(0, 0, cw, ch);
            ctx.closePath();
          }
        };

        return (
          <Group
            key={layer.id}
            id={layer.id}
            x={layer.x + photoTransform.x}
            y={layer.y + photoTransform.y}
            width={w}
            height={h}
            opacity={layer.opacity ?? 1}
            rotation={layer.rotation ?? photoTransform.rotation}
            scaleX={photoTransform.scaleX}
            scaleY={photoTransform.scaleY}
            draggable={!photoZone.locked && !readonly}
            onDragEnd={handleDragEnd(layer.id, true)}
            onTransformEnd={handleTransformEnd(true)}
            onClick={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
            onTap={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
          >
            {photoImage ? (
              <KonvaImage
                image={photoImage}
                width={w}
                height={h}
                clipFunc={clipFunc}
                scaleX={photoTransform.flipX ? -1 : 1}
                scaleY={photoTransform.flipY ? -1 : 1}
              />
            ) : (
              <Rect
                width={w}
                height={h}
                fill="#f3f4f6"
                stroke="#d1d5db"
                strokeWidth={2}
                dash={[10, 5]}
                cornerRadius={shape === 'rounded-rect' ? borderRadius : shape === 'circle' ? Math.min(w ?? 100, h ?? 100) / 2 : 0}
              />
            )}
            {isSelected && !readonly && (
              <Transformer
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                rotateEnabled
                boundBoxFunc={(oldBox, newBox) => {
                  const minSize = 50;
                  return {
                    ...newBox,
                    width: Math.max(newBox.width, minSize),
                    height: Math.max(newBox.height, minSize),
                  };
                }}
              />
            )}
          </Group>
        );
      }

      case 'shape': {
        const shapeProps = {
          x: 0,
          y: 0,
          fill: layer.fill,
          stroke: layer.stroke,
          strokeWidth: layer.strokeWidth,
          opacity: layer.opacity ?? 1,
        };
        return (
          <Group
            key={layer.id}
            id={layer.id}
            x={layer.x}
            y={layer.y}
            opacity={layer.opacity ?? 1}
            rotation={layer.rotation ?? 0}
            draggable={!layer.locked && !readonly}
            onDragEnd={handleDragEnd(layer.id, false)}
            onClick={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
            onTap={(e) => { e.cancelBubble = true; handleSelect(layer.id); }}
          >
            {layer.shapeType === 'rect' && (
              <Rect
                {...shapeProps}
                width={layer.width ?? 100}
                height={layer.height ?? 100}
                cornerRadius={layer.borderRadius ?? 0}
              />
            )}
            {layer.shapeType === 'circle' && (
              <Circle
                {...shapeProps}
                radius={Math.min(layer.width ?? 100, layer.height ?? 100) / 2}
              />
            )}
            {layer.shapeType === 'ellipse' && (
              <Circle
                {...shapeProps}
                radius={Math.min(layer.width ?? 100, layer.height ?? 100) / 2}
              />
            )}
            {layer.shapeType === 'polygon' && layer.points && (
              <Line
                points={layer.points}
                closed
                fill={layer.fill}
                stroke={layer.stroke}
                strokeWidth={layer.strokeWidth}
              />
            )}
            {isSelected && !readonly && (
              <Transformer
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                rotateEnabled
              />
            )}
          </Group>
        );
      }

      default:
        return null;
    }
  };

  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="relative select-none">
      <Stage
        ref={stageRef}
        width={template.canvas.width}
        height={template.canvas.height}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            handleSelect(null);
          }
        }}
        style={{ border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff', maxWidth: '100%' }}
      >
        <Layer>
          {renderGrid()}
          {sortedLayers.map(renderLayer)}
        </Layer>
      </Stage>
    </div>
  );
}