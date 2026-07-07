import { useEffect, useMemo, useState } from "react";

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
  rowHeight: number,
  gap = 20,
  overscan = 4,
) => {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
  });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
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
    const columns = getColumns(viewport.width);
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += columns)
      rows.push(items.slice(index, index + columns));
    const stride = rowHeight + gap;
    const topOffset = 260;
    const start = Math.max(
      0,
      Math.floor((viewport.scrollY - topOffset) / stride) - overscan,
    );
    const end = Math.min(
      rows.length,
      Math.ceil((viewport.scrollY + viewport.height - topOffset) / stride) +
        overscan,
    );
    return {
      columns,
      totalHeight: rows.length * stride,
      rows: rows.slice(start, end).map((row, offset) => ({
        index: start + offset,
        items: row,
        top: (start + offset) * stride,
      })) as VirtualRow<T>[],
    };
  }, [gap, items, overscan, rowHeight, viewport]);
};
