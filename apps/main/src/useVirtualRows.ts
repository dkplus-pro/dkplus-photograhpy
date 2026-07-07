import { useEffect, useMemo, useRef, useState } from "react";

export interface VirtualRow<T> {
  index: number;
  items: T[];
  top: number;
}

const getColumns = (width: number): number => {
  if (width >= 1280) return 4;
  if (width >= 860) return 3;
  if (width >= 560) return 2;
  return 1;
};

export const useVirtualRows = <T>(
  items: T[],
  rowHeight?: number,
  gap = 10,
  overscan = 4,
) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
    containerTop: 0,
    containerWidth: window.innerWidth,
  });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        setViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
          containerTop: rect ? rect.top + window.scrollY : 0,
          containerWidth: rect?.width || window.innerWidth,
        });
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  return useMemo(() => {
    const columns = getColumns(viewport.containerWidth || viewport.width);
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += columns) {
      rows.push(items.slice(index, index + columns));
    }

    const measuredRowHeight = Math.max(
      180,
      (viewport.containerWidth - gap * Math.max(0, columns - 1)) / columns,
    );
    const resolvedRowHeight = rowHeight ?? measuredRowHeight;
    const stride = resolvedRowHeight + gap;
    const totalHeight = rows.length
      ? rows.length * resolvedRowHeight + (rows.length - 1) * gap
      : 0;
    const start = Math.max(
      0,
      Math.floor((viewport.scrollY - viewport.containerTop) / stride) -
        overscan,
    );
    const end = Math.min(
      rows.length,
      Math.ceil(
        (viewport.scrollY + viewport.height - viewport.containerTop + gap) /
          stride,
      ) + overscan,
    );
    return {
      columns,
      containerRef,
      totalHeight,
      rows: rows.slice(start, end).map((row, offset) => ({
        index: start + offset,
        items: row,
        top: (start + offset) * stride,
      })) as VirtualRow<T>[],
    };
  }, [gap, items, overscan, rowHeight, viewport]);
};
